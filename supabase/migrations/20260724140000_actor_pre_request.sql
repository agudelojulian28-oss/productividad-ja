-- Atribución de actor en escrituras web (ADR-016).
-- PostgREST ejecuta pre_request al inicio de la transacción de cada request,
-- así que set_config(local) sobrevive hasta la escritura y el trigger de auditoría
-- lo lee. El trigger lee PRIMERO los claims del JWT (camino agente, actor='agent'),
-- por eso poner 'user' aquí como default no pisa al agente.

create or replace function public.pre_request() returns void
language plpgsql
set search_path = public as $$
begin
  if nullif(current_setting('request.jwt.claims', true), '') is not null then
    perform set_config('app.actor', 'user', true);
    perform set_config('app.channel', 'web', true);
  end if;
end $$;

alter role authenticator set pgrst.db_pre_request = 'public.pre_request';
notify pgrst, 'reload config';
