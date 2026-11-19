-- Salud: precarga del plan en UNA transacción (todo o nada) con guarda de idempotencia.
-- Antes eran ~57 inserciones HTTP en serie (~8 s): otra página podía ver el plan a medias y,
-- si algo se cortaba, quedaba incompleto. Ahora es un solo viaje: o queda todo o nada.
--
-- Concurrencia: el UPDATE condicional bloquea la fila de ajustes; una segunda llamada
-- simultánea espera, re-evalúa "seeded_at is null" (ya no lo es) y devuelve false.
-- Si la primera falla, su transacción revierte seeded_at y la siguiente carga reintenta.
-- security invoker: corre con RLS como el usuario (auth.uid()); la auditoría sigue por trigger.

create or replace function seed_health_plan(p_plan jsonb, p_groceries jsonb)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_node   jsonb;
  v_child  jsonb;
  v_parent uuid;
begin
  if v_uid is null then
    raise exception 'seed_health_plan: sin usuario autenticado';
  end if;

  -- Guarda de idempotencia: solo la PRIMERA llamada encuentra seeded_at vacío.
  insert into health_settings (user_id) values (v_uid) on conflict (user_id) do nothing;
  update health_settings set seeded_at = now() where user_id = v_uid and seeded_at is null;
  if not found then
    return false;
  end if;

  -- El plan solo se precarga si no hay nada (nunca pisa lo que Julián ya tenga).
  if not exists (select 1 from health_items where user_id = v_uid) then
    for v_node in select * from jsonb_array_elements(coalesce(p_plan, '[]'::jsonb)) loop
      insert into health_items (
        user_id, section, kind, title, detail, time_of_day, duration_min, weekdays,
        trackable, needs_review, sort_order
      ) values (
        v_uid,
        v_node->>'section',
        v_node->>'kind',
        v_node->>'title',
        v_node->>'detail',
        (v_node->>'timeOfDay')::time,
        (v_node->>'durationMin')::integer,
        case when jsonb_typeof(v_node->'weekdays') = 'array'
             then array(select (jsonb_array_elements_text(v_node->'weekdays'))::smallint) end,
        coalesce((v_node->>'trackable')::boolean, false),
        coalesce((v_node->>'needsReview')::boolean, false),
        coalesce((v_node->>'sortOrder')::integer, 0)
      ) returning id into v_parent;

      for v_child in select * from jsonb_array_elements(coalesce(v_node->'children', '[]'::jsonb)) loop
        insert into health_items (
          user_id, section, kind, parent_id, title, detail, duration_min, needs_review, sort_order
        ) values (
          v_uid,
          v_node->>'section',
          v_child->>'kind',
          v_parent,
          v_child->>'title',
          v_child->>'detail',
          (v_child->>'durationMin')::integer,
          coalesce((v_child->>'needsReview')::boolean, false),
          coalesce((v_child->>'sortOrder')::integer, 0)
        );
      end loop;
    end loop;
  end if;

  if not exists (select 1 from grocery_items where user_id = v_uid) then
    insert into grocery_items (user_id, name, quantity, frequency, sort_order)
    select v_uid,
           g->>'name',
           g->>'quantity',
           coalesce(g->>'frequency', 'semanal'),
           coalesce((g->>'sortOrder')::integer, 0)
      from jsonb_array_elements(coalesce(p_groceries, '[]'::jsonb)) g;
  end if;

  return true;
end $$;

revoke all on function seed_health_plan(jsonb, jsonb) from public, anon;
grant execute on function seed_health_plan(jsonb, jsonb) to authenticated;
