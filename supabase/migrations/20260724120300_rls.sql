-- Etapa 0 · Row Level Security.
-- enable + force en todas. Políticas con (select auth.uid()) → InitPlan, una vez por consulta.
-- auth.uid() desnudo se evaluaría una vez POR FILA.

-- Tablas de propiedad directa del usuario: política 'all' (lectura y escritura propias).
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','areas','income_sources','offerings','playbooks','clients',
    'goals','sales','projects','tasks','transactions',
    'inbox','tool_executions','pending_actions','usage_budget',
    'integrations','conversations','messages'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force  row level security;', t);
    execute format(
      'create policy %1$s_owner on %1$I for all
         using      (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()));', t);
  end loop;
end $$;

-- audit_log es un caso aparte: solo SELECT para el dueño.
-- El INSERT lo hace el trigger audit_row() (security definer, owner con BYPASSRLS).
-- UPDATE/DELETE los bloquea el trigger de inmutabilidad.
alter table audit_log enable row level security;
alter table audit_log force  row level security;
create policy audit_log_owner_select on audit_log for select
  using (user_id = (select auth.uid()));
