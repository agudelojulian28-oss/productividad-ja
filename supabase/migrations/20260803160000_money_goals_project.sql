-- ADR-026 (extensión): las metas de dinero también se atribuyen a un proyecto.
-- Se recrea goal_progress para que money_in / money_net cuenten solo las transacciones
-- del proyecto de la meta (si tiene project_id). area_id/income_source_id se conservan
-- como dimensiones legado. La columna project_id ya existe en goals (goals_under_projects).

create or replace view goal_progress with (security_invoker = true) as
select
  g.id as goal_id, g.user_id, g.title, g.metric, g.target_value, g.currency,
  g.period_start, g.period_end, g.status,
  case g.metric
    when 'money_in' then coalesce((
      select sum(t.base_amount_minor)/100.0 from transactions t
       where t.user_id = g.user_id and t.direction = 'in'
         and t.occurred_on between g.period_start and g.period_end
         and (g.project_id       is null or t.project_id       = g.project_id)
         and (g.income_source_id is null or t.income_source_id = g.income_source_id)
         and (g.area_id          is null or t.area_id          = g.area_id)), 0)
    when 'money_net' then coalesce((
      select sum(case when t.direction = 'in' then t.base_amount_minor
                      else -t.base_amount_minor end)/100.0
        from transactions t
       where t.user_id = g.user_id
         and t.occurred_on between g.period_start and g.period_end
         and (g.project_id       is null or t.project_id       = g.project_id)
         and (g.income_source_id is null or t.income_source_id = g.income_source_id)
         and (g.area_id          is null or t.area_id          = g.area_id)), 0)
    when 'sales_won' then coalesce((
      select count(*) from sales s join offerings o on o.id = s.offering_id
       where s.user_id = g.user_id
         and s.stage in ('ganada','entregando','entregada','cobrada')
         and s.closed_at::date between g.period_start and g.period_end
         and (g.income_source_id is null or o.income_source_id = g.income_source_id)), 0)
    when 'tasks_done' then coalesce((
      select count(*) from tasks tk
       where tk.user_id = g.user_id and tk.status = 'done'
         and tk.completed_at::date between g.period_start and g.period_end), 0)
    else g.manual_value
  end as current_value
from goals g;
