-- Etapa 2 · Circuit breaker de costo (v2 §5.5).
-- Consume presupuesto de forma atómica y devuelve si aún está dentro del tope.
-- SECURITY INVOKER (default): corre bajo RLS, solo toca la fila del propio usuario.

create or replace function check_and_consume_budget(p_user uuid, p_usd numeric)
returns boolean language plpgsql as $$
declare v_ok boolean;
begin
  insert into usage_budget (user_id) values (p_user) on conflict do nothing;

  update usage_budget
     set period       = case when period <> date_trunc('month', now())::date
                             then date_trunc('month', now())::date else period end,
         usd_spent    = case when period <> date_trunc('month', now())::date
                             then 0 else usd_spent end + p_usd,
         writes_today = case when writes_date <> current_date then 0 else writes_today end,
         writes_date  = current_date
   where user_id = p_user
   returning usd_spent <= limit_usd into v_ok;

  return coalesce(v_ok, false);
end $$;
