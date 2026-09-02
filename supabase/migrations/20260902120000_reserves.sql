-- Reservas: dos "apartados" de dinero, cada uno con su meta modificable.
--  · flujo      → dinero apartado del balance para el uso diario. NO crea transacción
--                 (sale del balance conceptualmente pero no se descuenta). Solo aportes.
--  · emergencia → colchón (≈6 meses de gastos). Aportar = GASTO real del balance en un
--                 proyecto dedicado (linked_transaction_id); retirar = solo baja el fondo.
-- Todo en COP (base de la app). Un solo usuario. Ver Finanzas / ADR-026.

create table reserve_funds (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('flujo', 'emergencia')),
  target_minor bigint not null default 0 check (target_minor >= 0),  -- meta
  description  text check (char_length(description) <= 2000),
  -- Solo emergencia: proyecto/área dedicados a los que se atribuye el gasto del aporte.
  project_id   uuid references projects(id) on delete set null,
  area_id      uuid references areas(id)    on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, kind)
);

create table reserve_movements (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  fund_id               uuid not null references reserve_funds(id) on delete cascade,
  direction             text not null check (direction in ('in', 'out')),
  amount_minor          bigint not null check (amount_minor > 0),
  occurred_on           date not null default current_date,
  description           text check (char_length(description) <= 500),
  -- Gasto ligado al aporte (solo emergencia 'in'); si se borra el gasto, se anula.
  linked_transaction_id uuid references transactions(id) on delete set null,
  created_at            timestamptz not null default now()
);

create index reserve_movements_fund on reserve_movements (fund_id, occurred_on desc);

alter table reserve_funds     enable row level security;
alter table reserve_funds     force  row level security;
alter table reserve_movements enable row level security;
alter table reserve_movements force  row level security;

create policy reserve_funds_owner on reserve_funds for all
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy reserve_movements_owner on reserve_movements for all
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create trigger audit_reserve_funds after insert or update or delete on reserve_funds
  for each row execute function audit_row();
create trigger touch_reserve_funds before update on reserve_funds
  for each row execute function touch_updated_at();
create trigger audit_reserve_movements after insert or update or delete on reserve_movements
  for each row execute function audit_row();

-- Resumen por fondo: saldo = entradas − salidas (en la moneda base, COP).
create or replace view fin_reserve_summary with (security_invoker = true) as
select
  f.id           as fund_id,
  f.user_id,
  f.kind,
  f.target_minor,
  f.description,
  f.project_id,
  coalesce(sum(m.amount_minor) filter (where m.direction = 'in'),  0) as in_minor,
  coalesce(sum(m.amount_minor) filter (where m.direction = 'out'), 0) as out_minor,
  coalesce(sum(case when m.direction = 'in' then  m.amount_minor
                                            else -m.amount_minor end), 0) as balance_minor,
  count(m.id) as movements
from reserve_funds f
left join reserve_movements m on m.fund_id = f.id
group by f.id, f.user_id, f.kind, f.target_minor, f.description, f.project_id;
