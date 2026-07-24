-- Etapa 0 · Tablas (dominio + operativas), en orden de dependencias.
-- Migración inicial limpia: se fusionan las definiciones v2 + v3 (no CREATE + ALTER).
-- Dinero: bigint en unidades menores, nunca float/numeric. Estados imposibles inexpresables.

-- ─────────────────────────────────────────────────────────────────────────
-- ESTRUCTURA (cambia cada varios meses; se gestiona solo desde la UI)
-- ─────────────────────────────────────────────────────────────────────────

-- Perfil: la zona horaria es dato de primera clase.
create table profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  timezone   text not null default 'America/Bogota',
  created_at timestamptz not null default now()
);

-- La raíz. Todo cuelga de un área. 'personal' es un área más.
create table areas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  kind        text not null check (kind in ('negocio','personal')),
  position    int  not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

create table income_sources (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  area_id    uuid not null references areas(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 120),
  model      text not null check (model in
             ('servicio','producto','suscripcion','empleo','inversion','otro')),
  status     text not null default 'active'
             check (status in ('active','paused','archived')),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table offerings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  income_source_id uuid not null references income_sources(id) on delete cascade,
  name             text not null,
  description      text,
  price_minor      bigint check (price_minor >= 0),   -- unidades menores, NUNCA float
  currency         char(3) not null default 'COP',
  unit             text not null default 'unidad',
  status           text not null default 'active'
                   check (status in ('active','paused','archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- "Cómo lo vendo" / "cómo lo entrego" = documentos con pasos (jsonb).
create table playbooks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  offering_id uuid not null references offerings(id) on delete cascade,
  kind        text not null check (kind in ('venta','entrega')),
  name        text not null,
  steps       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (offering_id, kind)
);

create table clients (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  area_id    uuid references areas(id) on delete set null,
  name       text not null,
  contact    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ─────────────────────────────────────────────────────────────────────────
-- MEDICIÓN
-- ─────────────────────────────────────────────────────────────────────────

create table goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  area_id          uuid references areas(id)          on delete cascade,
  income_source_id uuid references income_sources(id) on delete cascade,
  title            text not null,
  metric text not null check (metric in
         ('money_in','money_net','sales_won','tasks_done','manual')),
  target_value numeric(14,2) not null check (target_value > 0),
  currency     char(3),
  manual_value numeric(14,2) not null default 0,
  period_start date not null,
  period_end   date not null,
  status text not null default 'active'
         check (status in ('active','achieved','missed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint period_ordered      check (period_end >= period_start),
  constraint money_needs_currency check (
    metric not in ('money_in','money_net') or currency is not null)
);

-- ─────────────────────────────────────────────────────────────────────────
-- FLUJO (cambia varias veces al día; UI + agente + WhatsApp)
-- ─────────────────────────────────────────────────────────────────────────

-- Venta y entrega en un solo ciclo de vida.
create table sales (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  offering_id uuid not null references offerings(id) on delete restrict,
  client_id   uuid references clients(id) on delete set null,
  stage text not null default 'prospecto' check (stage in
        ('prospecto','propuesta','negociacion',
         'ganada','entregando','entregada','cobrada',
         'perdida')),
  amount_minor bigint  not null check (amount_minor >= 0),
  currency     char(3) not null default 'COP',
  expected_close date,
  closed_at      timestamptz,
  lost_reason    text,
  delivery_instantiated_at timestamptz,   -- guarda de idempotencia (ganar 2x no duplica)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint closed_consistency check (
    (stage in ('ganada','entregando','entregada','cobrada','perdida'))
    = (closed_at is not null)),
  constraint lost_has_reason check (stage <> 'perdida' or lost_reason is not null)
);
create index sales_open on sales (user_id, expected_close)
  where stage in ('prospecto','propuesta','negociacion');
create index sales_active_delivery on sales (user_id, updated_at desc)
  where stage in ('ganada','entregando');

-- Proyectos y tareas (v2 + columnas que la v3 añadía).
create table projects (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  goal_id          uuid references goals(id)          on delete set null,
  area_id          uuid references areas(id)          on delete restrict,
  income_source_id uuid references income_sources(id) on delete set null,
  sale_id          uuid references sales(id)          on delete set null,
  title      text not null check (length(btrim(title)) between 1 and 200),
  status     text not null default 'active'
             check (status in ('active','paused','archived','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_id   uuid references projects(id) on delete set null,
  title        text not null check (length(btrim(title)) between 1 and 200),
  notes        text check (length(notes) <= 5000),
  status       text not null default 'pending'
               check (status in ('pending','done','cancelled')),
  due_at       timestamptz,
  completed_at timestamptz,
  google_calendar_id text,
  google_event_id    text,
  origin             text check (origin in ('manual','agente','playbook')),
  origin_playbook_id uuid references playbooks(id) on delete set null,
  origin_step_index  int,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint task_calendar_pair check (
    (google_calendar_id is null) = (google_event_id is null)),
  constraint done_has_timestamp check (
    (status = 'done') = (completed_at is not null))
);
create index tasks_pending_due on tasks (user_id, due_at) where status = 'pending';
create index tasks_by_project  on tasks (user_id, project_id) where status <> 'cancelled';
create unique index tasks_google_event on tasks (google_calendar_id, google_event_id)
  where google_event_id is not null;

-- Finanzas: registro simple, no partida doble.
create table transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  area_id          uuid not null references areas(id) on delete restrict,
  income_source_id uuid references income_sources(id) on delete set null,
  sale_id          uuid references sales(id) on delete set null,
  direction    text    not null check (direction in ('in','out')),
  amount_minor bigint  not null check (amount_minor > 0),
  currency     char(3) not null default 'COP',
  base_amount_minor bigint not null check (base_amount_minor > 0),
  fx_rate      numeric(14,6) not null default 1,   -- se congela al registrar
  occurred_on date not null default current_date,
  category    text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint income_needs_source check (direction = 'out' or income_source_id is not null)
);
create index tx_period on transactions (user_id, occurred_on desc);
create index tx_income on transactions (user_id, income_source_id, occurred_on desc)
  where direction = 'in';

-- ─────────────────────────────────────────────────────────────────────────
-- OPERATIVAS
-- ─────────────────────────────────────────────────────────────────────────

-- Ingesta durable.
create table inbox (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  channel     text not null,
  external_id text not null,
  payload     jsonb not null,
  status      text not null default 'pending'
              check (status in ('pending','processing','done','failed')),
  attempts    int not null default 0,
  last_error  text,
  received_at timestamptz not null default now(),
  claimed_at  timestamptz,
  unique (channel, external_id)          -- deduplicación por constraint
);
create index inbox_queue on inbox (received_at) where status in ('pending','processing');

-- Idempotencia del agente.
create table tool_executions (
  tool_call_id text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  action       text not null,
  result       jsonb,
  created_at   timestamptz not null default now()
);

-- Confirmación de operaciones destructivas.
create table pending_actions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid,
  action          text not null,
  args            jsonb not null,
  expires_at      timestamptz not null default now() + interval '10 minutes',
  consumed_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- Circuit breaker de costo.
create table usage_budget (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  period         date not null default date_trunc('month', now())::date,
  input_tokens   bigint  not null default 0,
  output_tokens  bigint  not null default 0,
  usd_spent      numeric(10,4) not null default 0,
  limit_usd      numeric(10,2) not null default 25,
  writes_today   int not null default 0,
  writes_date    date not null default current_date
);

-- Credenciales externas cifradas en la aplicación antes del INSERT.
create table integrations (
  user_id                 uuid not null references auth.users(id) on delete cascade,
  provider                text not null,
  encrypted_refresh_token bytea not null,
  scopes                  text[] not null,
  expires_at              timestamptz,
  primary key (user_id, provider)
);

create table conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  channel    text not null,
  started_at timestamptz not null default now(),
  last_at    timestamptz not null default now()
);

create table messages (
  id              bigserial primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('user','assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);
create index messages_recent on messages (conversation_id, created_at desc);

-- Registro de auditoría (lo escriben triggers; inmutable por trigger).
create table audit_log (
  id              bigserial primary key,
  occurred_at     timestamptz not null default now(),
  user_id         uuid not null,
  actor           text not null,        -- user | agent | system
  channel         text,
  conversation_id uuid,
  action          text not null,        -- 'tasks.update', 'goals.delete', ...
  entity_type     text not null,
  entity_id       uuid,
  before          jsonb,
  after           jsonb,
  tool_call_id    text,
  outcome         text not null default 'ok'
);
create index audit_by_entity on audit_log (entity_type, entity_id, occurred_at desc);
create index audit_recent    on audit_log (user_id, occurred_at desc);
