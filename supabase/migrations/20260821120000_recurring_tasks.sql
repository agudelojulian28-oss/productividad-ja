-- ADR-030: Tareas recurrentes. Plantilla de una tarea que se repite; al llegar su fecha
-- se materializa SOLA en una tarea pendiente (aparece en Hoy/Vencidas) y avanza la próxima
-- fecha. Espeja recurring_expenses (ADR-027) pero para el módulo work y sin dinero.
-- project_id/goal_id son opcionales (una tarea puede no tener proyecto/meta).

create table recurring_tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid references projects(id) on delete set null,
  goal_id     uuid references goals(id)    on delete set null,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  notes       text check (char_length(notes) <= 5000),
  frequency   text not null check (frequency in
                ('semanal','quincenal','mensual','bimestral','trimestral','anual')),
  due_time    text check (due_time ~ '^\d{2}:\d{2}$'), -- 'HH:MM' opcional
  next_due_on date not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Índice para encontrar rápido las plantillas por materializar (activas y ya vencidas).
create index recurring_tasks_due on recurring_tasks (user_id, next_due_on)
  where active;

alter table recurring_tasks enable row level security;
alter table recurring_tasks force  row level security;
create policy recurring_tasks_owner on recurring_tasks for all
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create trigger audit_recurring_tasks after insert or update or delete on recurring_tasks
  for each row execute function audit_row();
create trigger touch_recurring_tasks before update on recurring_tasks
  for each row execute function touch_updated_at();
