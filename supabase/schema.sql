-- =====================================================================
-- ESTÚDIO · ORÇAMENTOS — SCHEMA SUPABASE (v2 — idempotente)
-- Pode rodar este arquivo várias vezes sem erro: ele usa
-- IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE em tudo.
--
-- Mudanças importantes desta versão:
-- 1. role deixou de ser ENUM e virou TEXT + CHECK ('admin','attendant','viewer').
--    Enums são frágeis em scripts que rodam mais de uma vez (erro
--    "type already exists") e causavam falha ao criar usuário quando o
--    valor vindo do metadata não batia exatamente com o enum.
-- 2. A função que checava o papel do usuário se chamava "current_role()",
--    que é uma palavra reservada do Postgres — foi renomeada para
--    public.get_my_role() para evitar qualquer ambiguidade.
-- 3. handle_new_user() agora SEMPRE define role = 'attendant' para novos
--    cadastros (nunca confia em valor enviado pelo cliente — evita que
--    alguém se autopromova a admin no signup) e nunca derruba a criação
--    do usuário em auth.users mesmo se algo no perfil falhar.
-- =====================================================================

-- =====================================================================
-- ⚠️ RESET OPCIONAL — só rode isto se você já tinha rodado uma versão
-- ANTERIOR deste schema (com tipos ENUM user_role / budget_status /
-- complexidade_nivel) e ainda não tem orçamentos reais cadastrados.
-- Descomente o bloco abaixo, rode, e depois rode o resto do arquivo.
-- Isso apaga as tabelas do sistema (não mexe em auth.users, seus
-- usuários de login continuam existindo).
-- =====================================================================
-- drop trigger if exists trg_on_auth_user_created on auth.users;
-- drop table if exists public.change_log cascade;
-- drop table if exists public.manual_adjustments cascade;
-- drop table if exists public.status_history cascade;
-- drop table if exists public.budgets cascade;
-- drop table if exists public.clients cascade;
-- drop table if exists public.settings cascade;
-- drop table if exists public.price_table cascade;
-- drop table if exists public.profiles cascade;
-- drop function if exists public.handle_new_user() cascade;
-- drop function if exists public.set_updated_at() cascade;
-- drop function if exists public.current_role() cascade;
-- drop function if exists public.get_my_role() cascade;
-- drop type if exists user_role cascade;
-- drop type if exists budget_status cascade;
-- drop type if exists complexidade_nivel cascade;
-- =====================================================================

-- ---------- TABELAS (idempotentes) ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'attendant' check (role in ('admin','attendant','viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.price_table (
  id uuid primary key default gen_random_uuid(),
  regiao text not null unique,
  valor_base numeric(10,2) not null default 0,
  tempo_base_horas numeric(5,2) not null default 2,
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
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
insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp text,
  instagram text,
  cidade text,
  origem text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,

  ideia text,
  estilo text,
  regiao text not null,
  tamanho text,
  cor text,
  complexidade text not null default 'media' check (complexidade in ('baixa','media','alta')),
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

  status text not null default 'novo' check (status in (
    'novo','analise','aguardando_cliente','aprovado','agendado','finalizado','perdido'
  )),

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.status_history (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);

create table if not exists public.manual_adjustments (
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

create table if not exists public.change_log (
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

drop trigger if exists trg_budgets_updated_at on public.budgets;
create trigger trg_budgets_updated_at
before update on public.budgets
for each row execute function public.set_updated_at();

-- =====================================================================
-- TRIGGER: cria/atualiza o profile automaticamente ao cadastrar usuário
-- =====================================================================
-- Robusta de propósito:
--   * nunca confia em "role" vindo do metadata do cliente (sempre 'attendant')
--   * usa coalesce para nome e e-mail, nunca deixa NULL quebrar a inserção
--   * on conflict (id) do update, então rodar o cadastro de novo (ou já ter
--     um profile manual com o mesmo id) nunca quebra
--   * todo o corpo está dentro de um BEGIN/EXCEPTION: se algo inesperado
--     acontecer aqui, o erro vira um WARNING no log e a criação do usuário
--     em auth.users segue normalmente (nunca mais "Database error creating
--     new user" por causa do profile)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  begin
    insert into public.profiles (id, name, email, role)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1), ''),
      coalesce(new.email, ''),
      'attendant'
    )
    on conflict (id) do update
      set name = coalesce(nullif(excluded.name, ''), public.profiles.name),
          email = coalesce(nullif(excluded.email, ''), public.profiles.email);
  exception when others then
    raise warning 'handle_new_user: falha ao criar/atualizar profile para %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_on_auth_user_created on auth.users;
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

-- helper: papel do usuário logado. SECURITY DEFINER + search_path fixo
-- evita qualquer recursão de RLS (ela não reaplica a policy de profiles
-- ao consultar a própria tabela) e o nome evita colidir com a palavra
-- reservada "current_role" do Postgres.
create or replace function public.get_my_role()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

-- ---------- PROFILES ----------
drop policy if exists "profiles_select_all_auth" on public.profiles;
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles
  for select using (
    auth.uid() = id or public.get_my_role() = 'admin'
  );

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update using (auth.uid() = id or public.get_my_role() = 'admin');

drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_insert_self_or_admin" on public.profiles
  for insert with check (auth.uid() = id or public.get_my_role() = 'admin');

drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_delete" on public.profiles
  for delete using (public.get_my_role() = 'admin');

-- ---------- PRICE TABLE & SETTINGS ----------
drop policy if exists "price_table_select" on public.price_table;
create policy "price_table_select" on public.price_table for select using (auth.role() = 'authenticated');
drop policy if exists "price_table_admin_write" on public.price_table;
create policy "price_table_admin_write" on public.price_table for all
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

drop policy if exists "settings_select" on public.settings;
create policy "settings_select" on public.settings for select using (auth.role() = 'authenticated');
drop policy if exists "settings_admin_write" on public.settings;
create policy "settings_admin_write" on public.settings for update
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

-- ---------- CLIENTS ----------
drop policy if exists "clients_select" on public.clients;
create policy "clients_select" on public.clients for select using (auth.role() = 'authenticated');
drop policy if exists "clients_write" on public.clients;
create policy "clients_write" on public.clients for insert
  with check (public.get_my_role() in ('admin','attendant'));
drop policy if exists "clients_update" on public.clients;
create policy "clients_update" on public.clients for update
  using (public.get_my_role() in ('admin','attendant'));
drop policy if exists "clients_delete" on public.clients;
create policy "clients_delete" on public.clients for delete
  using (public.get_my_role() = 'admin');

-- ---------- BUDGETS ----------
drop policy if exists "budgets_select" on public.budgets;
create policy "budgets_select" on public.budgets for select using (auth.role() = 'authenticated');
drop policy if exists "budgets_insert" on public.budgets;
create policy "budgets_insert" on public.budgets for insert
  with check (public.get_my_role() in ('admin','attendant'));
drop policy if exists "budgets_update" on public.budgets;
create policy "budgets_update" on public.budgets for update
  using (public.get_my_role() in ('admin','attendant'));
drop policy if exists "budgets_delete" on public.budgets;
create policy "budgets_delete" on public.budgets for delete
  using (public.get_my_role() = 'admin');

-- ---------- HISTÓRICOS (leitura geral, escrita admin/attendant, imutáveis) ----------
drop policy if exists "status_history_select" on public.status_history;
create policy "status_history_select" on public.status_history for select using (auth.role() = 'authenticated');
drop policy if exists "status_history_insert" on public.status_history;
create policy "status_history_insert" on public.status_history for insert
  with check (public.get_my_role() in ('admin','attendant'));

drop policy if exists "manual_adjustments_select" on public.manual_adjustments;
create policy "manual_adjustments_select" on public.manual_adjustments for select using (auth.role() = 'authenticated');
drop policy if exists "manual_adjustments_insert" on public.manual_adjustments;
create policy "manual_adjustments_insert" on public.manual_adjustments for insert
  with check (public.get_my_role() in ('admin','attendant'));

drop policy if exists "change_log_select" on public.change_log;
create policy "change_log_select" on public.change_log for select using (auth.role() = 'authenticated');
drop policy if exists "change_log_insert" on public.change_log;
create policy "change_log_insert" on public.change_log for insert
  with check (public.get_my_role() in ('admin','attendant'));

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

-- =====================================================================
-- BACKFILL: usuários do Supabase Auth que ainda não têm profile
-- (cobre o caso de quem foi criado manualmente enquanto o trigger
-- estava desativado, ou criado antes desta correção)
-- =====================================================================
insert into public.profiles (id, name, email, role)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1), ''),
  coalesce(u.email, ''),
  'attendant'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- =====================================================================
-- Lembrete: para promover o primeiro administrador, rode (trocando o e-mail):
--   update public.profiles set role = 'admin' where email = 'seuemail@exemplo.com';
-- =====================================================================
