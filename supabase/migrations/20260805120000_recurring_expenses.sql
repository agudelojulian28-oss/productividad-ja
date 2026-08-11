-- Gastos recurrentes (ADR-027). Plantilla de un gasto que se repite: al llegar la fecha,
-- la app pide confirmar (con opción de editar precio y adjuntar comprobante) y, al confirmar,
-- crea una transacción real y avanza la próxima fecha. El comprobante va por instancia
-- (en la transacción, reusando attachments.transaction_id), no en la plantilla.
-- El dinero se atribuye a un proyecto (ADR-026); area_id se desnormaliza del proyecto.

create table recurring_expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_id   uuid not null references projects(id) on delete cascade,
  area_id      uuid not null references areas(id)     on delete cascade,
  amount_minor bigint  not null check (amount_minor > 0),
  currency     char(3) not null default 'COP',
  category     text,
  description  text,
  frequency    text not null check (frequency in
                 ('semanal','quincenal','mensual','bimestral','trimestral','anual')),
  next_due_on  date not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Índice para encontrar rápido los que están por confirmar (activos y ya vencidos).
create index recurring_due on recurring_expenses (user_id, next_due_on)
  where active;

alter table recurring_expenses enable row level security;
alter table recurring_expenses force  row level security;
create policy recurring_owner on recurring_expenses for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger audit_recurring after insert or update or delete on recurring_expenses
  for each row execute function audit_row();
create trigger touch_recurring before update on recurring_expenses
  for each row execute function touch_updated_at();
