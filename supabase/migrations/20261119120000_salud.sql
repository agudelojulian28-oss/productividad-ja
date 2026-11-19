-- Salud: plan personal (entrenamiento, dieta, cuerpo, espiritual) + check-ins diarios +
-- lista de mercado (cuyo total se sincroniza como UN gasto fijo en Finanzas).
-- Un solo usuario. Todo editable desde /salud y por el agente (verbos generales).

-- ── Plan: elementos jerárquicos (rutina → ejercicios, hora dorada → pasos) ──────
create table health_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  section       text not null check (section in ('entrenamiento', 'dieta', 'cuerpo', 'espiritual')),
  kind          text not null check (kind in
                  ('rutina', 'ejercicio', 'comida', 'salvavidas', 'tratamiento', 'compromiso', 'habito')),
  parent_id     uuid references health_items(id) on delete cascade,
  title         text not null check (char_length(btrim(title)) between 1 and 200),
  detail        text check (char_length(detail) <= 2000),
  time_of_day   time,                              -- hora (comidas, hábitos)
  duration_min  integer check (duration_min between 1 and 600),
  -- Días ISO (1=lunes … 7=domingo). NULL = todos los días.
  weekdays      smallint[] check (weekdays is null or (
                  cardinality(weekdays) between 1 and 7
                  and weekdays <@ array[1,2,3,4,5,6,7]::smallint[])),
  trackable     boolean not null default false,    -- aparece en el checklist diario
  needs_review  boolean not null default false,    -- transcripción dudosa: revisar
  sort_order    integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Un ejercicio nunca vive suelto: siempre cuelga de una rutina.
  constraint exercise_has_parent check (kind <> 'ejercicio' or parent_id is not null)
);
create index health_items_by_section on health_items (user_id, section, sort_order);
create index health_items_by_parent on health_items (parent_id) where parent_id is not null;

-- ── Check-ins diarios (marcar lo cumplido) ─────────────────────────────────────
create table health_checkins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_id    uuid not null references health_items(id) on delete cascade,
  day        date not null,
  created_at timestamptz not null default now(),
  unique (item_id, day)
);
create index health_checkins_by_day on health_checkins (user_id, day);

-- ── Lista de mercado ───────────────────────────────────────────────────────────
create table grocery_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  quantity    text check (char_length(quantity) <= 60),
  cost_minor  bigint not null default 0 check (cost_minor >= 0),
  frequency   text not null default 'semanal'
                check (frequency in ('semanal', 'quincenal', 'mensual', 'bimestral', 'trimestral', 'anual')),
  checked     boolean not null default false,      -- ya comprado en esta vuelta
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Ajustes del módulo (una fila por usuario) ──────────────────────────────────
create table health_settings (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references auth.users(id) on delete cascade,
  -- El gasto fijo "Mercado · dieta" en Finanzas y el proyecto al que se atribuye.
  grocery_recurring_id  uuid references recurring_expenses(id) on delete set null,
  grocery_project_id    uuid references projects(id) on delete set null,
  seeded_at             timestamptz,               -- ya se precargó el plan inicial
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── RLS (enable + force) con (select auth.uid()) ───────────────────────────────
alter table health_items    enable row level security;
alter table health_items    force  row level security;
alter table health_checkins enable row level security;
alter table health_checkins force  row level security;
alter table grocery_items   enable row level security;
alter table grocery_items   force  row level security;
alter table health_settings enable row level security;
alter table health_settings force  row level security;

create policy health_items_owner on health_items for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy health_checkins_owner on health_checkins for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy grocery_items_owner on grocery_items for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy health_settings_owner on health_settings for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── Auditoría (trigger) + updated_at ───────────────────────────────────────────
create trigger audit_health_items after insert or update or delete on health_items
  for each row execute function audit_row();
create trigger touch_health_items before update on health_items
  for each row execute function touch_updated_at();
create trigger audit_health_checkins after insert or update or delete on health_checkins
  for each row execute function audit_row();
create trigger audit_grocery_items after insert or update or delete on grocery_items
  for each row execute function audit_row();
create trigger touch_grocery_items before update on grocery_items
  for each row execute function touch_updated_at();
create trigger audit_health_settings after insert or update or delete on health_settings
  for each row execute function audit_row();
create trigger touch_health_settings before update on health_settings
  for each row execute function touch_updated_at();
