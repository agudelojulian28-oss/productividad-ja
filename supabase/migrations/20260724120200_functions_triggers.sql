-- Etapa 0 · Funciones y triggers (auditoría, inmutabilidad, updated_at).
-- La auditoría la escriben triggers, no el código. El actor viaja por claims del JWT
-- (ADR-016) con fallback al GUC de sesión (camino RPC). audit_row() debe ser propiedad
-- de un rol con BYPASSRLS (postgres); las migraciones corren como postgres, así que lo es.

-- Contexto del actor para el camino RPC (GUCs locales a la transacción).
create or replace function set_actor_context(
  p_actor text, p_channel text, p_conversation uuid, p_tool_call text
) returns void language sql as $$
  select set_config('app.actor',        p_actor,                           true),
         set_config('app.channel',      coalesce(p_channel,''),            true),
         set_config('app.conversation', coalesce(p_conversation::text,''), true),
         set_config('app.tool_call',    coalesce(p_tool_call,''),          true);
$$;

-- Trigger genérico de auditoría. Maneja OLD/NEW según la operación.
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid; v_id uuid; v_before jsonb; v_after jsonb; v_claims jsonb;
begin
  if TG_OP = 'DELETE' then
    v_user := old.user_id; v_id := old.id;
    v_before := to_jsonb(old); v_after := null;
  else
    v_user := new.user_id; v_id := new.id;
    v_before := case when TG_OP = 'UPDATE' then to_jsonb(old) end;
    v_after  := to_jsonb(new);
  end if;

  -- Claims del JWT (camino REST); NULL si no hay JWT en la sesión (camino RPC).
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;

  insert into audit_log (
    user_id, actor, channel, conversation_id, action,
    entity_type, entity_id, before, after, tool_call_id
  ) values (
    v_user,
    -- JWT claims primero, GUC de sesión después, 'system' por defecto
    coalesce(v_claims ->> 'actor',   nullif(current_setting('app.actor', true), ''), 'system'),
    coalesce(v_claims ->> 'channel', nullif(current_setting('app.channel', true), '')),
    coalesce(v_claims ->> 'conversation',
             nullif(current_setting('app.conversation', true), ''))::uuid,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME, v_id, v_before, v_after,
    coalesce(v_claims ->> 'tool_call', nullif(current_setting('app.tool_call', true), ''))
  );

  return coalesce(new, old);
end $$;

-- Inmutabilidad del log: se dispara para cualquier rol.
create or replace function reject_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log es append-only (intento de %)', TG_OP
    using errcode = 'insufficient_privilege';
end $$;

create trigger audit_log_immutable
  before update or delete on audit_log
  for each row execute function reject_mutation();

-- updated_at automático.
create or replace function touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- Adjuntar triggers a las 10 tablas de dominio (todas tienen id, user_id, updated_at).
do $$
declare t text;
begin
  foreach t in array array[
    'areas','income_sources','offerings','playbooks','clients',
    'goals','sales','projects','tasks','transactions'
  ] loop
    execute format(
      'create trigger audit_%1$s after insert or update or delete on %1$s
         for each row execute function audit_row();', t);
    execute format(
      'create trigger touch_%1$s before update on %1$s
         for each row execute function touch_updated_at();', t);
  end loop;
end $$;
