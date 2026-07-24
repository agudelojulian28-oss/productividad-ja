-- Etapa 0 · Extensiones
-- pgcrypto: gen_random_uuid(). pg_cron + pg_net: barrido durable del inbox (ADR-015).
-- El cron.schedule del barrido se agrega en la Etapa 3, cuando exista la URL del worker.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;
