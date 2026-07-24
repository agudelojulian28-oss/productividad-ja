# Productividad Julián Agudelo

Sistema personal de productividad y finanzas. **Un solo usuario.** Metas, proyectos, tareas,
agenda, fuentes de ingreso, ofertas, ventas y transacciones desde tres canales: app web, chat
con LLM en la web, y Telegram/WhatsApp.

> **Etapa actual: 0 — Cimientos.** Ver `docs/arquitectura-v3.md` §7 para el plan por etapas.

## Documentos

- `CLAUDE.md` — reglas, trampas y convenciones (contexto para Claude Code).
- `docs/arquitectura-v2.md` — infraestructura, seguridad, auditoría, agente.
- `docs/arquitectura-v3.md` — modelo de dominio, módulos, herramientas, etapas.
- `docs/panel-finanzas.md` — vistas SQL de finanzas.
- `docs/superficie-movil.md` — reparto móvil/escritorio.
- `docs/sistema-diseno.md` — tokens y componentes (tema oscuro, acento naranja).
- `docs/adr/` — decisiones de arquitectura numeradas e inmutables (001–019).

## Stack

Next.js 16 · TypeScript estricto · Supabase (Postgres + RLS + Auth + `pg_cron`) · Anthropic ·
Google Calendar · Vercel (Hobby). Costo objetivo: **$0 hasta la Etapa 2**, luego ~$8–12/mes.

## Puesta en marcha

Ver `docs/` y el archivo `.env.example` (cópialo a `.env.local`). Respaldo diario automático
por GitHub Actions (`.github/workflows/backup.yml`): añade el secreto `SUPABASE_DB_URL` en
GitHub. Comandos en `CLAUDE.md`.
