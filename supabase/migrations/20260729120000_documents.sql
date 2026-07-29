-- Etapa 5 (reinterpretada) · Documentación de procesos y método.
-- Base de conocimiento editable por el usuario y por el agente: cómo le gusta a
-- Julián que se hagan las cosas. El agente la consulta antes de actuar y la alimenta.
-- Alcance por columnas opcionales: sin area/project = método global; con project_id =
-- documentación de ese proyecto. Sigue el patrón de las demás tablas (RLS enable+force,
-- policy con (select auth.uid()), triggers audit_row() y touch_updated_at() de la Etapa 0).

create table documents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  area_id    uuid references areas(id)    on delete cascade,   -- opcional
  project_id uuid references projects(id) on delete cascade,   -- opcional
  title      text not null check (length(btrim(title)) between 1 and 200),
  content    text not null default '' check (length(content) <= 100000),  -- markdown
  kind       text not null default 'nota'
             check (kind in ('proceso','preferencia','nota')),
  author     text not null default 'user' check (author in ('user','agente')),
  pinned     boolean not null default false,   -- el agente prioriza los pinned
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_by_project on documents (user_id, project_id) where project_id is not null;
create index documents_by_area    on documents (user_id, area_id)    where area_id    is not null;

alter table documents enable row level security;
alter table documents force  row level security;
create policy documents_owner on documents for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger audit_documents after insert or update or delete on documents
  for each row execute function audit_row();
create trigger touch_documents before update on documents
  for each row execute function touch_updated_at();
