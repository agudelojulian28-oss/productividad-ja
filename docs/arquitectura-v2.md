# Arquitectura del Sistema de Productividad Personal — v2.0

**Fecha:** 22 de julio de 2026 · **Estado:** revisada tras auditoría técnica
**Reemplaza a:** v1.0 (misma fecha)

---

## 0. Registro de auditoría

Resultado de revisar la v1.0 buscando fallos de producción, no coherencia narrativa.

### Críticos — invalidaban una defensa o perdían datos

| # | Hallazgo | Consecuencia real | Corrección |
|---|---|---|---|
| **C1** | El worker que procesa mensajes de WhatsApp/Telegram no tiene sesión de usuario. La implementación natural usa `service_role`, **que bypasea RLS por completo**. | La "última línea de defensa" del §5.2 de la v1 no existía en el camino del agente — justo el camino con superficie de inyección de prompts. Toda la defensa quedaba reducida a chequeos en la aplicación. | El worker **firma un JWT efímero del usuario** y actúa con sus privilegios. `service_role` no aparece en ninguna ruta del agente. §5.2 |
| **C2** | `after()` para procesar el webhook. Se devuelve `200 OK`, la plataforma deja de reintentar, y si la función se corta el mensaje **desaparece sin rastro**. | Pérdida silenciosa de mensajes. En un sistema cuyo propósito es no perderte tareas, es el peor fallo posible. | **Inbox durable**: el webhook solo hace INSERT y responde. Un worker consume con reintentos. Ruta rápida + barrido por cron. §3.1 |
| **C3** | La auditoría dependía de que cada caso de uso llamara a `audit.record()`, y estaba fuera de la transacción de escritura. | Un `catch` mal puesto, un caso de uso nuevo escrito con prisa, o una escritura desde el editor SQL de Supabase = mutación sin registro. La auditabilidad era una convención, no una garantía. | **Triggers de Postgres**. Imposible de bypasear, funciona desde cualquier origen, y elimina la regla de CI que lo vigilaba. §4.3 |
| **C4** | `revoke update, delete ... from service_role` no hace inmutable el log: `service_role` y el owner de la tabla lo esquivan. | El log de auditoría era alterable por quien tuviera la clave de servicio. Un log alterable no es un log. | **Trigger que lanza excepción** en UPDATE/DELETE. Se dispara para cualquier rol. §4.3 |
| **C5** | `z.coerce.date()` sobre lo que emite el modelo. Acepta `"2026-07-23T16:00"` sin offset y lo interpreta en la zona del servidor (UTC). | Cada evento creado desde el agente cae **5 horas corridas** para un usuario en Colombia. Es el bug clásico de los asistentes de calendario y estaba en el ejemplo de código. | Regex estricta que **rechaza timestamps sin offset**. Sin coerción. La hora actual con offset va en el contexto del modelo. §6.2 |

### Serios — costo, corrección o rendimiento

| # | Hallazgo | Corrección |
|---|---|---|
| **S1** | El `cache_control` mal ubicado invalida el caché en cada petición si el prompt empieza con la hora actual — y el `context.ts` de la v1 hacía exactamente eso. Sube el costo de input **10x**. | Layout de caché explícito: el breakpoint va al final de `system`; todo lo volátil vive en `messages`. §7.2 |
| **S2** | Políticas RLS con `auth.uid()` desnudo: Postgres lo evalúa **una vez por fila**. | `(select auth.uid())` — se convierte en InitPlan y se evalúa una sola vez. §5.2 |
| **S3** | Hacer el procesamiento durable (C2) introduce reintentos ⇒ el agente puede crear la misma tarea dos veces. | Idempotencia por `tool_call_id`, que la API de Claude ya garantiza único. §6.3 |
| **S4** | "`deshacer_ultima_accion` es trivial con before/after" era falso: no revierte efectos externos (Google Calendar) ni cascadas. | Alcance del undo acotado y declarado explícitamente. §6.5 |
| **S5** | El "presupuesto de escrituras" y el "rate limit" no tenían mecanismo. En serverless sin Redis no hay dónde contar. | Contadores en Postgres + **circuit breaker de costo** que apaga el agente al superar el tope mensual. §5.5 |
| **S6** | El "token de confirmación" para operaciones destructivas estaba sin especificar. | Tabla `pending_actions` con UUID de vida corta. El modelo no puede fabricar un UUID que exista en la BD. §6.4 |

### Menores — omisiones y detalles

`M1` Faltaban las tablas `profiles`, `conversations`, `messages` (aparecían en el diagrama, no en el esquema). · `M2` `updated_at` declarado pero nunca mantenido: falta trigger. · `M3` Falta `google_calendar_id`: `google_event_id` solo no identifica un evento. · `M4` Sin política definida sobre qué pasa con el evento de Google al borrar la tarea. · `M5` La zona horaria del usuario se usaba (`ctx.tz`) pero no se guardaba en ningún lado. · `M6` `crypto.timingSafeEqual` lanza excepción si los buffers difieren en longitud — hay que igualar antes. · `M7` Los tests de RLS ejecutados con `service_role` **pasan siempre**, sin probar nada. · `M8` Sin retención ni particionado del log. · `M9` El enrutamiento a Haiku añade un viaje de ida y vuelta: degradado a optimización posterior, con medición previa.

### Simplificaciones que salieron de la auditoría

Corregir bien suele quitar piezas, no añadirlas:

- La regla de CI "todo caso de uso debe llamar `audit.record`" **desaparece** — el trigger lo garantiza (C3).
- La deduplicación explícita en el canal **desaparece** — es un `unique (channel, external_id)` en el inbox (C2).
- El enrutamiento de modelos **se pospone** hasta tener datos que lo justifiquen (M9).

---

## 1. Principios (revisados)

Los siete de la v1 siguen vigentes, con dos correcciones de redacción que la auditoría hizo necesarias:

1. **El dominio no sabe dónde vive.** `/core` no importa Next.js, Supabase, Anthropic ni ningún canal.
2. **Una sola puerta de escritura.** Toda mutación pasa por un caso de uso de `/core`.
3. **El LLM es entrada de usuario, no código de confianza.** Su salida se valida como un formulario enviado desde un navegador hostil.
4. **La autorización vive en la base de datos** — *y el agente debe estar sujeto a ella*. Una defensa que el propio sistema esquiva no es una defensa. (Corregido por C1.)
5. **Todo lo que muta, se registra** — *y el registro no debe depender de que alguien se acuerde de escribirlo*. (Corregido por C3.)
6. **La documentación que no se genera, se pudre.**
7. **Empezar con lo aburrido.**

Regla añadida:

8. **Ningún mensaje se confirma antes de estar persistido.** Devolver `200 OK` es una promesa de durabilidad. (Corregido por C2.)

---

## 2. Vista general (v2)

```
┌──────────────────────────────────────────────────────────────────────┐
│  CANALES        web (PWA) · telegram · whatsapp · voz · cron         │
│                                                                       │
│  ① Verificar firma (cuerpo crudo)  ② INSERT en inbox  ③ 200 OK       │
│                        ~40 ms, sin lógica de negocio                  │
└───────────────────────────────┬──────────────────────────────────────┘
                                ▼
                    ┌───────────────────────┐
                    │   inbox  (Postgres)   │  ← durabilidad + dedup
                    │  unique(channel, ext) │     por constraint
                    └───────────┬───────────┘
                    ruta rápida (fire & forget, best-effort)
                      + barrido por pg_cron (Supabase) cada minuto
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  WORKER  · reclama con FOR UPDATE SKIP LOCKED                        │
│          · FIRMA JWT EFÍMERO DEL USUARIO  ← todo lo de abajo         │
│          · reintentos con backoff             corre CON RLS ACTIVA   │
└───────────────────────────────┬──────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  AGENTE (/agent)   loop · catálogo cerrado de herramientas           │
│  Sin credenciales de BD. Sin SQL. Sin HTTP genérico.                 │
└───────────────────────────────┬──────────────────────────────────────┘
                                ▼  1 herramienta = 1 caso de uso
┌──────────────────────────────────────────────────────────────────────┐
│  DOMINIO (/core)  ★  única puerta de escritura                       │
│  validar → autorizar → reglas → ejecutar → devolver                  │
│  (ya NO registra: lo hacen los triggers)                             │
└───────────────────────────────┬──────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  POSTGRES        RLS FORCED · triggers de auditoría · inmutabilidad  │
│                  ↑ garantías del motor, no de la aplicación          │
└──────────────────────────────────────────────────────────────────────┘
         │                          │                        │
    Supabase Auth          Google Calendar API        Anthropic API
      + Realtime
```

La diferencia de fondo con la v1: **las garantías bajaron de capa**. Auditoría, inmutabilidad y autorización dejaron de ser promesas del código TypeScript y pasaron a ser propiedades del motor de base de datos. El código de aplicación puede tener bugs; el trigger se dispara igual.

---

## 3. Ingesta durable

### 3.1 El webhook (~40 ms)

```ts
// app/api/channels/telegram/route.ts
export async function POST(req: Request) {
  const raw = await req.text();                        // cuerpo CRUDO, sin parsear
  if (!verifySecret(req.headers, raw)) return new Response(null, { status: 401 });

  const { userId, externalId, payload } = parseEnvelope(raw);
  if (userId !== ALLOWED_USER_ID) return new Response(null, { status: 200 }); // silencio

  // Único punto de fallo aceptable: si esto falla, NO respondemos 200
  // y la plataforma reintenta. El mensaje no se pierde.
  const { error } = await admin.from('inbox')
    .insert({ user_id: userId, channel: 'telegram', external_id: externalId, payload });

  if (error && error.code !== '23505')                 // 23505 = duplicado = ya lo tenemos
    return new Response(null, { status: 500 });        // que reintente

  void fetch(WORKER_URL, { method: 'POST', headers: { 'x-internal': WORKER_SECRET } });
  return new Response(null, { status: 200 });
}
```

Tres propiedades que la v1 no tenía:

- **Durabilidad.** El `200 OK` se emite después del INSERT, no antes. Si algo falla, la plataforma reintenta.
- **Deduplicación gratis.** `unique (channel, external_id)`; el error 23505 *es* la deduplicación.
- **Latencia baja garantizada.** Un INSERT no depende de la API de Anthropic ni de Google.

La comparación de firma, con la trampa del `M6`:

```ts
function verifySecret(headers: Headers, raw: string): boolean {
  const expected = Buffer.from(process.env.TELEGRAM_WEBHOOK_SECRET!);
  const received = Buffer.from(headers.get('x-telegram-bot-api-secret-token') ?? '');
  // timingSafeEqual LANZA si las longitudes difieren — hay que comprobarlo antes,
  // y esa comprobación sí puede ser variable en tiempo (la longitud no es secreta).
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

Para WhatsApp cambia solo el cálculo: HMAC-SHA256 del **cuerpo crudo** con el App Secret, comparado contra `X-Hub-Signature-256` sin el prefijo `sha256=`. Meta escapa los caracteres Unicode al firmar, así que hay que trabajar sobre los bytes originales, nunca sobre `JSON.stringify(JSON.parse(body))`.

### 3.2 El worker

```sql
-- Reclamo atómico. SKIP LOCKED permite varios workers sin coordinación externa.
update inbox set status = 'processing', claimed_at = now(), attempts = attempts + 1
where id = (
  select id from inbox
  where status = 'pending'
     or (status = 'processing' and claimed_at < now() - interval '2 minutes')  -- rescate
  order by received_at
  for update skip locked
  limit 1
)
returning *;
```

- **Ruta rápida:** el webhook dispara el worker sin esperar respuesta (`void fetch`). Es
  *best-effort*: en serverless el trabajo no-esperado tras el 200 no está garantizado. La
  garantía de durabilidad **no** depende de este `fetch`, sino del barrido de abajo.
- **Red de seguridad (ADR-015):** **`pg_cron` dentro de Supabase invoca el endpoint del worker
  cada minuto vía `pg_net`** y barre lo que quedó `pending`. Si la ruta rápida muere, se recupera
  solo en <60 s. No se usa Vercel Cron: el plan Hobby limita el cron a una ejecución diaria.
- **Contexto de auth del reclamo (ADR-017):** el worker reclama el inbox firmando el JWT del
  `ALLOWED_USER_ID` (usuario único) y actúa **bajo RLS**. No usa `service_role`.
- **Reintentos:** hasta 3 con backoff. Al cuarto, `status = 'failed'` y se notifica al usuario por el canal — nunca fallar en silencio.
- **Rescate:** un mensaje `processing` más de 2 minutos se considera huérfano y vuelve a la cola.

---

## 4. Modelo de datos

### 4.1 Tablas

```sql
create extension if not exists pgcrypto;

-- Perfil: la zona horaria es dato de primera clase (M5)
create table profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  timezone   text not null default 'America/Bogota',
  created_at timestamptz not null default now()
);

create table goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null check (length(btrim(title)) between 1 and 200),
  status      text not null default 'active'
              check (status in ('active','paused','archived','done')),
  target_date date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  goal_id    uuid references goals(id) on delete set null,
  title      text not null check (length(btrim(title)) between 1 and 200),
  status     text not null default 'active'
             check (status in ('active','paused','archived','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_id   uuid references projects(id) on delete set null,
  title        text not null check (length(btrim(title)) between 1 and 200),
  notes        text check (length(notes) <= 5000),
  status       text not null default 'pending'
               check (status in ('pending','done','cancelled')),
  due_at       timestamptz,
  completed_at timestamptz,
  -- M3: un evento se identifica por (calendario, evento), no solo por evento
  google_calendar_id text,
  google_event_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint task_calendar_pair check (
    (google_calendar_id is null) = (google_event_id is null)
  ),
  constraint done_has_timestamp check (
    (status = 'done') = (completed_at is not null)
  )
);

-- Índices parciales sobre las dos consultas que son el 80% del tráfico
create index tasks_pending_due on tasks (user_id, due_at)
  where status = 'pending';
create index tasks_by_project  on tasks (user_id, project_id)
  where status <> 'cancelled';
create unique index tasks_google_event on tasks (google_calendar_id, google_event_id)
  where google_event_id is not null;
```

Las dos `check` constraints al final valen más de lo que parecen: hacen que estados imposibles sean **inexpresables**, en vez de confiar en que la aplicación no los cree. Es la misma lógica de bajar las garantías de capa.

### 4.2 Tablas operativas

```sql
-- Ingesta durable (C2)
create table inbox (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  channel     text not null,
  external_id text not null,
  payload     jsonb not null,
  status      text not null default 'pending'
              check (status in ('pending','processing','done','failed')),
  attempts    int not null default 0,
  last_error  text,
  received_at timestamptz not null default now(),
  claimed_at  timestamptz,
  unique (channel, external_id)          -- deduplicación por constraint
);
create index inbox_queue on inbox (received_at) where status in ('pending','processing');

-- Idempotencia del agente (S3)
create table tool_executions (
  tool_call_id text primary key,         -- único por llamada, garantizado por la API
  user_id      uuid not null references auth.users(id) on delete cascade,
  action       text not null,
  result       jsonb,
  created_at   timestamptz not null default now()
);

-- Confirmación de operaciones destructivas (S6)
create table pending_actions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid,
  action          text not null,
  args            jsonb not null,
  expires_at      timestamptz not null default now() + interval '10 minutes',
  consumed_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- Circuit breaker de costo (S5)
create table usage_budget (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  period         date not null default date_trunc('month', now())::date,
  input_tokens   bigint  not null default 0,
  output_tokens  bigint  not null default 0,
  usd_spent      numeric(10,4) not null default 0,
  limit_usd      numeric(10,2) not null default 25,
  writes_today   int not null default 0,
  writes_date    date not null default current_date
);

-- Credenciales externas, cifradas en la aplicación antes de llegar aquí
create table integrations (
  user_id                 uuid not null references auth.users(id) on delete cascade,
  provider                text not null,
  encrypted_refresh_token bytea not null,     -- AES-256-GCM, clave fuera de la BD
  scopes                  text[] not null,
  expires_at              timestamptz,
  primary key (user_id, provider)
);

create table conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  channel    text not null,
  started_at timestamptz not null default now(),
  last_at    timestamptz not null default now()
);

create table messages (
  id              bigserial primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('user','assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);
create index messages_recent on messages (conversation_id, created_at desc);
```

### 4.3 Auditoría por trigger (C3 + C4)

Esta es la corrección más importante del documento. La v1 pedía a cada caso de uso que se auto-registrara; la v2 lo hace imposible de evitar.

```sql
create table audit_log (
  id              bigserial primary key,
  occurred_at     timestamptz not null default now(),
  user_id         uuid not null,
  actor           text not null,        -- user | agent | system
  channel         text,
  conversation_id uuid,
  action          text not null,        -- 'tasks.update', 'goals.delete', ...
  entity_type     text not null,
  entity_id       uuid,
  before          jsonb,
  after           jsonb,
  tool_call_id    text,
  outcome         text not null default 'ok'
);
create index audit_by_entity on audit_log (entity_type, entity_id, occurred_at desc);
create index audit_recent    on audit_log (user_id, occurred_at desc);
```

**El contexto del actor viaja por GUCs transaccionales.** Se fija al abrir la transacción y muere con ella — no hay estado global que se filtre entre peticiones concurrentes:

```sql
create or replace function set_actor_context(
  p_actor text, p_channel text, p_conversation uuid, p_tool_call text
) returns void language sql as $$
  select set_config('app.actor',        p_actor,                   true),  -- true = local a la tx
         set_config('app.channel',      coalesce(p_channel,''),    true),
         set_config('app.conversation', coalesce(p_conversation::text,''), true),
         set_config('app.tool_call',    coalesce(p_tool_call,''),  true);
$$;
```

> **Corrección post-auditoría — transporte del actor (ADR-016).** `set_actor_context` fija GUCs
> **locales a la transacción**. Eso funciona cuando la escritura ocurre dentro de una función RPC
> de Postgres, pero **no** cuando se escribe con el cliente REST de Supabase (PostgREST), que
> abre una transacción por request y no deja anteponer `select set_actor_context(...)` a la
> escritura. En ese caso el trigger leería el actor vacío y marcaría todo como `system`.
>
> Por eso el actor viaja como **claims del JWT** (el worker ya firma un JWT efímero): el firmador
> añade `actor / channel / conversation / tool_call`, y el trigger los lee de
> `current_setting('request.jwt.claims', true)::jsonb` —la misma vía por la que Supabase resuelve
> `auth.uid()`, disponible por request y por tanto transaccionalmente correcta—. `set_actor_context`
> se conserva para el camino de Server Actions vía RPC o `db-pre-request`.

**El trigger genérico**, con el manejo correcto de `OLD`/`NEW` según la operación (referenciar `NEW` en un trigger de DELETE lanza excepción — error frecuente). Lee el actor con *fallback*: primero los claims del JWT (camino REST), luego el GUC de sesión (camino RPC), y por último `'system'`:

```sql
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

  -- Claims del JWT (camino REST); NULL si no hay JWT en la sesión (camino RPC)
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

create trigger audit_tasks    after insert or update or delete on tasks
  for each row execute function audit_row();
create trigger audit_projects after insert or update or delete on projects
  for each row execute function audit_row();
create trigger audit_goals    after insert or update or delete on goals
  for each row execute function audit_row();
```

> **Invariante de implementación — owner del trigger.** `audit_row()` es `security definer`, así
> que corre con los privilegios de **su dueño**. Como `audit_log` lleva `force row level security`
> y solo tiene política de `select`, el INSERT del trigger únicamente pasa si la función es
> propiedad de un rol con **BYPASSRLS** (`postgres` en Supabase). Las migraciones corren como
> `postgres`, así que sale bien por defecto; pero recrear la función con otro owner rompería la
> auditoría en silencio. Debe cubrirse con un test en `tests/security/` (ver Etapa 0).

**Inmutabilidad real** (C4). Un trigger se dispara para *cualquier* rol, incluido `service_role`:

```sql
create or replace function reject_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log es append-only (intento de %)', TG_OP
    using errcode = 'insufficient_privilege';
end $$;

create trigger audit_log_immutable
  before update or delete on audit_log
  for each row execute function reject_mutation();
```

> **Límite honesto:** un superusuario con `session_replication_role = replica` puede desactivar triggers. Es decir, quien tenga acceso de superusuario al proyecto de Supabase puede alterar el log. Esto es cierto para cualquier log en la misma base de datos y no tiene solución dentro de este stack; la solución real sería replicar a un almacén externo de solo-anexado. Para un sistema personal, el trigger es proporcionado. Está declarado para que nadie lo asuma más fuerte de lo que es.

**Y de paso, `updated_at`** (M2):

```sql
create or replace function touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create trigger touch_tasks before update on tasks
  for each row execute function touch_updated_at();
-- ídem projects, goals
```

---

## 5. Seguridad

### 5.1 Perímetro

Sin cambios respecto a la v1 y sigue siendo lo más rentable del documento: **lista blanca de un solo remitente**. Un sistema de un usuario que rechaza todo lo que no venga de un `chat_id` conocido elimina casi toda la superficie de ataque por una línea de código. Más firma verificada sobre cuerpo crudo (§3.1), deduplicación por constraint y rate limit (§5.5).

### 5.2 El agente corre con los privilegios del usuario (C1)

**El fallo más grave de la v1.** La app web tenía sesión de usuario, así que RLS aplicaba. Pero el worker de WhatsApp no tiene sesión, y la única forma directa de escribir sin ella es `service_role`, que bypasea RLS. Resultado: en el camino con inyección de prompts, RLS no protegía nada.

Corrección: el worker **firma un JWT efímero** con el mismo secreto del proyecto y actúa como el usuario.

```ts
// adapters/supabase/as-user.ts
export function clientAsUser(userId: string) {
  const token = jwt.sign(
    { sub: userId, role: 'authenticated', aud: 'authenticated',
      iat: now(), exp: now() + 120 },              // 2 minutos: sobra para un turno
    process.env.SUPABASE_JWT_SECRET!
  );
  return createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
```

Ahora `auth.uid()` funciona, RLS aplica, y la segunda capa de defensa contra inyección **existe de verdad**.

`service_role` queda restringida a exactamente dos usos, ambos fuera del alcance del agente: el INSERT en `inbox` (antes de saber quién es el usuario) y las migraciones. Regla de CI: `service_role` no puede importarse desde `agent/**` ni desde `core/**`.

**El reclamo del inbox también corre bajo RLS (ADR-017).** Reclamar una fila `pending` exige
leerla antes de saber de qué usuario es, y sin sesión lo natural sería `service_role` —lo que
reabriría C1 en el camino con superficie de inyección—. Como el sistema es de **un solo usuario**,
el worker firma el JWT del `ALLOWED_USER_ID` constante (`adapters/supabase/as-user.ts`) y reclama
bajo RLS: la política `user_id = (select auth.uid())` cubre todas las filas del inbox. Así el
enunciado "dos usos de `service_role`" se mantiene intacto, y el reclamo no importa `admin.ts`.

### 5.3 Políticas RLS (S2)

```sql
alter table tasks enable row level security;
alter table tasks force  row level security;   -- aplica también al owner de la tabla

-- (select auth.uid()) → InitPlan, se evalúa UNA vez por consulta.
-- auth.uid() desnudo → se evalúa una vez POR FILA.
create policy tasks_owner on tasks for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
```

Lo mismo para `goals`, `projects`, `messages`, `conversations`, `pending_actions`, `tool_executions`, `integrations`, `profiles`.

`audit_log` es un caso aparte: solo `select` para el dueño; el `insert` lo hace el trigger `security definer`; `update`/`delete` los bloquea el trigger de inmutabilidad.

**Chequeo en CI que debe devolver cero filas:**

```sql
select tablename from pg_tables
 where schemaname = 'public' and rowsecurity = false
union all
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
   and not exists (select 1 from pg_policies p
                   where p.schemaname='public' and p.tablename = c.relname);
```

La segunda mitad detecta el fallo silencioso opuesto: RLS activada **sin ninguna política**, que bloquea todo y suele "arreglarse" con un `service_role` de más.

### 5.4 Inyección de prompts

La defensa arquitectónica de la v1 era correcta en el planteamiento y **estaba rota en la implementación** (C1). Reparada, queda así, en orden de robustez:

| Capa | Qué garantiza | Se puede vencer con... |
|---|---|---|
| 1. RLS con JWT del usuario | El agente no puede tocar datos ajenos | acceso de superusuario |
| 2. `/core`: ownership + reglas | Estados inválidos son inalcanzables | un bug en `/core` |
| 3. Catálogo cerrado de herramientas | El daño máximo está acotado por el catálogo | ampliar el catálogo sin pensarlo |
| 4. Confirmación de destructivas (§6.4) | Nada irreversible sin un turno de por medio | nada, si el UUID no es adivinable |
| 5. Presupuesto de escrituras (§5.5) | Un ataque exitoso se detiene tras N acciones | nada, es un contador |
| 6. Sobre `<datos_externos>` en el prompt | Reduce la probabilidad | un ataque bien construido |

La capa 6 es la única probabilística, y es la que la mayoría de los tutoriales presenta como *la* solución. Aquí es la última de seis, no la primera.

**El vector concreto en este sistema** sigue siendo el mismo y merece repetirse: un tercero envía una invitación de calendario cuyo título contiene instrucciones. El agente lee ese evento. Es contenido de un atacante con apariencia de dato propio. Las capas 1–5 no dependen de que el modelo lo detecte.

### 5.5 Presupuesto y circuit breaker (S5)

Sin Redis. Postgres alcanza y sobra:

```sql
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
         writes_date  = current_date,
         writes_today = case when writes_date <> current_date then 0 else writes_today end
   where user_id = p_user
   returning usd_spent <= limit_usd into v_ok;

  return coalesce(v_ok, false);
end $$;
```

Tres cortes independientes:

- **Mensual, en dólares.** Al superar el tope, el agente se apaga y avisa por el canal. La app web sigue funcionando: nunca pierdes acceso a tus datos porque el LLM se pasó de presupuesto.
- **Escrituras por conversación.** Máximo 10. Una inyección que atraviese todo lo demás no puede borrarte la semana.
- **Iteraciones por turno.** Máximo 8 llamadas a herramientas. Corta bucles del modelo, que son la causa habitual de facturas sorpresa.

Este mecanismo cubre una amenaza que la v1 nombraba ("agotamiento del crédito de la API") sin dar ninguna forma de detenerla.

### 5.6 Secretos

Refresh tokens de Google cifrados con AES-256-GCM antes del INSERT, clave en variable de entorno — nunca en la base de datos, porque si el atacante tiene la base tendría también la llave. Redacción de logs por **lista blanca** de campos permitidos, no lista negra de prohibidos: la lista negra siempre se queda corta.

---

## 6. El agente

### 6.1 Layout de caché (S1)

El orden de caché de la API de Anthropic es `tools → system → messages`. Un solo `cache_control` al final del bloque `system` cubre las herramientas y el prompt.

```
┌─ tools: definiciones de las ~30 herramientas ─┐
│                                                │  ~5.000 tokens
├─ system: instrucciones estables ──────────────┤  estables entre peticiones
│                              [cache_control] ← breakpoint
├─ messages ────────────────────────────────────┤
│  · hora actual + zona (VOLÁTIL)               │
│  · tareas de hoy                              │  cambia siempre
│  · historial de la conversación               │
└────────────────────────────────────────────────┘
```

**Regla que evita el bug:** cualquier cosa que cambie entre dos peticiones va en `messages`, jamás en `system`. La v1 ponía la fecha y hora en el contexto sin especificar dónde, y el sitio natural es el principio del system prompt — que invalida el caché completo en cada llamada y multiplica por 10 el costo de input.

Con el caché bien puesto: lectura a `$0.20/MTok` frente a `$2/MTok` de input estándar en Sonnet 5. La escritura de 5 minutos cuesta 1.25x, así que se amortiza tras **una sola** lectura.

### 6.2 Fechas y horas (C5)

El bug más caro de la v1, y el más silencioso: no falla, solo pone las cosas cinco horas antes.

```ts
// agent/tools/schemas.ts
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/;

export const Instant = z.string()
  .regex(ISO_WITH_OFFSET, 'Debe ser ISO-8601 con offset explícito (ej. 2026-07-23T16:00:00-05:00)')
  .transform((s) => new Date(s))
  .refine((d) => !Number.isNaN(d.getTime()), 'Fecha inválida')
  .refine((d) => d > subYears(new Date(), 1) && d < addYears(new Date(), 2),
          'Fecha fuera del rango razonable');
```

Nunca `z.coerce.date()` sobre salida de un modelo: acepta `"2026-07-23T16:00"` y lo interpreta en la zona del servidor, que en un entorno serverless es UTC.

Complemento en el contexto del turno, en `messages`:

```
Ahora: 2026-07-22T14:30:00-05:00 (America/Bogota, miércoles)
Al llamar herramientas con fechas, emite siempre ISO-8601 con offset explícito.
```

El modelo resuelve "mañana a las 4" contra un ancla que sí conoce, y el schema rechaza cualquier cosa ambigua. Dos capas para el mismo problema, porque este falla en silencio.

### 6.3 Idempotencia (S3)

Consecuencia directa de hacer durable el procesamiento: los reintentos son ahora posibles, y sin idempotencia crearían tareas duplicadas.

```ts
export async function executeTool(ctx: ActorContext, call: ToolCall) {
  const { data: cached } = await db.from('tool_executions')
    .select('result').eq('tool_call_id', call.id).maybeSingle();
  if (cached) return cached.result;              // ya se ejecutó: devolvemos lo mismo

  const result = await handlers[call.name](ctx, call.input);

  await db.from('tool_executions').insert({
    tool_call_id: call.id, user_id: ctx.userId, action: call.name, result,
  });
  return result;
}
```

El `tool_call_id` viene de la API y es único por llamada — no hay que inventar una clave.

### 6.4 Confirmación de operaciones destructivas (S6)

La v1 decía "token de confirmación de un turno anterior" sin explicar de dónde salía.

```
Turno 1  usuario: "borra las tareas del proyecto viejo"
         agente → propose_destructive(action='project.purge', args={...})
                → devuelve { confirmation_id: '8f3a...', afecta: 12 tareas }
         agente al usuario: "Voy a borrar 12 tareas de 'Proyecto viejo'. ¿Confirmas?"

Turno 2  usuario: "sí"
         agente → confirm(confirmation_id: '8f3a...')
                → /core valida: existe, es del usuario, no consumida, no expirada
                → ejecuta, marca consumed_at
```

Por qué es sólido: el modelo **no puede fabricar** un UUID que exista en `pending_actions` con el `user_id` correcto y sin consumir. La confirmación no es una promesa del prompt, es una fila en una tabla. Y como caduca a los 10 minutos, un "sí" descontextualizado más tarde no dispara nada.

### 6.5 Alcance real del undo (S4)

La v1 afirmaba que `deshacer_ultima_accion` era "casi gratis" gracias al log. Es falso.

| Caso | ¿Reversible? | Por qué |
|---|---|---|
| Cambio de campo en una tarea | ✅ | `before` tiene el valor anterior |
| Crear tarea | ✅ | se borra |
| Borrar tarea sin evento asociado | ✅ | se reinserta desde `before` |
| Borrar tarea **con** evento de Google | ⚠️ parcial | el evento se recrea con **otro id**; se pierden invitados y confirmaciones |
| Borrar proyecto (cascada a tareas) | ⚠️ complejo | hay que revertir N filas en orden inverso, en una transacción |
| Mover un evento con invitados | ❌ | las notificaciones ya salieron; no se des-envían |
| Cualquier acción con acciones posteriores encima | ❌ | revertirla deja el estado incoherente |

Decisión: **el undo se ofrece solo para el caso simple** — una operación, una entidad, sin efectos externos, últimos 5 minutos, sin acciones posteriores sobre la misma entidad. En cualquier otro caso el agente dice qué se hizo y ofrece rehacerlo manualmente. Prometer un undo universal y entregar uno parcial es peor que no ofrecerlo.

### 6.6 Google Calendar: el costo que la v1 no nombró

La v1 celebraba que no guardar eventos elimina la sincronización. Cierto, pero tiene precio: **cada consulta de calendario es una llamada de red de 200–500 ms**, y "detectar conflictos" o "sugerir hueco libre" necesitan la agenda completa.

Mitigaciones, sin abandonar el principio:

- Usar el endpoint **`freebusy`** para conflictos y huecos: devuelve solo intervalos ocupados, es mucho más liviano que listar eventos.
- **Caché de 60 segundos** en memoria del worker para la ventana de ±7 días. Un turno de agente hace varias consultas; solo la primera paga.
- **Reintentos con backoff** ante 403/429 (Google los usa para rate limiting).
- **Nunca dos llamadas secuenciales** donde quepa un `Promise.all`.

Y la política que faltaba (M4): **borrar una tarea NO borra el evento de Google.** Se desvincula (`google_event_id = null`) y se avisa. Borrar datos de un sistema externo por una inferencia del modelo es exactamente el tipo de acción irreversible que este diseño evita.

---

## 7. Estructura del repositorio

```
proyecto/
├── app/
│   ├── (dashboard)/
│   ├── api/
│   │   ├── channels/{telegram,whatsapp}/route.ts   # solo firma + INSERT + 200
│   │   ├── worker/route.ts                          # consume inbox
│   │   ├── chat/route.ts                            # SSE streaming
│   │   └── cron/{sweep,digest}/route.ts
│   └── actions/                                     # Server Actions → /core
│
├── core/                          # ★ dominio puro, sin imports de framework
│   ├── tasks/ projects/ goals/ calendar/
│   └── types.ts                   # Result<T>, ActorContext, taxonomía de errores
│
├── agent/
│   ├── loop.ts                    # presupuestos e iteraciones máximas
│   ├── tools/                     # ~15 líneas por herramienta
│   ├── schemas.ts                 # Zod: valida + genera JSON Schema + genera docs
│   ├── prompts/                   # .md versionados
│   └── context.ts                 # respeta el layout de caché de §6.1
│
├── adapters/
│   ├── supabase/
│   │   ├── as-user.ts             # JWT efímero — la vía normal
│   │   └── admin.ts               # service_role — SOLO inbox y migraciones
│   ├── google-calendar/ anthropic/ messaging/
│
├── lib/{auth,crypto,budget,redact}.ts
├── supabase/migrations/           # esquema + RLS + triggers, versionado
├── docs/{README,adr/,schema.md,tools.md,runbook.md}
└── tests/{core,security,integration}/
```

### Reglas verificadas por la máquina

`dependency-cruiser` en CI. Estas cinco *son* la arquitectura; lo demás es convención:

| Regla | Protege |
|---|---|
| `core/**` no importa `app/`, `agent/`, `adapters/`, `next` | pureza y testabilidad del dominio |
| `agent/**` no importa `adapters/supabase/**` | el agente no toca la BD |
| **`adapters/supabase/admin.ts` solo importable desde `app/api/channels/**`** | `service_role` fuera del camino del agente (C1) |
| Solo `adapters/supabase/**` importa `@supabase/*` | un único punto de acceso a datos |
| Ninguna variable `NEXT_PUBLIC_*` contiene `SERVICE_ROLE` o `SECRET` | filtración al bundle del navegador |

La tercera regla es nueva y es la que impide que C1 vuelva a aparecer en seis meses.

---

## 8. Tests

Tres niveles, y el segundo es el que la v1 planteaba mal.

**Dominio** (`tests/core/`) — rápidos, sin red, sin base de datos. Cubren reglas de negocio y casos límite.

**Seguridad** (`tests/security/`) — contra Postgres real. **Aquí estaba M7:** un test de RLS ejecutado con `service_role` pasa siempre, porque `service_role` bypasea RLS. No prueba nada y da falsa confianza.

```sql
-- Correcto: adoptar el rol y los claims de un usuario real
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

  select is(
    (select count(*) from tasks where user_id = '22222222-2222-2222-2222-222222222222'),
    0::bigint,
    'RLS impide leer tareas de otro usuario'
  );
rollback;
```

Casos obligatorios: aislamiento entre usuarios, `audit_log` no aceptando UPDATE ni DELETE, trigger de auditoría disparando en las tres operaciones, y las dos consultas de §5.3 devolviendo cero filas.

**Integración** (`tests/integration/`) — inbox con reintentos, idempotencia por `tool_call_id` (mismo id dos veces = un solo efecto), y el flujo de confirmación completo.

---

## 9. Costos (revisados)

Cambios respecto a la v1: se corrige el efecto del caché (S1) y se retira el enrutamiento a Haiku (M9).

| Concepto | Costo/mes | Nota |
|---|---|---|
| Supabase Free | $0 | 500 MB. Sin backups → respaldo propio desde Fase 0, no negociable. **El barrido del inbox corre aquí** (`pg_cron` + `pg_net`, precisión de minuto, gratis). |
| Vercel Hobby | $0 | Solo proyectos personales no comerciales. **No se usa su cron** (Hobby = 1 ejecución/día); el barrido vive en Supabase. Ver ADR-015. |
| Google Calendar API | $0 | Dentro de cuotas. |
| Anthropic — input cacheado | $1.44 | 7.2M tok × $0.20/MTok |
| Anthropic — input no cacheado | $1.20 | 0.6M tok × $2/MTok |
| Anthropic — output | $6.00 | 0.6M tok × $10/MTok |
| Telegram | $0 | — |
| **Total** | **~$8.60** | ~$12 desde el 1-sep-2026 (fin del precio introductorio de Sonnet 5) |

Con WhatsApp en lugar de Telegram, sumar ~$3–6/mes desde el 1 de octubre de 2026.

**El output es el 70% de la factura** y cuesta 5x el input en todos los modelos de la familia. La palanca de ahorro no es cachear más — el caché ya está casi optimizado — sino **pedir respuestas más cortas**, que además es lo correcto para un asistente por chat. Bajar la respuesta media de 500 a 300 tokens ahorra más que cualquier cambio de infraestructura.

Sobre el enrutamiento a Haiku (M9): añade una llamada de clasificación, o sea latencia en el 100% de los turnos, para ahorrar unos $3/mes. **No compensa hasta tener datos.** Si más adelante los números lo justifican, la decisión correcta es enrutar por heurística barata (longitud del mensaje, presencia de confirmación pendiente), no por una llamada extra al modelo.

Retención (M8): a 600 acciones/mes con `before`/`after` en jsonb, el log crece ~5 MB/año. Irrelevante frente a los 500 MB del plan gratuito. Revisar si algún día supera el 20% de la cuota.

---

## 10. Plan por fases

**Fase 0 — Cimientos.** Next.js 16 + TS estricto · migraciones con esquema completo, RLS `force`, triggers de auditoría e inmutabilidad · `profiles` con zona horaria · CI con `dependency-cruiser`, chequeos de RLS y tests de seguridad · **respaldo automatizado**.
*Termina cuando:* una tarea creada a mano genera su fila de auditoría, un intento de `update` sobre `audit_log` lanza excepción, y el test de aislamiento RLS pasa ejecutándose como `authenticated`.

**Fase 1 — Dominio + app web.** Los ~15 casos de uso · UI mobile-first · OAuth de Google con token cifrado · Realtime.
*Termina cuando:* el sistema se usa a diario **sin agente**. Si no sirve sin IA, la IA no lo salva.

**Fase 2 — Agente en web.** Loop con presupuestos · catálogo de herramientas · idempotencia · confirmación destructiva · layout de caché · streaming SSE.
*Termina cuando:* "mueve la reunión del martes a las 4" funciona, queda auditado, y repetir el mismo `tool_call_id` no duplica nada.

**Fase 3 — Canal de mensajería.** Inbox durable · worker con JWT efímero · firma · lista blanca · cron de barrido.
*Termina cuando:* matar el worker a mitad de un mensaje y verlo recuperarse solo en menos de 60 s.

**Fase 4 — Inteligencia.** Resúmenes por cron · conflictos y huecos vía `freebusy` con caché · undo acotado · reestructuración proponer-confirmar.

**Fase 5 — Voz.** STT en el borde del canal. **Sin tocar el agente**, porque todo entra como texto plano desde el día uno.

---

## 11. Lo que sigue sin tener (y por qué)

Sin microservicios · sin cola dedicada (el inbox en Postgres cubre el caso con menos piezas) · sin event sourcing · sin Redis · sin base vectorial (`pgvector` ya está ahí si algún día hace falta) · sin GraphQL ni tRPC.

Cada ausencia es reversible sin rehacer nada, precisamente porque el dominio no depende de ninguna.

---

## 12. Lo que esta auditoría enseña

Los cinco fallos críticos comparten un patrón: **la v1 declaraba garantías que el código no podía cumplir.**

- Decía "RLS es la última línea de defensa", pero el camino del agente la bypaseaba (C1).
- Decía "todo lo que muta se registra", pero dependía de que alguien lo escribiera (C3).
- Decía "log inmutable", pero el `REVOKE` no lo hacía inmutable (C4).
- Decía "durable", y perdía mensajes en silencio (C2).

La corrección en los cuatro casos es la misma: **bajar la garantía de capa**. Lo que promete el código de aplicación es una intención; lo que impone el motor de base de datos es un hecho. Un trigger no se olvida de dispararse, una constraint no tiene un `catch` mal puesto, y RLS no depende de que el desarrollador recuerde filtrar.

La regla general que sale de aquí, y que conviene aplicar a toda decisión futura del proyecto:

> Si una propiedad del sistema depende de que alguien se acuerde de algo, no es una propiedad del sistema. Es una esperanza.
