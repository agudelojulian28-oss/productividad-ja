-- ADR-028: Etiquetas de movimientos + ingresos recurrentes.
-- 1) Las recurrentes ganan `direction` para reutilizar la misma máquina como INGRESOS
--    recurrentes además de gastos (los existentes quedan como 'out').
-- 2) Etiquetas GLOBALES por usuario, aplicables a cualquier movimiento (in/out) y a las
--    recurrentes (many-to-many). El dinero sigue bajo la jerarquía de proyectos (ADR-026);
--    las etiquetas son un corte transversal para controlar mejor.

-- ── 1) Dirección en recurrentes ────────────────────────────────────────────
alter table recurring_expenses
  add column direction text not null default 'out' check (direction in ('in', 'out'));

-- ── 2) Etiquetas (globales por usuario) ────────────────────────────────────
create table tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  color      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tags_user_name on tags (user_id, lower(name));

alter table tags enable row level security;
alter table tags force  row level security;
create policy tags_owner on tags for all
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create trigger audit_tags after insert or update or delete on tags
  for each row execute function audit_row();
create trigger touch_tags before update on tags
  for each row execute function touch_updated_at();

-- ── 3) Etiquetas en movimientos (many-to-many) ─────────────────────────────
create table transaction_tags (
  transaction_id uuid not null references transactions(id) on delete cascade,
  tag_id         uuid not null references tags(id)         on delete cascade,
  user_id        uuid not null references auth.users(id)   on delete cascade,
  primary key (transaction_id, tag_id)
);
create index transaction_tags_tag on transaction_tags (tag_id);

alter table transaction_tags enable row level security;
alter table transaction_tags force  row level security;
create policy transaction_tags_owner on transaction_tags for all
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── 4) Etiquetas en recurrentes (many-to-many) ─────────────────────────────
create table recurring_tags (
  recurring_id uuid not null references recurring_expenses(id) on delete cascade,
  tag_id       uuid not null references tags(id)               on delete cascade,
  user_id      uuid not null references auth.users(id)         on delete cascade,
  primary key (recurring_id, tag_id)
);
create index recurring_tags_tag on recurring_tags (tag_id);

alter table recurring_tags enable row level security;
alter table recurring_tags force  row level security;
create policy recurring_tags_owner on recurring_tags for all
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
