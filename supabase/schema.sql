-- =====================================================================
-- ESTÚDIO · ORÇAMENTOS — SCHEMA SUPABASE
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.
-- =====================================================================

-- ---------- ENUMS ----------
create type user_role as enum ('admin', 'atendente', 'visualizacao');

create type budget_status as enum (
  'novo', 'analise', 'aguardando_cliente', 'aprovado', 'agendado', 'finalizado', 'perdido'
);

create type complexidade_nivel as enum ('baixa', 'media', 'alta');

-- ---------- PROFILES (1 linha por usuário, espelha auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role user_role not null default 'atendente',
  created_at timestamptz not null default now()
);

-- ---------- TABELA DE PREÇOS BASE (por região) ----------
create table public.price_table (
  id uuid primary key default gen_random_uuid(),
  regiao text not null unique,
  valor_base numeric(10,2) not null default 0,
  tempo_base_horas numeric(5,2) not null default 2,
  updated_at timestamptz not null default now()
);

-- ---------- CONFIGURAÇÕES GERAIS (linha única) ----------
create table public.settings (
  id int primary key default 1,
  valor_minimo numeric(10,2) not null default 150,
  valor_hora numeric(10,2) not null default 180,
  sinal_percentual numeric(5,2) not null default 30,
  mult_complexidade_baixa numeric(4,2) not null default 0.85,
  mult_complexidade_media numeric(4,2) not null default 1.00,
  mult_complexidade_alta numeric(4,2) not null default 1.20,
  adicional_cobertura numeric(10,2) not null default 50,
  taxa_criacao_sim numeric(10,2) not null default 80,
  taxa_criacao_adaptar numeric(10,2) not null default 40,
  taxa_criacao_nao numeric(10,2) not null default 0,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into public.settings (id) values (1);

-- ---------- CLIENTES ----------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp text,
  instagram text,
  cidade text,
  origem text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- ORÇAMENTOS ----------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,

  ideia text,
  estilo text,
  regiao text not null,
  tamanho text,
  cor text,
  complexidade complexidade_nivel not null default 'media',
  tattoo_antiga text default 'Não',
  autoral text default 'Não',

  valor_base numeric(10,2) not null default 0,
  multiplicador numeric(4,2) not null default 1,
  valor_sugerido numeric(10,2) not null default 0,
  valor_final numeric(10,2) not null default 0,
  valor_sinal numeric(10,2) not null default 0,
  tempo_estimado numeric(5,2) not null default 0,
  num_sessoes int not null default 1,

  motivo_ajuste text,

  obs_internas text,
  referencias text,

  status budget_status not null default 'novo',

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- HISTÓRICO DE STATUS ----------
create table public.status_history (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  old_status budget_status,
  new_status budget_status not null,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);

-- ---------- AJUSTES MANUAIS (auditoria de valor) ----------
create table public.manual_adjustments (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  valor_original numeric(10,2) not null,
  valor_ajustado numeric(10,2) not null,
  diferenca_valor numeric(10,2) not null,
  diferenca_percentual numeric(6,2) not null,
  motivo text,
  adjusted_by uuid references public.profiles(id),
  adjusted_at timestamptz not null default now()
);

-- ---------- HISTÓRICO GERAL DE ALTERAÇÕES (qualquer campo) ----------
create table public.change_log (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  field_name text not null,
  old_value text,
  new_value text,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);

-- ---------- TRIGGER: updated_at automático ----------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_budgets_updated_at
before update on public.budgets
for each row execute function public.set_updated_at();

-- ---------- TRIGGER: cria profile automaticamente ao cadastrar usuário ----------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'atendente')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.price_table enable row level security;
alter table public.settings enable row level security;
alter table public.clients enable row level security;
alter table public.budgets enable row level security;
alter table public.status_history enable row level security;
alter table public.manual_adjustments enable row level security;
alter table public.change_log enable row level security;

-- helper: pega a role do usuário logado
create or replace function public.current_role()
returns user_role as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer;

-- PROFILES: todo usuário autenticado pode ver a lista (para atribuir responsáveis);
-- só admin edita; cada um edita o próprio nome.
create policy "profiles_select_all_auth" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles_update_self_or_admin" on public.profiles
  for update using (auth.uid() = id or public.current_role() = 'admin');
create policy "profiles_admin_insert" on public.profiles
  for insert with check (public.current_role() = 'admin' or auth.uid() = id);
create policy "profiles_admin_delete" on public.profiles
  for delete using (public.current_role() = 'admin');

-- PRICE TABLE & SETTINGS: todos autenticados leem; só admin edita.
create policy "price_table_select" on public.price_table for select using (auth.role() = 'authenticated');
create policy "price_table_admin_write" on public.price_table for all
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

create policy "settings_select" on public.settings for select using (auth.role() = 'authenticated');
create policy "settings_admin_write" on public.settings for update
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- CLIENTS: leitura para todos autenticados; escrita para admin/atendente.
create policy "clients_select" on public.clients for select using (auth.role() = 'authenticated');
create policy "clients_write" on public.clients for insert
  with check (public.current_role() in ('admin','atendente'));
create policy "clients_update" on public.clients for update
  using (public.current_role() in ('admin','atendente'));
create policy "clients_delete" on public.clients for delete
  using (public.current_role() = 'admin');

-- BUDGETS: leitura para todos autenticados; escrita para admin/atendente; exclusão só admin.
create policy "budgets_select" on public.budgets for select using (auth.role() = 'authenticated');
create policy "budgets_insert" on public.budgets for insert
  with check (public.current_role() in ('admin','atendente'));
create policy "budgets_update" on public.budgets for update
  using (public.current_role() in ('admin','atendente'));
create policy "budgets_delete" on public.budgets for delete
  using (public.current_role() = 'admin');

-- HISTÓRICOS: leitura para todos autenticados; inserção para admin/atendente; sem update/delete (auditoria imutável).
create policy "status_history_select" on public.status_history for select using (auth.role() = 'authenticated');
create policy "status_history_insert" on public.status_history for insert
  with check (public.current_role() in ('admin','atendente'));

create policy "manual_adjustments_select" on public.manual_adjustments for select using (auth.role() = 'authenticated');
create policy "manual_adjustments_insert" on public.manual_adjustments for insert
  with check (public.current_role() in ('admin','atendente'));

create policy "change_log_select" on public.change_log for select using (auth.role() = 'authenticated');
create policy "change_log_insert" on public.change_log for insert
  with check (public.current_role() in ('admin','atendente'));

-- =====================================================================
-- DADOS INICIAIS: tabela de preços base (exemplo do briefing)
-- =====================================================================
insert into public.price_table (regiao, valor_base, tempo_base_horas) values
  ('Mão', 600, 1.5),
  ('Antebraço externo', 1200, 2.5),
  ('Antebraço interno', 1500, 2),
  ('Bíceps', 1200, 2.5),
  ('Ombro', 1300, 2.5),
  ('Braço completo', 3500, 6),
  ('Braço externo', 1600, 3),
  ('Braço interno', 1700, 3),
  ('Perna completa', 4500, 8),
  ('Panturrilha lateral', 1600, 3),
  ('Coxa lateral', 2000, 4),
  ('Perna interna', 1900, 3.5),
  ('Perna externa', 1900, 3.5),
  ('Peito (um lado)', 1700, 3),
  ('Peitoral completo', 2800, 5),
  ('Costas (completo)', 4500, 8),
  ('Frase centro das costas', 500, 1),
  ('Aréolas', 900, 1.5)
on conflict (regiao) do nothing;

-- Lembrete: para criar o primeiro administrador, cadastre-se normalmente pela
-- tela de login (Supabase Auth) e depois rode:
-- update public.profiles set role = 'admin' where email = 'seuemail@exemplo.com';
