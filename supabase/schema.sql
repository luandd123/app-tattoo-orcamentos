-- =====================================================================
-- ESTÚDIO · ORÇAMENTOS — SCHEMA v3 (multiusuário + IA)
-- Idempotente: pode rodar várias vezes sem erro.
--
-- Novidades v3:
-- 1. Dados completamente isolados por usuário (RLS por created_by / user_id).
-- 2. user_settings e user_price_table individuais por usuário.
-- 3. ai_playbooks, ai_suggestions, ai_usage para o assistente de IA.
-- 4. handle_new_user() cria automaticamente settings + price_table + playbook.
-- 5. Tabelas globais (settings, price_table) mantidas apenas como referência
--    de valores padrão — não são mais usadas pelo front.
-- =====================================================================

-- =====================================================================
-- RESET OPCIONAL (descomente se quiser começar do zero)
-- =====================================================================
-- drop trigger if exists trg_on_auth_user_created on auth.users;
-- drop table if exists public.ai_usage cascade;
-- drop table if exists public.ai_suggestions cascade;
-- drop table if exists public.ai_playbooks cascade;
-- drop table if exists public.change_log cascade;
-- drop table if exists public.manual_adjustments cascade;
-- drop table if exists public.status_history cascade;
-- drop table if exists public.budgets cascade;
-- drop table if exists public.clients cascade;
-- drop table if exists public.user_price_table cascade;
-- drop table if exists public.user_settings cascade;
-- drop table if exists public.price_table cascade;
-- drop table if exists public.settings cascade;
-- drop table if exists public.profiles cascade;
-- drop function if exists public.handle_new_user() cascade;
-- drop function if exists public.set_updated_at() cascade;
-- drop function if exists public.get_my_role() cascade;

-- =====================================================================
-- TABELAS GLOBAIS (mantidas para não quebrar dados existentes)
-- Novos usuários não as usam mais — usam user_settings / user_price_table
-- =====================================================================
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
  constraint settings_single_row check (id = 1)
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.price_table (
  id uuid primary key default gen_random_uuid(),
  regiao text not null unique,
  valor_base numeric(10,2) not null default 0,
  tempo_base_horas numeric(5,2) not null default 2,
  updated_at timestamptz not null default now()
);
insert into public.price_table (regiao, valor_base, tempo_base_horas) values
  ('Mão', 600, 1.5), ('Antebraço externo', 1200, 2.5), ('Antebraço interno', 1500, 2),
  ('Bíceps', 1200, 2.5), ('Ombro', 1300, 2.5), ('Braço completo', 3500, 6),
  ('Braço externo', 1600, 3), ('Braço interno', 1700, 3), ('Perna completa', 4500, 8),
  ('Panturrilha lateral', 1600, 3), ('Coxa lateral', 2000, 4),
  ('Perna interna', 1900, 3.5), ('Perna externa', 1900, 3.5),
  ('Peito (um lado)', 1700, 3), ('Peitoral completo', 2800, 5),
  ('Costas (completo)', 4500, 8), ('Frase centro das costas', 500, 1), ('Aréolas', 900, 1.5)
on conflict (regiao) do nothing;

-- =====================================================================
-- PROFILES
-- =====================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'attendant' check (role in ('admin','attendant','viewer')),
  created_at timestamptz not null default now()
);

-- =====================================================================
-- CONFIGURAÇÕES INDIVIDUAIS POR USUÁRIO
-- =====================================================================
create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- TABELA DE PREÇOS INDIVIDUAL
create table if not exists public.user_price_table (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  regiao text not null,
  valor_base numeric(10,2) not null default 0,
  tempo_base_horas numeric(5,2) not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, regiao)
);

-- =====================================================================
-- CLIENTES (isolados por created_by)
-- =====================================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp text,
  instagram text,
  cidade text,
  origem text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- ORÇAMENTOS (isolados por created_by)
-- =====================================================================
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
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- HISTÓRICOS (vinculados ao dono do orçamento via budget.created_by)
-- =====================================================================
create table if not exists public.status_history (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references auth.users(id),
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
  adjusted_by uuid references auth.users(id),
  adjusted_at timestamptz not null default now()
);

create table if not exists public.change_log (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  field_name text not null,
  old_value text,
  new_value text,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

-- =====================================================================
-- PLAYBOOKS DE ATENDIMENTO (por usuário)
-- =====================================================================
create table if not exists public.ai_playbooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- SUGESTÕES DA IA (por usuário + orçamento)
-- =====================================================================
create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  client_message text not null,
  ai_response text not null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- CONTROLE DE USO DA IA (por usuário + mês)
-- =====================================================================
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,   -- formato 'YYYY-MM'
  suggestions_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

-- =====================================================================
-- UPDATED_AT TRIGGER
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_budgets_updated_at on public.budgets;
create trigger trg_budgets_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();

drop trigger if exists trg_user_settings_updated_at on public.user_settings;
create trigger trg_user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

drop trigger if exists trg_user_price_table_updated_at on public.user_price_table;
create trigger trg_user_price_table_updated_at before update on public.user_price_table
  for each row execute function public.set_updated_at();

drop trigger if exists trg_ai_playbooks_updated_at on public.ai_playbooks;
create trigger trg_ai_playbooks_updated_at before update on public.ai_playbooks
  for each row execute function public.set_updated_at();

drop trigger if exists trg_ai_usage_updated_at on public.ai_usage;
create trigger trg_ai_usage_updated_at before update on public.ai_usage
  for each row execute function public.set_updated_at();

-- =====================================================================
-- PLAYBOOK PADRÃO DO SISTEMA (conteúdo A.P.P.L.E)
-- =====================================================================
-- Armazenado como constante no código (não no banco) para evitar dados globais.
-- O handle_new_user() copia-o para cada novo usuário.

-- =====================================================================
-- FUNÇÃO HELPER: papel do usuário logado
-- =====================================================================
create or replace function public.get_my_role()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

-- =====================================================================
-- TRIGGER: handle_new_user
-- Cria profile + user_settings + user_price_table + playbook padrão
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger as $$
declare
  apple_playbook text := $PLAYBOOK$BASE DE ATENDIMENTO COM IA — MÉTODO A.P.P.L.E PARA TATUADORES

Objetivo: Gerar respostas prontas para WhatsApp, ajudando o atendente/tatuador a responder clientes de forma humana, segura, consultiva e estratégica.

A resposta deve sempre:
- Ser natural, como uma conversa real de WhatsApp.
- Ter tom acolhedor, profissional e direto.
- Usar as informações disponíveis no orçamento.
- Nunca inventar valores, prazos, regiões, estilos ou condições.
- Sempre terminar com uma pergunta para estimular o cliente a responder.

MÉTODO A.P.P.L.E:

A — ACOLHER O CLIENTE
Comece validando o interesse do cliente. Exemplos: "Oii, tudo bem? Vi sua ideia e achei bem interessante." / "Entendi sua ideia! Dá pra seguir por um caminho bem bonito."
Evite: "Valor é X." / "Manda referência." / "Depende."

P — PERGUNTAR / PROCURAR ENTENDER MELHOR
Se faltar informação sobre região, tamanho, estilo, cor, cobertura ou autoral, peça de forma leve.
Exemplos: "Pra eu conseguir te passar algo mais certinho, você consegue me mandar uma foto da região?" / "Você pensa em algo mais delicado ou mais preenchido?"

P — PROPOR O CAMINHO / POSICIONAR O ORÇAMENTO
Se houver valor: apresente com segurança, explique o que influencia no valor, informe o sinal.
Exemplos: "Pelo que você me mandou, esse projeto ficaria em torno de R$ [valor]." / "Para reservar o horário, trabalhamos com um sinal de R$ [sinal], que já fica abatido do valor final."
Se não houver valor: "Pra não te passar um valor no chute, preciso só confirmar alguns detalhes antes."

L — LIDAR COM OBJEÇÕES
Se cliente achar caro: "Esse valor leva em conta o tamanho, tempo de execução, detalhes da arte e cuidado para cicatrizar bonita."
Se pedir desconto: "Consigo entender. O caminho seria adaptar o tamanho ou reduzir alguns detalhes, para manter a qualidade."
Nunca desvalorizar o trabalho. Nunca dar desconto automaticamente.

E — ENCAMINHAR PARA A PRÓXIMA AÇÃO
Toda resposta deve terminar com uma pergunta clara.
Exemplos: "Faz sentido pra você seguir com essa ideia?" / "Você quer que eu veja uma data disponível?" / "Você tem preferência por dia de semana ou fim de semana?"

REGRAS SOBRE PREÇO:
- Usar o valor salvo no orçamento.
- Não arredondar sem autorização.
- Não oferecer desconto automaticamente.
- Se cliente pedir desconto: sugerir adaptação de tamanho ou detalhes.

REGRAS SOBRE AGENDA:
- Não inventar horários disponíveis.
- Perguntar a preferência do cliente.

TOM DE VOZ: humano, acolhedor, confiante, profissional, levemente consultivo.
Evitar: "imperdível", "promoção", excesso de emoji, frases muito longas.
Emoji com moderação (máx 1-2): ✨, 😊, 🖤

INSTRUÇÃO FINAL: Gere apenas a mensagem final pronta para enviar. Não explique o raciocínio. Não use títulos. Não invente dados. Sempre termine com uma pergunta.$PLAYBOOK$;
begin
  begin
    -- profile
    insert into public.profiles (id, name, email, role)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1),''),
      coalesce(new.email,''),
      'attendant'
    )
    on conflict (id) do update
      set name  = coalesce(nullif(excluded.name,''),  public.profiles.name),
          email = coalesce(nullif(excluded.email,''), public.profiles.email);

    -- user_settings (valores padrão)
    insert into public.user_settings (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    -- user_price_table (cópia da tabela global)
    insert into public.user_price_table (user_id, regiao, valor_base, tempo_base_horas)
    select new.id, regiao, valor_base, tempo_base_horas
    from public.price_table
    on conflict (user_id, regiao) do nothing;

    -- playbook padrão A.P.P.L.E
    insert into public.ai_playbooks (user_id, title, content, active)
    values (new.id, 'Método A.P.P.L.E', apple_playbook, true)
    on conflict do nothing;

  exception when others then
    raise warning 'handle_new_user: erro para %: %', new.id, sqlerrm;
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
alter table public.profiles           enable row level security;
alter table public.settings           enable row level security;
alter table public.price_table        enable row level security;
alter table public.user_settings      enable row level security;
alter table public.user_price_table   enable row level security;
alter table public.clients            enable row level security;
alter table public.budgets            enable row level security;
alter table public.status_history     enable row level security;
alter table public.manual_adjustments enable row level security;
alter table public.change_log         enable row level security;
alter table public.ai_playbooks       enable row level security;
alter table public.ai_suggestions     enable row level security;
alter table public.ai_usage           enable row level security;

-- ---- helpers ----
-- profiles: cada um lê o próprio; admin lê todos
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id or public.get_my_role() = 'admin');

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id or public.get_my_role() = 'admin');

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_delete" on public.profiles;
create policy "profiles_delete" on public.profiles
  for delete using (public.get_my_role() = 'admin');

-- ---- settings global (leitura por autenticados, escrita admin) ----
drop policy if exists "settings_select" on public.settings;
create policy "settings_select" on public.settings for select using (auth.role() = 'authenticated');

drop policy if exists "settings_admin_write" on public.settings;
create policy "settings_admin_write" on public.settings for update
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

-- ---- price_table global (leitura por autenticados, escrita admin) ----
drop policy if exists "price_table_select" on public.price_table;
create policy "price_table_select" on public.price_table for select using (auth.role() = 'authenticated');

drop policy if exists "price_table_admin_write" on public.price_table;
create policy "price_table_admin_write" on public.price_table for all
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

-- ---- user_settings: cada usuário só acessa os próprios ----
drop policy if exists "user_settings_select" on public.user_settings;
create policy "user_settings_select" on public.user_settings
  for select using (auth.uid() = user_id);

drop policy if exists "user_settings_insert" on public.user_settings;
create policy "user_settings_insert" on public.user_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_settings_update" on public.user_settings;
create policy "user_settings_update" on public.user_settings
  for update using (auth.uid() = user_id);

drop policy if exists "user_settings_delete" on public.user_settings;
create policy "user_settings_delete" on public.user_settings
  for delete using (auth.uid() = user_id);

-- ---- user_price_table: cada usuário só acessa as próprias linhas ----
drop policy if exists "user_price_table_select" on public.user_price_table;
create policy "user_price_table_select" on public.user_price_table
  for select using (auth.uid() = user_id);

drop policy if exists "user_price_table_insert" on public.user_price_table;
create policy "user_price_table_insert" on public.user_price_table
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_price_table_update" on public.user_price_table;
create policy "user_price_table_update" on public.user_price_table
  for update using (auth.uid() = user_id);

drop policy if exists "user_price_table_delete" on public.user_price_table;
create policy "user_price_table_delete" on public.user_price_table
  for delete using (auth.uid() = user_id);

-- ---- clients: cada usuário só acessa os próprios ----
drop policy if exists "clients_select" on public.clients;
create policy "clients_select" on public.clients
  for select using (auth.uid() = created_by);

drop policy if exists "clients_insert" on public.clients;
create policy "clients_insert" on public.clients
  for insert with check (auth.uid() = created_by);

drop policy if exists "clients_update" on public.clients;
create policy "clients_update" on public.clients
  for update using (auth.uid() = created_by);

drop policy if exists "clients_delete" on public.clients;
create policy "clients_delete" on public.clients
  for delete using (auth.uid() = created_by);

-- ---- budgets: cada usuário só acessa os próprios ----
drop policy if exists "budgets_select" on public.budgets;
create policy "budgets_select" on public.budgets
  for select using (auth.uid() = created_by);

drop policy if exists "budgets_insert" on public.budgets;
create policy "budgets_insert" on public.budgets
  for insert with check (auth.uid() = created_by);

drop policy if exists "budgets_update" on public.budgets;
create policy "budgets_update" on public.budgets
  for update using (auth.uid() = created_by);

drop policy if exists "budgets_delete" on public.budgets;
create policy "budgets_delete" on public.budgets
  for delete using (auth.uid() = created_by);

-- ---- status_history: acessa via budgets do próprio usuário ----
drop policy if exists "status_history_select" on public.status_history;
create policy "status_history_select" on public.status_history
  for select using (
    exists (select 1 from public.budgets b where b.id = budget_id and b.created_by = auth.uid())
  );

drop policy if exists "status_history_insert" on public.status_history;
create policy "status_history_insert" on public.status_history
  for insert with check (
    exists (select 1 from public.budgets b where b.id = budget_id and b.created_by = auth.uid())
  );

-- ---- manual_adjustments: acessa via budgets do próprio usuário ----
drop policy if exists "manual_adjustments_select" on public.manual_adjustments;
create policy "manual_adjustments_select" on public.manual_adjustments
  for select using (
    exists (select 1 from public.budgets b where b.id = budget_id and b.created_by = auth.uid())
  );

drop policy if exists "manual_adjustments_insert" on public.manual_adjustments;
create policy "manual_adjustments_insert" on public.manual_adjustments
  for insert with check (
    exists (select 1 from public.budgets b where b.id = budget_id and b.created_by = auth.uid())
  );

-- ---- change_log ----
drop policy if exists "change_log_select" on public.change_log;
create policy "change_log_select" on public.change_log
  for select using (
    exists (select 1 from public.budgets b where b.id = budget_id and b.created_by = auth.uid())
  );

drop policy if exists "change_log_insert" on public.change_log;
create policy "change_log_insert" on public.change_log
  for insert with check (
    exists (select 1 from public.budgets b where b.id = budget_id and b.created_by = auth.uid())
  );

-- ---- ai_playbooks: cada usuário só acessa os próprios ----
drop policy if exists "ai_playbooks_select" on public.ai_playbooks;
create policy "ai_playbooks_select" on public.ai_playbooks
  for select using (auth.uid() = user_id);

drop policy if exists "ai_playbooks_insert" on public.ai_playbooks;
create policy "ai_playbooks_insert" on public.ai_playbooks
  for insert with check (auth.uid() = user_id);

drop policy if exists "ai_playbooks_update" on public.ai_playbooks;
create policy "ai_playbooks_update" on public.ai_playbooks
  for update using (auth.uid() = user_id);

drop policy if exists "ai_playbooks_delete" on public.ai_playbooks;
create policy "ai_playbooks_delete" on public.ai_playbooks
  for delete using (auth.uid() = user_id);

-- ---- ai_suggestions: cada usuário só acessa as próprias ----
drop policy if exists "ai_suggestions_select" on public.ai_suggestions;
create policy "ai_suggestions_select" on public.ai_suggestions
  for select using (auth.uid() = user_id);

drop policy if exists "ai_suggestions_insert" on public.ai_suggestions;
create policy "ai_suggestions_insert" on public.ai_suggestions
  for insert with check (auth.uid() = user_id);

drop policy if exists "ai_suggestions_delete" on public.ai_suggestions;
create policy "ai_suggestions_delete" on public.ai_suggestions
  for delete using (auth.uid() = user_id);

-- ---- ai_usage: cada usuário só acessa o próprio ----
drop policy if exists "ai_usage_select" on public.ai_usage;
create policy "ai_usage_select" on public.ai_usage
  for select using (auth.uid() = user_id);

drop policy if exists "ai_usage_insert" on public.ai_usage;
create policy "ai_usage_insert" on public.ai_usage
  for insert with check (auth.uid() = user_id);

drop policy if exists "ai_usage_update" on public.ai_usage;
create policy "ai_usage_update" on public.ai_usage
  for update using (auth.uid() = user_id);

-- =====================================================================
-- GRANTs para o role 'authenticated' (necessários quando RLS está ativo)
-- =====================================================================
grant select, insert, update, delete on public.profiles           to authenticated;
grant select, insert, update, delete on public.user_settings      to authenticated;
grant select, insert, update, delete on public.user_price_table   to authenticated;
grant select, insert, update, delete on public.clients            to authenticated;
grant select, insert, update, delete on public.budgets            to authenticated;
grant select, insert, update, delete on public.status_history     to authenticated;
grant select, insert, update, delete on public.manual_adjustments to authenticated;
grant select, insert, update, delete on public.change_log         to authenticated;
grant select, insert, update, delete on public.ai_playbooks       to authenticated;
grant select, insert, update, delete on public.ai_suggestions     to authenticated;
grant select, insert, update, delete on public.ai_usage           to authenticated;
grant select                         on public.settings           to authenticated;
grant select                         on public.price_table        to authenticated;
grant execute on function public.get_my_role()    to authenticated;
grant execute on function public.set_updated_at() to authenticated;

-- =====================================================================
-- BACKFILL: usuários existentes sem profile / settings / price_table
-- =====================================================================
insert into public.profiles (id, name, email, role)
select u.id,
       coalesce(nullif(u.raw_user_meta_data->>'name',''), split_part(u.email,'@',1),''),
       coalesce(u.email,''),
       'attendant'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

insert into public.user_settings (user_id)
select id from auth.users
where not exists (select 1 from public.user_settings s where s.user_id = id)
on conflict (user_id) do nothing;

insert into public.user_price_table (user_id, regiao, valor_base, tempo_base_horas)
select u.id, pt.regiao, pt.valor_base, pt.tempo_base_horas
from auth.users u cross join public.price_table pt
where not exists (
  select 1 from public.user_price_table up where up.user_id = u.id and up.regiao = pt.regiao
)
on conflict (user_id, regiao) do nothing;

-- =====================================================================
-- Lembrete: para promover um admin:
--   update public.profiles set role = 'admin' where email = 'seuemail@exemplo.com';
-- =====================================================================
