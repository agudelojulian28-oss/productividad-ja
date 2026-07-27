-- ADR-021 · Las metas cuelgan de proyectos; la meta es opcional para las tareas.
-- Aditivo y de bajo riesgo: no toca las vistas financieras ni el negocio.
-- Las columnas nuevas heredan las políticas RLS `_owner` de sus tablas (sin cambios de RLS).

-- Metas bajo proyecto. `area_id`/`income_source_id` se conservan (dimensiones que usa la
-- vista goal_progress). project_id es nullable en columna; el caso de uso lo exige para las
-- metas del árbol de trabajo.
alter table goals
  add column if not exists project_id uuid references projects(id) on delete cascade;

create index if not exists goals_by_project on goals (user_id, project_id)
  where project_id is not null;

-- Meta opcional en la tarea. Si la meta se borra, la tarea queda sin meta (no se borra).
alter table tasks
  add column if not exists goal_id uuid references goals(id) on delete set null;

create index if not exists tasks_by_goal on tasks (user_id, goal_id)
  where goal_id is not null;
