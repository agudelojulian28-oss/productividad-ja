# Productividad Julián Agudelo — Arquitectura v3

**Fecha:** 23 de julio de 2026 · **Repositorio sugerido:** `productividad-ja`
**Extiende:** v2.0 auditada. Todo lo de la v2 sigue vigente salvo lo que aquí se amplía explícitamente.

> **Qué NO cambia de la v2:** ingesta durable (§3), JWT efímero del usuario (§5.2), RLS forzada (§5.3), auditoría por trigger (§4.3), inmutabilidad del log (§4.3), layout de caché (§6.1), fechas con offset obligatorio (§6.2), idempotencia (§6.3), confirmación destructiva (§6.4), presupuestos (§5.5), estructura de tests (§8).
>
> **Qué cambia:** el modelo de dominio, la organización de `/core`, el catálogo de herramientas y el plan de etapas.

---

## 0. El riesgo de este alcance

El alcance que describiste no es grande por el número de funcionalidades. Es grande por la **tentación estructural** que trae: fuentes de ingreso, ofertas, procesos de venta, procesos de entrega, clientes, ventas, transacciones, proyectos, tareas, metas, agenda, área personal.

Si a cada una se le da su tabla, su módulo y su herramienta del agente, terminas con ~50 herramientas. Y ahí pasan tres cosas, todas malas:

1. El modelo empieza a elegir mal entre herramientas parecidas (`crear_tarea` vs `crear_paso` vs `crear_actividad`).
2. Las definiciones de herramientas se comen 12k tokens del contexto en cada llamada.
3. Nadie —tú incluido— recuerda dónde vive cada regla.

Este documento contiene ese crecimiento con **tres decisiones**. Las tres importan más que el esquema SQL:

| Decisión | Qué contiene |
|---|---|
| **D1 · "Cómo lo vendo / cómo lo entrego" son *playbooks*, no tablas** | Un proceso repetible es un documento con pasos. Instanciarlo genera tareas. Un mecanismo, no seis. |
| **D2 · Venta y entrega son un solo ciclo de vida** | `prospecto → propuesta → ganada → entregando → entregada → cobrada`. Una tabla, no dos. |
| **D3 · El catálogo de herramientas cubre el flujo diario, NO la configuración** | Crear una fuente de ingreso o editar un playbook se hace en la UI. Son acciones raras y de alta precisión. El catálogo se queda en ~11 herramientas para siempre. |

D3 es la más importante y la menos obvia. Es la que impide que el catálogo crezca con el dominio.

---

## 1. El dominio

```
                        ÁREA  (negocio | personal)
                          │
        ┌─────────────────┼──────────────────────┐
        │                 │                      │
  FUENTE DE INGRESO   PROYECTOS             TRANSACCIONES
  "de dónde sale      "en qué trabajo"      "qué entra y sale"
   la plata"              │                      ▲
        │                 └──► TAREAS ──► EVENTOS│
        │                        ▲               │
     OFERTAS                     │               │
  "qué vendo aquí"               │               │
        │                        │               │
    PLAYBOOKS ───────────────────┘               │
  "cómo lo vendo"        instancia               │
  "cómo lo entrego"       tareas                 │
        │                                        │
        └──► VENTAS ────────────────────────────►┘
             (cliente + etapa + monto)     genera ingresos

                    METAS  ◄── miden todo lo anterior
                  (dinero · ventas · tareas · manual)
```

Se lee de arriba abajo. Cada nivel existe porque tiene una **invariante propia** que proteger, no porque sea una entidad más en un diagrama.

### 1.1 Las tres capas del dominio

| Capa | Tablas | Ritmo | Dónde se gestiona |
|---|---|---|---|
| **Estructura** — cómo está montado tu negocio | áreas, fuentes de ingreso, ofertas, playbooks, clientes | Cambia cada varios meses | **Solo UI** |
| **Flujo** — lo que pasa cada día | ventas, transacciones, proyectos, tareas | Cambia varias veces al día | UI + agente + WhatsApp |
| **Medición** — cómo vas | metas (vista calculada) | Se define poco, se consulta mucho | Definir: UI. Consultar: todos |

**Esta separación es la que hace posible D3.** El agente opera sobre el flujo, que es donde importa la velocidad ("vendí el diagnóstico a Carlos por 3 millones" mientras vas caminando). La estructura se configura sentado, con calma, viendo la pantalla — donde equivocarse es caro y la precisión importa más que la rapidez.

---

## 2. Modelo de datos

Diez tablas de dominio. La disciplina aquí fue **fusionar antes que añadir**: la primera versión de este modelo tenía catorce.

### 2.1 Estructura

```sql
-- La raíz. Todo cuelga de un área. 'personal' es un área más, no un caso especial.
create table areas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  kind        text not null check (kind in ('negocio','personal')),
  position    int  not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- "Mis fuentes de ingresos definidas"
create table income_sources (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  area_id    uuid not null references areas(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 120),
  model      text not null check (model in
             ('servicio','producto','suscripcion','empleo','inversion','otro')),
  status     text not null default 'active'
             check (status in ('active','paused','archived')),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

-- "Lo que vendo en cada una"
create table offerings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  income_source_id uuid not null references income_sources(id) on delete cascade,
  name             text not null,
  description      text,
  price_minor      bigint check (price_minor >= 0),   -- unidades menores, NUNCA float
  currency         char(3) not null default 'COP',
  unit             text not null default 'unidad',    -- hora | mes | proyecto | unidad
  status           text not null default 'active'
                   check (status in ('active','paused','archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- D1: "cómo lo vendo" y "cómo lo entrego" son documentos con pasos
create table playbooks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  offering_id uuid not null references offerings(id) on delete cascade,
  kind        text not null check (kind in ('venta','entrega')),
  name        text not null,
  steps       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (offering_id, kind)      -- un playbook de venta y uno de entrega por oferta
);

create table clients (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  area_id    uuid references areas(id) on delete set null,
  name       text not null,
  contact    jsonb not null default '{}'::jsonb,     -- teléfono, email, notas
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
```

**Por qué `steps` es `jsonb` y no una tabla.** Los pasos de un playbook siempre se leen juntos, se editan como una unidad y nunca se consultan por separado. Una tabla `playbook_steps` añadiría un JOIN a cada lectura y una tabla al esquema a cambio de nada. Es un documento; se guarda como documento.

Forma de un paso (validada con Zod en la aplicación, documentada en `docs/schema.md`):

```json
[
  { "titulo": "Enviar propuesta",       "offset_dias": 0,  "duracion_min": 45 },
  { "titulo": "Llamada de seguimiento", "offset_dias": 3,  "duracion_min": 30 },
  { "titulo": "Entregar informe",       "offset_dias": 14, "duracion_min": 120 }
]
```

`offset_dias` es relativo al inicio de la entrega, no una fecha fija. Es lo que hace el playbook reutilizable.

### 2.2 Flujo

```sql
-- D2: venta y entrega en un solo ciclo de vida
create table sales (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  offering_id uuid not null references offerings(id) on delete restrict,
  client_id   uuid references clients(id) on delete set null,

  stage text not null default 'prospecto' check (stage in
        ('prospecto','propuesta','negociacion',      -- cómo lo vendo
         'ganada','entregando','entregada','cobrada', -- cómo lo entrego
         'perdida')),

  amount_minor bigint  not null check (amount_minor >= 0),
  currency     char(3) not null default 'COP',
  expected_close date,
  closed_at      timestamptz,
  lost_reason    text,

  -- Guarda de idempotencia: ganar dos veces no crea dos entregas (v2 §6.3)
  delivery_instantiated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint closed_consistency check (
    (stage in ('ganada','entregando','entregada','cobrada','perdida'))
    = (closed_at is not null)
  ),
  constraint lost_has_reason check (stage <> 'perdida' or lost_reason is not null)
);
create index sales_open on sales (user_id, expected_close)
  where stage in ('prospecto','propuesta','negociacion');
create index sales_active_delivery on sales (user_id, updated_at desc)
  where stage in ('ganada','entregando');

-- Finanzas: registro simple, no contabilidad de partida doble
create table transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  area_id          uuid not null references areas(id) on delete restrict,
  income_source_id uuid references income_sources(id) on delete set null,
  sale_id          uuid references sales(id) on delete set null,

  direction    text    not null check (direction in ('in','out')),
  amount_minor bigint  not null check (amount_minor > 0),
  currency     char(3) not null default 'COP',
  -- Convertido a moneda base al registrar. Sin revaluación histórica.
  base_amount_minor bigint not null check (base_amount_minor > 0),
  fx_rate      numeric(14,6) not null default 1,

  occurred_on date not null default current_date,
  category    text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Un ingreso siempre sabe de qué fuente viene. Un gasto no lo necesita.
  constraint income_needs_source check (direction = 'out' or income_source_id is not null)
);
create index tx_period on transactions (user_id, occurred_on desc);
create index tx_income on transactions (user_id, income_source_id, occurred_on desc)
  where direction = 'in';
```

**Sobre el dinero.** `amount_minor bigint` = monto × 100, siempre, en cualquier moneda. Nunca `float`, nunca `numeric` para montos. La regla es absoluta porque los errores de redondeo en dinero no se detectan hasta que alguien cuadra cifras seis meses después. La conversión a moneda base se congela al registrar (`fx_rate`), así que un informe de marzo sigue diciendo lo mismo en diciembre.

### 2.3 Extensión de las tablas de la v2

```sql
alter table projects
  add column area_id          uuid references areas(id)          on delete restrict,
  add column income_source_id uuid references income_sources(id) on delete set null,
  add column sale_id          uuid references sales(id)          on delete set null;

alter table tasks
  add column origin             text check (origin in ('manual','agente','playbook')),
  add column origin_playbook_id uuid references playbooks(id) on delete set null,
  add column origin_step_index  int;
```

`origin` responde una pregunta que vas a hacerte mucho: *"¿esta tarea la puse yo, la puso el agente, o salió de un proceso?"* Y en la auditoría permite ver qué proporción de tu carga es generada automáticamente.

### 2.4 Metas: una tabla, una vista

Las metas miden cosas de naturaleza distinta —plata, ventas cerradas, tareas hechas— y ese es exactamente el punto donde los modelos se rompen en jerarquías de tipos. La salida es un campo `metric` y **el cálculo en una vista**:

```sql
create table goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  area_id          uuid references areas(id)          on delete cascade,
  income_source_id uuid references income_sources(id) on delete cascade,
  title            text not null,

  metric text not null check (metric in
         ('money_in','money_net','sales_won','tasks_done','manual')),
  target_value numeric(14,2) not null check (target_value > 0),
  currency     char(3),
  manual_value numeric(14,2) not null default 0,

  period_start date not null,
  period_end   date not null,
  status text not null default 'active'
         check (status in ('active','achieved','missed','archived')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint period_ordered      check (period_end >= period_start),
  constraint money_needs_currency check (
    metric not in ('money_in','money_net') or currency is not null)
);
```

```sql
-- security_invoker: SIN esto la vista corre con los privilegios del owner
-- y BYPASEA RLS. Es exactamente el fallo C1 de la v2 disfrazado de vista.
create or replace view goal_progress with (security_invoker = true) as
select
  g.id as goal_id, g.user_id, g.title, g.metric, g.target_value, g.currency,
  g.period_start, g.period_end, g.status,
  case g.metric

    when 'money_in' then coalesce((
      select sum(t.base_amount_minor)/100.0 from transactions t
       where t.user_id = g.user_id and t.direction = 'in'
         and t.occurred_on between g.period_start and g.period_end
         and (g.income_source_id is null or t.income_source_id = g.income_source_id)
         and (g.area_id          is null or t.area_id          = g.area_id)), 0)

    when 'money_net' then coalesce((
      select sum(case when t.direction = 'in' then t.base_amount_minor
                      else -t.base_amount_minor end)/100.0
        from transactions t
       where t.user_id = g.user_id
         and t.occurred_on between g.period_start and g.period_end
         and (g.income_source_id is null or t.income_source_id = g.income_source_id)
         and (g.area_id          is null or t.area_id          = g.area_id)), 0)

    when 'sales_won' then coalesce((
      select count(*) from sales s join offerings o on o.id = s.offering_id
       where s.user_id = g.user_id
         and s.stage in ('ganada','entregando','entregada','cobrada')
         and s.closed_at::date between g.period_start and g.period_end
         and (g.income_source_id is null or o.income_source_id = g.income_source_id)), 0)

    when 'tasks_done' then coalesce((
      select count(*) from tasks tk
       where tk.user_id = g.user_id and tk.status = 'done'
         and tk.completed_at::date between g.period_start and g.period_end), 0)

    else g.manual_value
  end as current_value
from goals g;
```

Tres beneficios de calcularlo en una vista en vez de en TypeScript:

1. **La UI y el agente leen exactamente lo mismo.** Imposible que el dashboard diga 62% y el agente diga 58%.
2. **Nada que desincronizar.** No hay campo `progreso` almacenado que se quede viejo.
3. **Es auditable de un vistazo.** Toda la lógica de "¿cómo voy?" cabe en una pantalla de SQL.

---

## 3. El mecanismo central: instanciar un playbook

Esto es lo que convierte diez tablas sueltas en un sistema. Sin este mecanismo tendrías un CRUD bonito; con él, vender algo *produce trabajo automáticamente*.

```
Vendes "Diagnóstico Financiero" a Carlos por $3.000.000
                 │
                 ▼
    sales.stage: 'negociacion' → 'ganada'
                 │
                 ▼
    Se lee el playbook de ENTREGA de esa oferta
                 │
                 ▼
    Se crea un PROYECTO ligado a la venta
                 │
                 ▼
    Se crean N TAREAS con fechas = inicio + offset_dias de cada paso
                 │
                 ▼
    Las tareas con hora aparecen en tu AGENDA
```

```ts
// core/commerce/win-sale.ts
export async function winSale(ctx: ActorContext, raw: unknown): Promise<Result<WonSale>> {
  const input = WinSaleInput.safeParse(raw);
  if (!input.success) return err('INVALID_INPUT', input.error);

  return db.transaction(async (tx) => {
    const sale = await tx.lockSale(ctx.userId, input.data.saleId);   // SELECT ... FOR UPDATE
    if (!sale) return err('NOT_FOUND');
    if (sale.stage === 'perdida') return err('SALE_ALREADY_LOST');

    // Idempotencia: reintento del inbox o doble tool_call no duplica la entrega
    if (sale.deliveryInstantiatedAt) return ok(await tx.loadWonSale(sale.id));

    await tx.updateSale(sale.id, { stage: 'entregando', closedAt: new Date() });

    const playbook = await tx.findPlaybook(sale.offeringId, 'entrega');
    let project = null;

    if (playbook && playbook.steps.length > 0) {
      project = await tx.insertProject({
        userId: ctx.userId, areaId: sale.areaId,
        incomeSourceId: sale.incomeSourceId, saleId: sale.id,
        title: `${sale.offeringName} — ${sale.clientName ?? 'sin cliente'}`,
      });

      const anchor = input.data.startDate ?? todayIn(ctx.tz);
      for (const [i, step] of playbook.steps.entries()) {
        await tx.insertTask({
          userId: ctx.userId, projectId: project.id, title: step.titulo,
          dueAt: addDaysInTz(anchor, step.offset_dias, ctx.tz),  // aritmética en TZ, no UTC
          origin: 'playbook', originPlaybookId: playbook.id, originStepIndex: i,
        });
      }
    }

    await tx.markDeliveryInstantiated(sale.id);
    return ok({ sale, project, tasksCreated: playbook?.steps.length ?? 0 });
  });
}
```

Cinco propiedades que no son accidentales:

- **Una sola transacción.** O se crean la venta, el proyecto y las 8 tareas, o no se crea nada. Nunca un proyecto huérfano sin tareas.
- **Idempotente por diseño.** El `delivery_instantiated_at` más el `FOR UPDATE` hacen que un reintento del inbox no duplique nada.
- **El playbook es opcional.** Sin playbook, la venta se gana igual. La automatización nunca es requisito para registrar la realidad.
- **Aritmética de fechas en tu zona horaria**, no en UTC. `+3 días` desde el viernes debe caer el lunes en Bogotá, no el domingo a las 19:00. (Ver v2 §6.2 — el bug de las 5 horas tiene primos.)
- **Los pasos se copian, no se referencian.** Editar el playbook mañana no reescribe las tareas de una entrega en curso. El playbook es una plantilla, no un vínculo vivo.

### 3.1 Dónde vive esta lógica, y por qué no en un trigger

La v2 aprendió que las garantías deben bajar de capa. Esto podría hacer pensar que este flujo también debería ser un trigger. **No.** La regla:

> **Triggers para invariantes. Dominio para flujos.**
>
> Un *invariante* es algo que debe ser cierto siempre, venga el cambio de donde venga: "toda mutación queda auditada", "`updated_at` refleja la última escritura". Nadie debe poder saltárselo, ni siquiera desde el editor SQL.
>
> Un *flujo* es una decisión de negocio con alternativas, fechas calculadas y casos límite: "al ganar una venta se instancian las tareas de entrega". Eso se prueba, se depura y se cambia — y en TypeScript se hacen las tres cosas mucho mejor que en PL/pgSQL.

Puesto de otra forma: si algún día quieres instanciar el playbook **sin** ganar la venta (para preparar una entrega adelantada), con un trigger estarías atrapado. Con un caso de uso, es un parámetro.

---

## 4. Organización de `/core`

Cinco módulos. La regla es: **un módulo nuevo solo cuando hay una invariante nueva que proteger**, no cuando hay una tabla nueva.

```
core/
├── structure/    areas · income-sources · offerings · playbooks · clients
│                 Invariante: la configuración es coherente y referenciable
│
├── work/         projects · tasks · calendar
│                 Invariante: nunca hay trabajo huérfano ni fechas imposibles
│
├── commerce/     sales · instanciación de playbooks
│                 Invariante: una venta ganada instancia su entrega EXACTAMENTE una vez
│
├── finance/      transactions
│                 Invariante: todo ingreso tiene fuente; el dinero nunca es float
│
└── goals/        goals + lectura de goal_progress
                  Invariante: el progreso se calcula, jamás se almacena
```

### Dependencias permitidas entre módulos

Sin esta regla, en tres meses tienes una bola de barro donde `finance` importa de `goals` que importa de `commerce` que importa de `finance`.

```
structure  ←── work
    ↑           ↑
    └── commerce ┘        commerce instancia tareas en work
    ↑
finance

goals  ──lee──► goal_progress (vista)     y NADA más
```

| Módulo | Puede importar de | Nunca importa de |
|---|---|---|
| `structure` | — | ninguno |
| `work` | `structure` | `commerce`, `finance`, `goals` |
| `commerce` | `structure`, `work` | `finance`, `goals` |
| `finance` | `structure` | `work`, `commerce`, `goals` |
| `goals` | `structure` (solo tipos) | todos los demás |

**`goals` no importa de nadie porque no lo necesita:** lee la vista `goal_progress`, que ya hizo el trabajo en SQL. Ese es el segundo beneficio, menos obvio, de calcular el progreso en una vista — evita que el módulo de metas se convierta en el que depende de todo.

Estas cinco filas se añaden a las reglas de `dependency-cruiser` de la v2 §7. Suben el total a diez reglas verificadas por CI, y esas diez *son* la arquitectura.

---

## 5. El catálogo de herramientas (D3)

**Once herramientas para todo el sistema.** No crece con el dominio, y ese es el punto.

### 5.1 El criterio

> Una funcionalidad necesita herramienta propia **solo si vas a pedirla por chat o voz más de una vez por semana.** Todo lo demás vive en la UI.

Aplicado a tu alcance:

| Acción | ¿Cuántas veces al mes? | ¿Herramienta? |
|---|---|---|
| "recuérdame llamar a Carlos el jueves" | ~60 | ✅ |
| "ya terminé el informe" | ~80 | ✅ |
| "vendí el diagnóstico a Carlos por 3M" | ~8 | ✅ |
| "gasté 200 mil en el almuerzo del equipo" | ~30 | ✅ |
| "¿cómo voy con la meta de este mes?" | ~20 | ✅ |
| Crear una fuente de ingreso nueva | ~0.3 | ❌ UI |
| Definir el playbook de entrega de una oferta | ~0.5 | ❌ UI |
| Editar el precio de una oferta | ~1 | ❌ UI |
| Crear un área nueva | ~0.1 | ❌ UI |

Configurar un playbook por WhatsApp sería miserable de todos modos: son ocho pasos con offsets y duraciones. Es trabajo de pantalla, teclado y calma.

### 5.2 Las once

**Consulta (2)**

| Herramienta | Uso |
|---|---|
| `consultar` | Vista discriminada: `agenda_hoy` · `pendientes` · `metas` · `ventas_abiertas` · `resumen_financiero`. Una herramienta, cinco vistas. |
| `buscar` | Texto libre sobre tareas, proyectos, ventas y clientes. |

**Trabajo (3)**

| Herramienta | Uso |
|---|---|
| `crear_tarea` | La más usada de todas. Acepta proyecto y fecha opcionales. |
| `completar` | Tarea o venta (`stage → cobrada`). Discriminada por tipo. |
| `reprogramar` | Cambia `due_at` de una tarea y su evento asociado. |

**Comercio (2)**

| Herramienta | Uso |
|---|---|
| `registrar_venta` | Crea la venta en cualquier etapa. Si entra directo en `ganada`, dispara §3. |
| `avanzar_venta` | Mueve de etapa. `→ ganada` instancia la entrega. |

**Finanzas (1)**

| Herramienta | Uso |
|---|---|
| `registrar_movimiento` | Ingreso o gasto. `direction` + monto + fuente/categoría. |

**Metas (1)**

| Herramienta | Uso |
|---|---|
| `definir_meta` | "quiero facturar 20 millones en agosto" es algo que se dice caminando. |

**Control (2)**

| Herramienta | Uso |
|---|---|
| `confirmar` | v2 §6.4. Recibe el UUID de `pending_actions`. |
| `deshacer` | v2 §6.5, con el alcance acotado que allí se declara. |

Costo en contexto: ~11 × 200 = **~2.200 tokens**, cacheados a $0.20/MTok. Irrelevante. Con 50 herramientas serían ~12.000 tokens *y* peor precisión de selección.

### 5.3 La consecuencia bonita

Fíjate en lo que pasa cuando llega una funcionalidad nueva —digamos, facturación electrónica:

- Tabla nueva: `invoices`. ✅ normal
- Casos de uso nuevos en `core/finance/`. ✅ normal
- Pantallas nuevas en la UI. ✅ normal
- **Herramientas nuevas: probablemente cero.** Emitir una factura no se pide por WhatsApp; se revisa antes de enviarla. Y "¿cuánto tengo sin cobrar?" ya cabe en `consultar`.

El catálogo se mantiene en once mientras el sistema crece. Eso es lo que significa "sin abusar de microservicios": la disciplina no está en no separar servicios —eso es fácil— sino en **no dejar que cada funcionalidad añada su tripleta módulo + tabla + herramienta**.

---

## 6. Las tres formas de gestionar lo mismo

Pediste que todo se pueda gestionar desde la UI, desde el LLM en la UI, y desde WhatsApp. **Ese requisito ya está satisfecho estructuralmente y no cuesta nada extra**, porque los tres caminos convergen antes de tocar datos:

```
UI manual        ──► Server Action ─┐
Chat en la web   ──► herramienta  ──┼──► /core  ──► Postgres (RLS + auditoría)
WhatsApp         ──► herramienta  ──┘
```

- Las reglas de negocio existen **una vez**.
- La auditoría registra los tres orígenes con el mismo trigger, distinguiéndolos por `actor` y `channel` (v2 §4.3).
- Un bug se arregla una vez, no tres.
- Realtime hace que crear algo por WhatsApp aparezca al instante en la pantalla abierta.

Sin la capa `/core`, "tres formas de hacer lo mismo" significa tres implementaciones que divergen en la semana cuatro. Esta arquitectura hace que el requisito salga gratis — y conviene notar que fue una decisión tomada antes de conocer el alcance, no un ajuste posterior. Ese es el sentido de que el dominio no sepa dónde vive.

---

## 7. Plan por etapas

Pediste construir por etapas y validar cada una antes de seguir. Cada etapa tiene una **prueba de aceptación falsable**: algo que se hace y se observa, no "quedó bonito". Si la prueba no pasa, no se avanza.

El orden no es arbitrario. Los playbooks generan tareas; si el motor de tareas no está sólido, los playbooks generan basura con más eficiencia. Por eso el comercio —la parte que más te interesa— va después, no por importancia sino por dependencia técnica.

---

### Etapa 0 — Cimientos · ~1 semana

Migraciones con el esquema completo del §2 · RLS forzada en las 20 tablas · triggers de auditoría e inmutabilidad · extensiones `pg_cron` y `pg_net` habilitadas (barrido, ADR-015) · `profiles` con zona horaria · CI con `dependency-cruiser` (10 reglas), chequeos de RLS y tests de seguridad · respaldo automatizado.

**Prueba de aceptación**
1. Crear un área a mano en el editor SQL → aparece su fila en `audit_log` con `actor = 'system'`.
2. `update audit_log set action = 'x'` → **lanza excepción**.
3. El test de aislamiento RLS pasa ejecutándose como `authenticated`, no como `service_role`.
4. `select * from goal_progress` como usuario A no devuelve metas de usuario B.
5. Con `audit_row()` recreada bajo un owner **sin** BYPASSRLS, una escritura falla; con owner
   `postgres`, la fila de auditoría se inserta. Valida el invariante de owner (v2 §4.3, ADR-016).

> La cuarta prueba existe porque una vista sin `security_invoker` bypasea RLS silenciosamente. Es el fallo C1 con otro traje.

---

### Etapa 1 — Trabajo · ~2 semanas

Áreas · proyectos · tareas · agenda. **Todo manual, todo desde la UI.** OAuth de Google Calendar con token cifrado. Realtime. Mobile-first.

**Prueba de aceptación:** usarlo **siete días seguidos** como tu gestor de tareas real, sin abrir la otra herramienta que uses hoy. Si al cuarto día vuelves a la anterior, algo falta y hay que encontrarlo antes de seguir.

> Esta es la etapa que la gente se salta y luego lamenta. Si el sistema no sirve **sin** IA, la IA no lo va a salvar — solo va a llenar más rápido una base de datos que no consultas.

---

### Etapa 2 — Agente en la web · ~2 semanas

Loop con presupuestos · **5 herramientas** (`crear_tarea`, `completar`, `reprogramar`, `consultar`, `buscar`) · layout de caché §6.1 v2 · idempotencia · confirmación destructiva · streaming SSE.

**Prueba de aceptación**
1. "mueve la reunión del martes a las 4" funciona, y el evento queda a las 16:00 **hora de Bogotá**.
2. La misma llamada con el mismo `tool_call_id` dos veces produce un solo efecto.
3. En el dashboard de Anthropic, el ratio de lectura de caché supera el 80%.
4. "borra todas las tareas de este proyecto" **pide confirmación** y no hace nada hasta recibirla.

> La tercera prueba es la que detecta el bug S1. Si el ratio está por el suelo, tienes contenido volátil por encima del breakpoint y estás pagando 10x sin enterarte.

---

### Etapa 3 — WhatsApp · ~1 semana

Inbox durable · worker con JWT efímero (reclamo bajo RLS con el JWT del usuario único, ADR-017) · verificación de firma · lista blanca de tu número · barrido por `pg_cron` + `pg_net` cada minuto (ADR-015), no Vercel Cron.

**Prueba de aceptación**
1. Mandar un mensaje y recibir respuesta en menos de 5 segundos.
2. **Matar el worker a mitad del procesamiento** → el barrido de `pg_cron` lo recupera solo en menos de 60 s. Esta prueba es innegociable: valida C2. (No es posible con Vercel Cron: Hobby = 1/día.)
3. Enviar el mismo mensaje dos veces → una sola tarea creada.
4. Golpear el webhook con una firma inválida → 401, y **nada** en el inbox.

---

### Etapa 4 — Dinero · ~2 semanas

Fuentes de ingreso · transacciones · metas monetarias · vista `goal_progress` · dashboard financiero · herramientas `registrar_movimiento` y `definir_meta`.

**Prueba de aceptación**
1. Cargar **tres meses de movimientos reales** y que los totales cuadren con tu banco al peso.
2. "¿cuánto llevo facturado este mes?" por WhatsApp devuelve el mismo número que el dashboard.
3. Una transacción en USD aparece correctamente convertida, y sigue mostrando el mismo valor una semana después.

> La primera prueba es la única que importa de verdad. Un sistema financiero que no cuadra con la realidad no es un sistema financiero: es una hoja de cálculo con más pasos.

---

### Etapa 5 — Comercio · ~3 semanas

Ofertas · clientes · playbooks (editor en la UI) · ventas con etapas · **instanciación §3** · herramientas `registrar_venta` y `avanzar_venta`.

**Prueba de aceptación**
1. Definir el playbook de entrega de tu oferta más frecuente.
2. Registrar una venta real, ganarla, y que aparezcan las tareas correctas con las fechas correctas.
3. Ganar la misma venta dos veces → **no** se duplica nada.
4. Editar el playbook → las tareas de la entrega en curso **no** cambian.
5. Registrar el cobro → la transacción queda ligada a la venta y suma a la meta de la fuente correspondiente.

**La etapa más riesgosa, y no por complejidad técnica.** El riesgo es de modelado: si tus entregas resultan ser todas distintas, los playbooks son peso muerto y hay que reemplazarlos por listas de verificación sueltas. Se descubre construyendo dos playbooks reales y viendo si el tercero se parece a alguno.

---

### Etapa 6 — Personal e inteligencia · ~2 semanas

Área personal con sus propias vistas · resúmenes diario y semanal por cron · detección de conflictos de agenda vía `freebusy` · sugerencia de huecos · `deshacer` acotado.

**Prueba de aceptación:** el resumen semanal del domingo te dice algo que no sabías. Si solo repite lo que ya viste durante la semana, es ruido y hay que replantearlo.

---

### Regla que atraviesa todas las etapas

> **No se empieza la etapa N+1 hasta que la etapa N lleva una semana en uso real.**

No una semana construida: una semana **usada**. La diferencia entre un sistema que usas y uno que abandonas se decide en esa semana, y solo se descubre viviéndola. Es también la razón por la que las estimaciones de arriba son de construcción y el calendario real será más largo — a propósito.

---

## 8. Decisiones que conviene que confirmes

Tres interpretaciones que hice de tu descripción. Ninguna bloquea la Etapa 0, pero equivocarse en la primera cuesta caro en la Etapa 5.

| # | Interpretación | Si me equivoqué |
|---|---|---|
| **A** | "Cómo lo entrego" es un proceso **repetible** por oferta ⇒ playbook | Si cada entrega es a medida, los playbooks sobran. Se reemplazan por listas de verificación ad-hoc por venta. Cambio de 2 días en la Etapa 5. |
| **B** | Quieres **pipeline de ventas** (prospecto → propuesta → ganada), no solo registrar ventas cerradas | Si solo registras cerradas, las tres primeras etapas de `sales` no estorban: creas la venta directamente en `ganada`. Cero trabajo extra. |
| **C** | Finanzas = **registro y seguimiento**, no facturación electrónica ni conciliación bancaria | Facturación DIAN es un proyecto propio del tamaño de las Etapas 4+5 juntas. Si lo necesitas, va después de la Etapa 6. |

---

## 9. Resumen de lo que se añadió y lo que se contuvo

| | v2 | v3 |
|---|---|---|
| Tablas de dominio | 4 | 10 |
| Tablas operativas | 7 | 7 (sin cambios) |
| Módulos en `/core` | 4 | 5 |
| Herramientas del agente | ~10 | **11** |
| Reglas de CI | 5 | 10 |
| Vistas | 0 | 1 |

El dominio se multiplicó por 2,5 y el catálogo de herramientas creció en una. Eso no es suerte: es D3, y es lo que hace que este sistema siga siendo manejable cuando llegue la funcionalidad número treinta.
