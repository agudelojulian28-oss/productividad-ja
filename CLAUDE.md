# Productividad Julián Agudelo

Sistema personal de productividad y finanzas. **Un solo usuario.** Gestiona metas, proyectos,
tareas, agenda, fuentes de ingreso, ofertas, ventas y transacciones desde tres canales:
app web, chat con LLM en la web, y WhatsApp/Telegram.

**Etapa actual: 0 — Cimientos.** No construyas funcionalidad de etapas posteriores sin
avisarme antes. El plan por etapas está en `docs/arquitectura-v3.md` §7.

## Documentos de arquitectura

Son la fuente de verdad del diseño. Léelos cuando necesites contexto; **no los resumas aquí.**

- `docs/arquitectura-v2.md` — infraestructura, seguridad, auditoría, diseño del agente
- `docs/arquitectura-v3.md` — modelo de dominio, módulos, catálogo de herramientas, etapas
- `docs/panel-finanzas.md` — vistas SQL de finanzas
- `docs/superficie-movil.md` — reparto móvil/escritorio y reglas de UI móvil
- `docs/sistema-diseno.md` — tokens, color y componentes (tema oscuro, acento naranja)
- `docs/adr/` — decisiones numeradas e inmutables. Nunca las edites: se supersedan.

## Reglas no negociables

Estas cinco salieron de una auditoría en la que **todas estaban rotas**. Cada una parecía
correcta en el papel y fallaba en la implementación. No las relajes sin escribir un ADR.

1. **El agente nunca usa `service_role`.** Firma un JWT efímero del usuario (2 min de vida)
   y actúa con RLS activa. `service_role` solo se permite en `app/api/channels/*` para el
   INSERT en `inbox`, y en migraciones. En ningún otro sitio. El worker **reclama el inbox
   firmando el JWT del `ALLOWED_USER_ID`** (usuario único) y trabaja bajo RLS, nunca con
   `service_role` (ADR-017).
2. **Los webhooks solo hacen INSERT en `inbox` y devuelven 200.** Jamás procesan en línea.
   Nunca uses `after()` para trabajo que no se puede perder: si la función muere, el mensaje
   desaparece y la plataforma ya no reintenta.
3. **La auditoría es por trigger de Postgres, no por código.** No añadas llamadas a
   `audit.record()` dentro de los casos de uso. El **contexto del actor viaja por claims del
   JWT** (`actor/channel/conversation/tool_call`), que el trigger lee de `request.jwt.claims`
   (ADR-016): un GUC local fijado con `set_actor_context` **no** sobrevive a una escritura del
   cliente REST, porque PostgREST abre una transacción por request. `set_actor_context` solo
   aplica al camino que escribe dentro de una RPC. `audit_row()` debe ser propiedad de `postgres`.
4. **Toda tabla nueva lleva `enable` + `force row level security`,** con políticas escritas
   como `(select auth.uid())`. Nunca `auth.uid()` desnudo: se evalúa una vez por fila.
5. **Toda vista lleva `with (security_invoker = true)`.** Sin eso corre con los privilegios
   del owner y bypasea RLS en silencio.

## Trampas conocidas

- **Fechas.** Nunca `z.coerce.date()` sobre salida del modelo: acepta timestamps sin offset
  y los interpreta en UTC, desplazando todo 5 horas. ISO-8601 con offset explícito, validado
  por regex. La aritmética de fechas va en la zona del usuario, no en UTC.
- **Dinero.** `amount_minor bigint` = monto × 100, en cualquier moneda. Nunca `float`, nunca
  `numeric` para montos. La conversión a moneda base se congela al registrar (`fx_rate`).
- **Prompt caching.** Nada volátil (hora actual, tareas de hoy) puede ir en el bloque
  `system`. Va en `messages`, después del breakpoint. El orden de caché es
  `tools → system → messages`.
- **Idempotencia.** Toda herramienta de escritura consulta `tool_executions` por
  `tool_call_id` antes de ejecutar. Los reintentos del inbox son reales.
- **`crypto.timingSafeEqual`** lanza excepción si los buffers difieren en longitud. Compara
  longitud primero (la longitud no es secreta).
- **Barrido del inbox.** La red de seguridad de la ingesta durable es `pg_cron` + `pg_net` en
  Supabase (precisión de minuto), **no** Vercel Cron (Hobby = 1/día). El `void fetch` al worker
  es best-effort; la durabilidad la garantiza el barrido (ADR-015).

## Límites del diseño

- **El catálogo del agente son 11 herramientas.** No añadas herramientas nuevas sin
  discutirlo conmigo. Regla: una funcionalidad necesita herramienta propia solo si se va a
  pedir por chat más de una vez por semana. Configuración = UI, no herramienta.
- `core/**` no importa de `app/`, `agent/`, `adapters/`, ni de `next`.
- `agent/**` no importa de `adapters/supabase/**`.
- Entre módulos de core: `structure` ← `work` ← `commerce`; `structure` ← `finance`;
  `goals` no importa de nadie (lee la vista `goal_progress`).
- **La UI son dos superficies, no una que se encoge.** Móvil = flujo (consultar, capturar,
  revisar). Escritorio = configuración (playbooks, fuentes de ingreso, ofertas, metas). La
  configuración en móvil se muestra en lectura, nunca oculta. El capturador universal en móvil
  es el chat con tarjeta de confirmación editable; no reconstruyas los 12 formularios en táctil.
- **Diseño: tema oscuro único, acento naranja** (`docs/sistema-diseno.md`, ADR-019). Se adopta
  el lenguaje visual de la referencia, no sus funciones. Tokens en un solo sitio; el naranja solo
  para acción primaria y la cifra más accionable. Dinero siempre por `lib/format.ts`. Para
  cualquier gráfico, carga el skill `dataviz`.

## Convenciones

- TypeScript estricto. Sin `any`.
- Zod en toda frontera. Un schema por herramienta genera validación, JSON Schema para la
  API y la fila de `docs/tools.md`. Una definición, tres usos.
- Casos de uso, siempre en este orden: **validar → autorizar → reglas → ejecutar →
  devolver `Result<T>`**. Sin excepciones.
- Migraciones versionadas en `supabase/migrations/`. Nunca modifiques una ya aplicada:
  se corrige con una migración nueva.
- Nombres de dominio en español (`ventas`, `metas`), código e identificadores en inglés.

## Comandos

```bash
npm run dev            # desarrollo
npm run lint           # eslint + dependency-cruiser (las 10 reglas de arquitectura)
npm run test           # tests de dominio
npm run test:security  # RLS, auditoría, inmutabilidad — corre como 'authenticated'
npm run check:rls      # tablas sin RLS o con RLS sin políticas; debe devolver 0 filas
npm run db:migrate     # aplica migraciones
npm run db:types       # regenera tipos desde el esquema
```

## Cómo trabajar conmigo

- **Cambios de esquema:** propón la migración y espera aprobación antes de aplicarla.
  Usa plan mode para cualquier cosa que toque `supabase/migrations/`.
- **Antes de decir que algo está listo:** corre `npm run lint && npm run test &&
  npm run test:security && npm run check:rls`. Si algo falla, no está listo.
- **Si una instrucción mía contradice un documento de `docs/`,** dímelo en vez de elegir
  por tu cuenta. Probablemente uno de los dos está desactualizado y hay que arreglarlo.
- **Si te corrijo dos veces sobre lo mismo,** proponme añadirlo a este archivo.
- Prefiero que preguntes antes de construir algo grande a que construyas algo grande
  que haya que tirar.
