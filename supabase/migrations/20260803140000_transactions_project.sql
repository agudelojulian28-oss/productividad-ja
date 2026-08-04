-- Proyectos como atribución del dinero (ADR-026): cada ingreso/gasto se cuelga de
-- un proyecto. Se agrega project_id a transactions y se relaja el check que obligaba
-- una fuente de ingreso (ahora la atribución puede ser el proyecto). Las fuentes de
-- ingreso quedan como legado (siguen en el esquema, ocultas en la app).

alter table transactions
  add column if not exists project_id uuid references projects(id) on delete set null;

create index if not exists tx_by_project
  on transactions (user_id, project_id, occurred_on desc)
  where project_id is not null;

-- El ingreso ya no exige fuente: basta con proyecto O fuente.
alter table transactions drop constraint if exists income_needs_source;
alter table transactions
  add constraint income_has_attribution
  check (direction = 'out' or income_source_id is not null or project_id is not null);

-- Vista de balance por proyecto y mes (security_invoker: respeta RLS del usuario).
create or replace view fin_by_project with (security_invoker = true) as
select
  t.user_id,
  t.project_id,
  date_trunc('month', t.occurred_on)::date as month,
  coalesce(sum(t.base_amount_minor) filter (where t.direction = 'in'), 0)  as inflow_minor,
  coalesce(sum(t.base_amount_minor) filter (where t.direction = 'out'), 0) as outflow_minor,
  coalesce(sum(t.base_amount_minor) filter (where t.direction = 'in'), 0)
    - coalesce(sum(t.base_amount_minor) filter (where t.direction = 'out'), 0) as net_minor,
  count(*) as movements
from transactions t
where t.project_id is not null
group by t.user_id, t.project_id, date_trunc('month', t.occurred_on);
