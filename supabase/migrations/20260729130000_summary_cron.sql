-- Etapa 6 · Resumen diario/semanal (ADR-015): pg_cron invoca /api/summary vía pg_net.
-- Idempotente: cron.schedule hace upsert por nombre de job.
--
-- Requiere un secreto nuevo en Vault (paso operativo, fuera de esta migración):
--   summary_url = https://<deploy>/api/summary
-- Reusa worker_secret (mismo WORKER_SECRET del entorno) como x-worker-secret.
--
-- Horas en UTC. Bogotá = UTC-5 (sin horario de verano):
--   daily  07:00 Bogotá = 12:00 UTC
--   weekly domingo 18:00 Bogotá = 23:00 UTC domingo

select cron.schedule(
  'summary-daily',
  '0 12 * * *',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'summary_url'),
      headers := jsonb_build_object(
        'content-type',    'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')
      ),
      body    := jsonb_build_object('kind', 'daily')
    );
  $$
);

select cron.schedule(
  'summary-weekly',
  '0 23 * * 0',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'summary_url'),
      headers := jsonb_build_object(
        'content-type',    'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')
      ),
      body    := jsonb_build_object('kind', 'weekly')
    );
  $$
);
