-- Barrido durable del inbox (ADR-015): pg_cron invoca el worker cada minuto vía pg_net.
-- Es la red de seguridad real de la ingesta; la ruta rápida (void fetch) es best-effort.
--
-- La URL y el secreto del worker viven en Vault (`vault.decrypted_secrets`), NO en este
-- archivo ni en git. Deben existir dos secretos antes de que el job sirva:
--   worker_url     = https://<deploy>/api/worker
--   worker_secret  = el WORKER_SECRET del entorno
-- (se cargan con vault.create_secret en un paso operativo fuera de esta migración).
--
-- Idempotente: cron.schedule hace upsert por nombre de job.

select cron.schedule(
  'inbox-sweep',
  '* * * * *',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'worker_url'),
      headers := jsonb_build_object(
        'content-type',    'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')
      )
    );
  $$
);
