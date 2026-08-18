-- ADR-029: las etiquetas pasan de GLOBALES (ADR-028) a POR PROYECTO.
-- Julián quiere el corte bajo la jerarquía del proyecto: una etiqueta pertenece a un
-- proyecto y solo aparece al etiquetar movimientos/recurrentes de ESE proyecto.

-- Las etiquetas existentes (pruebas de hoy) no tienen proyecto → se borran; se recrean
-- por proyecto. Cae en cascada sobre transaction_tags/recurring_tags.
delete from tags;

alter table tags
  add column project_id uuid not null references projects(id) on delete cascade;

-- Unicidad del nombre AHORA por (usuario, proyecto): el mismo nombre puede existir en
-- proyectos distintos, pero no repetido dentro de un proyecto.
drop index if exists tags_user_name;
create unique index tags_user_project_name on tags (user_id, project_id, lower(name));

-- Índice para filtrar rápido las etiquetas de un proyecto.
create index tags_project on tags (project_id);
