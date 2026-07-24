-- Etapa 0 · Vistas. TODAS con security_invoker=true: sin eso corren con los
-- privilegios del owner y bypasean RLS en silencio (fallo C1 disfrazado de vista).
-- Toda cifra financiera sale de aquí; el agente lee exactamente estas vistas.

-- ── Progreso de metas ────────────────────────────────────────────────────
create or replace view goal_progress with (security_invoker = true) as
select
  g.id as goal_id, g.user_id, g.title, g.metric, g.target_value, g.currency,
  g.period_start, g.period_end, g.status,
  case g.metric
    when 'money_in' then coalesce((
      select sum(t.base_amount_minor)/100.0 from transactions t
       where t.user_id = g.user_id and t.direction = 'in'
         and t.occurred_on between g.period_start and g.period_end
         and (g.income_source_id is null or t.income_source_id = g.income_source_id)
         and (g.area_id          is null or t.area_id          = g.area_id)), 0)
    when 'money_net' then coalesce((
      select sum(case when t.direction = 'in' then t.base_amount_minor
                      else -t.base_amount_minor end)/100.0
        from transactions t
       where t.user_id = g.user_id
         and t.occurred_on between g.period_start and g.period_end
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

-- ── V1 · Flujo de caja mensual ───────────────────────────────────────────
create or replace view fin_cashflow_monthly with (security_invoker = true) as
select
  t.user_id,
  t.area_id,
  date_trunc('month', t.occurred_on)::date as month,
  sum(t.base_amount_minor) filter (where t.direction = 'in')  as inflow_minor,
  sum(t.base_amount_minor) filter (where t.direction = 'out') as outflow_minor,
  sum(case when t.direction = 'in' then  t.base_amount_minor
                                   else -t.base_amount_minor end) as net_minor,
  count(*) as movements,
  max(t.created_at) as last_recorded_at
from transactions t
group by t.user_id, t.area_id, date_trunc('month', t.occurred_on);

-- ── V2 · Ingreso por fuente, con comparativa ─────────────────────────────
create or replace view fin_by_source with (security_invoker = true) as
with p as (
  select date_trunc('month', current_date)::date as this_month,
         (date_trunc('month', current_date) - interval '1 month')::date as last_month
)
select
  s.user_id, s.id as income_source_id, s.name, s.model, a.name as area,
  coalesce(sum(t.base_amount_minor) filter (
    where date_trunc('month', t.occurred_on)::date = p.this_month), 0) as this_month_minor,
  coalesce(sum(t.base_amount_minor) filter (
    where date_trunc('month', t.occurred_on)::date = p.last_month), 0) as last_month_minor,
  coalesce(sum(t.base_amount_minor) filter (
    where t.occurred_on >= current_date - interval '12 months'), 0)    as ttm_minor
from income_sources s
join areas a on a.id = s.area_id
cross join p
left join transactions t
  on t.income_source_id = s.id and t.direction = 'in'
where s.status <> 'archived'
group by s.user_id, s.id, s.name, s.model, a.name, p.this_month, p.last_month;

-- ── V3 · Por cobrar ──────────────────────────────────────────────────────
create or replace view fin_receivables with (security_invoker = true) as
select
  s.user_id, s.id as sale_id,
  c.name    as client,
  o.name    as offering,
  isrc.name as income_source,
  s.amount_minor                                    as invoiced_minor,
  coalesce(paid.total_minor, 0)                     as paid_minor,
  s.amount_minor - coalesce(paid.total_minor, 0)    as outstanding_minor,
  s.currency,
  s.closed_at::date                                 as closed_on,
  (current_date - s.closed_at::date)                as days_outstanding,
  case
    when current_date - s.closed_at::date <=  30 then '0-30'
    when current_date - s.closed_at::date <=  60 then '31-60'
    when current_date - s.closed_at::date <=  90 then '61-90'
    else '90+'
  end as aging_bucket,
  (s.stage = 'cobrada') as marked_paid
from sales s
join offerings      o    on o.id    = s.offering_id
join income_sources isrc on isrc.id = o.income_source_id
left join clients   c    on c.id    = s.client_id
left join lateral (
  select sum(t.base_amount_minor) as total_minor
  from transactions t
  where t.sale_id = s.id and t.direction = 'in'
) paid on true
where s.stage in ('ganada','entregando','entregada','cobrada')
  and s.amount_minor > coalesce(paid.total_minor, 0);

-- ── V4 · Pipeline ────────────────────────────────────────────────────────
create or replace view fin_pipeline with (security_invoker = true) as
select s.user_id, s.stage,
       count(*)                as deals,
       sum(s.amount_minor)     as value_minor,
       min(s.expected_close)   as nearest_close
from sales s
where s.stage in ('prospecto','propuesta','negociacion')
group by s.user_id, s.stage;

-- ── V5 · Gastos por categoría ────────────────────────────────────────────
create or replace view fin_expenses_by_category with (security_invoker = true) as
select t.user_id, t.area_id,
       date_trunc('month', t.occurred_on)::date as month,
       coalesce(nullif(btrim(t.category), ''), 'sin categoría') as category,
       sum(t.base_amount_minor) as amount_minor,
       count(*)                 as movements
from transactions t
where t.direction = 'out'
group by 1, 2, 3, 4;

-- ── V6 · Saldo acumulado (para cuadrar contra el banco) ──────────────────
create or replace view fin_running_balance with (security_invoker = true) as
select
  t.user_id, t.occurred_on, t.id, t.description,
  case when t.direction = 'in' then t.base_amount_minor else -t.base_amount_minor end as delta_minor,
  sum(case when t.direction = 'in' then  t.base_amount_minor
                                   else -t.base_amount_minor end)
    over (partition by t.user_id order by t.occurred_on, t.id) as balance_minor
from transactions t;
