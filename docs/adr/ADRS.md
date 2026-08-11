# ADRs iniciales — Productividad Julián Agudelo

**Fecha:** 23 de julio de 2026

Registro de decisiones de arquitectura. Cada una recoge el contexto, la decisión, **las
alternativas descartadas** y las consecuencias. El valor no está en la decisión: está en
saber qué se consideró y por qué se dejó fuera.

> **Los ADRs son inmutables.** No se editan. Si una decisión cambia, se escribe una nueva que
> supersede a la anterior y la anterior se marca como superada, conservando su texto original.

**Primera tarea para Claude Code:** separar este archivo en `docs/adr/NNN-titulo.md`, un
archivo por decisión, conservando el texto tal cual.

---

## ADR-001 · Monolito modular en Next.js

**Contexto.** Un usuario, un desarrollador, tres canales de entrada (web, chat, WhatsApp).

**Decisión.** Un solo repositorio Next.js 16 que contiene frontend, rutas de API, agente y
capa de dominio. Un solo despliegue.

**Alternativas descartadas.** Backend separado en Python o Node; microservicios por dominio.

**Por qué.** Separar servicios añade despliegues, latencia de red, versionado de contratos y
modos de fallo distribuidos. A esta escala no compra nada. La modularidad se consigue con
disciplina de imports verificada en CI, no con procesos separados.

**Consecuencias.** Todo se despliega junto. Si el proyecto creciera a varios usuarios y un
equipo, `/core` ya está aislado y es extraíble sin reescribir.

---

## ADR-002 · Google Calendar es la fuente de verdad de los eventos

**Contexto.** El sistema gestiona tareas con fecha y eventos de agenda.

**Decisión.** No se almacenan eventos. `tasks.google_calendar_id` + `tasks.google_event_id`
son punteros al calendario real.

**Alternativas descartadas.** Calendario propio en Postgres; sincronización bidireccional.

**Por qué.** Recurrencia con excepciones (RRULE), zonas horarias, horario de verano,
invitados, notificaciones y confirmaciones. Es una trampa clásica: parece un CRUD con fechas
y no lo es. Sincronizar bidireccionalmente añade conflictos que no tienen solución correcta.

**Consecuencias.** Cada consulta de calendario es una llamada de red de 200–500 ms. Se mitiga
con el endpoint `freebusy` y caché de 60 s en el worker. Borrar una tarea **no** borra el
evento: se desvincula y se avisa.

---

## ADR-003 · Supabase (Postgres) como capa de datos

**Contexto.** Se necesita base de datos, autenticación y sincronización entre canales.

**Decisión.** Supabase: Postgres con RLS, Auth y Realtime.

**Alternativas descartadas.** Notion como capa de datos; Firebase; Postgres gestionado sin BaaS.

**Por qué.** Notion tiene un límite duro de ~3 req/s, latencia alta y no tiene tiempo real:
solo tenía sentido para ahorrarse construir una UI, y con UI propia pasa de atajo a limitación.
RLS permite que la autorización viva en el motor y no en la aplicación, que es la base de
ADR-004. Realtime hace que crear algo por WhatsApp aparezca al instante en la pantalla abierta.

**Consecuencias.** El plan gratuito no tiene copias de seguridad: hay que montar respaldo
propio desde la Etapa 0. Solo permite 2 proyectos.

---

## ADR-004 · El agente no tiene credenciales de base de datos

> **Estado:** aclarado por ADR-017 (cómo reclama el worker el inbox sin sesión) y ADR-018
> (dependencia del secreto JWT heredado). El texto original se conserva.

**Contexto.** El agente LLM ejecuta herramientas que mutan datos, y lee contenido de terceros
(invitaciones de calendario) que puede contener instrucciones inyectadas.

**Decisión.** El agente **propone** acciones. `/core` las valida, autoriza y ejecuta. El agente
no tiene claves de base de datos, no ejecuta SQL y no hace HTTP genérico. Además, todo el
camino del agente corre con un **JWT efímero del usuario**, con RLS activa; `service_role`
queda prohibida fuera de dos usos concretos.

**Alternativas descartadas.** Herramientas con acceso directo a la base; defensa basada
principalmente en instrucciones del prompt.

**Por qué.** Es la única defensa robusta contra inyección de prompts: ninguna instrucción,
legítima o inyectada, puede hacer algo que el usuario no pueda hacer, porque la autorización
no depende del modelo. Las defensas de prompt son probabilísticas y se vencen.

**Consecuencias.** Cada herramienta necesita su caso de uso. Es más código que llamar a la
base directamente, y es el precio correcto. La primera versión de este ADR estaba rota en la
implementación: el worker sin sesión usaba `service_role` y anulaba RLS justo en el camino
con superficie de inyección. Corregido en la auditoría v2 (C1).

---

## ADR-005 · Telegram como primer canal de mensajería

> Estado: reemplazado por ADR-020.

**Contexto.** El asistente debe ser accesible desde el teléfono sin abrir la app.

**Decisión.** Construir primero el adaptador de Telegram. WhatsApp después, si el hábito de
uso lo justifica.

**Alternativas descartadas.** WhatsApp primero.

**Por qué.** Meta anunció el 1 de julio de 2026 que desde el **1 de octubre de 2026** cobra
los *service messages* —las respuestas dentro de la ventana de 24 h, hoy gratuitas— por
mensaje, y aplica explícitamente a respuestas de asistentes de IA de terceros. Telegram Bot
API no tiene costo por mensaje, no exige verificación de negocio ante Meta, no requiere
plantillas aprobadas y se monta en minutos. Además, depurar un agente por WhatsApp es lento.

**Consecuencias.** ~USD 3–6/mes de ahorro y arranque mucho más rápido. El canal es
intercambiable en un día de trabajo por diseño (v3 §3.1), así que la decisión es reversible.

---

## ADR-006 · PWA en vez de aplicación nativa

**Contexto.** El uso principal es desde el teléfono.

**Decisión.** Aplicación web instalable como PWA. Sin React Native, sin Expo.

**Alternativas descartadas.** App nativa; app híbrida.

**Por qué.** Un solo código, instalable, arranque instantáneo. Las notificaciones ya llegan
por Telegram/WhatsApp, que es además donde se responden.

**Consecuencias.** Sin escritura offline: encolar mutaciones en el cliente exige resolución
de conflictos y una segunda fuente de verdad en el navegador. Se declara explícitamente que
no está soportado, en vez de ofrecer un guardado que pierde datos sin conexión.

---

## ADR-007 · Auditoría e inmutabilidad por trigger de Postgres

> **Estado:** aclarado por ADR-016. La auditoría por trigger y su inmutabilidad no cambian;
> lo que cambia es **cómo llega el contexto del actor** al trigger (claims del JWT, no un GUC
> de sesión fijado desde el cliente REST). El texto original se conserva.

**Contexto.** Requisito de que el sistema sea fácil de auditar.

**Decisión.** El registro de auditoría lo escriben triggers de Postgres, no el código de
aplicación. El contexto del actor viaja por GUCs transaccionales. La inmutabilidad del log se
impone con un trigger que lanza excepción en UPDATE y DELETE.

**Alternativas descartadas.** Llamadas explícitas a `audit.record()` en cada caso de uso, con
una regla de CI que verificara su presencia. `REVOKE UPDATE, DELETE` para la inmutabilidad.

**Por qué.** El diseño original dependía de que alguien recordara escribir la llamada, y
quedaba fuera de la transacción de escritura: un `catch` mal puesto o una edición desde el
editor SQL producían mutaciones sin registro. El `REVOKE` no hacía inmutable nada, porque
`service_role` y el owner lo esquivan. Un trigger se dispara para cualquier rol y desde
cualquier origen.

**Consecuencias.** Desaparece una regla de CI. Límite declarado: un superusuario con
`session_replication_role = replica` puede desactivar triggers. Inevitable dentro de este
stack; se resolvería replicando a un almacén externo de solo-anexado.

---

## ADR-008 · Ingesta durable en vez de procesamiento en línea

> **Estado:** aclarado por ADR-015. La ingesta durable no cambia; lo que se concreta es el
> **mecanismo del barrido**: `pg_cron` + `pg_net` en Supabase, no Vercel Cron (Hobby solo
> permite una ejecución diaria). El texto original se conserva.

**Contexto.** Los webhooks de mensajería exigen respuesta en pocos segundos, y un turno de
agente tarda 5–15 s.

**Decisión.** El webhook verifica la firma, hace INSERT en `inbox` y devuelve 200. Un worker
consume con reclamo atómico, reintentos y barrido por cron.

**Alternativas descartadas.** `after()` de Next.js para procesar tras responder. Cola dedicada
(Redis, SQS).

**Por qué.** Con `after()`, si la función se corta después del 200, la plataforma ya no
reintenta y el mensaje **desaparece sin rastro**. En un sistema cuyo propósito es no perderte
tareas, es el peor fallo posible. Una cola dedicada resuelve lo mismo añadiendo una pieza de
infraestructura que Postgres ya cubre con `for update skip locked`.

**Consecuencias.** La deduplicación pasa a ser un `unique (channel, external_id)` en vez de
código. Como ahora hay reintentos reales, toda escritura del agente necesita idempotencia por
`tool_call_id`.

---

## ADR-009 · "Cómo lo vendo" y "cómo lo entrego" son playbooks

**Contexto.** Cada oferta tiene un proceso de venta y uno de entrega.

**Decisión.** Un playbook es un documento con pasos (`jsonb`) asociado a una oferta.
Instanciarlo genera un proyecto y tareas con fechas relativas al inicio.

**Alternativas descartadas.** Tablas separadas para procesos, etapas y actividades. Tabla
`playbook_steps` normalizada.

**Por qué.** Un mecanismo en lugar de seis módulos. Es lo que convierte diez tablas sueltas en
un sistema donde vender algo produce trabajo automáticamente. Los pasos se leen siempre juntos
y se editan como una unidad: son un documento, y se guardan como documento.

**Consecuencias.** Los pasos se **copian** al instanciar, no se referencian: editar el playbook
no reescribe las entregas en curso. Riesgo declarado: si las entregas resultan ser todas a
medida, los playbooks son peso muerto y se reemplazan por listas de verificación por venta.

---

## ADR-010 · Venta y entrega son un solo ciclo de vida

**Contexto.** El proceso comercial va de prospecto a cobro.

**Decisión.** Una tabla `sales` con etapas que cubren ambas mitades: `prospecto → propuesta →
negociacion → ganada → entregando → entregada → cobrada` (más `perdida`).

**Alternativas descartadas.** `deals` para preventa y `engagements` para entrega.

**Por qué.** En la realidad es un continuo, no dos objetos. Dos tablas obligarían a
sincronizar estado entre ellas y a decidir cuál manda. El modelo empezó con 14 tablas de
dominio y quedó en 10 fusionando en vez de añadiendo.

**Consecuencias.** El playbook de venta gobierna las etapas anteriores a `ganada`; el de
entrega, las posteriores. `delivery_instantiated_at` garantiza que ganar dos veces no duplica.

---

## ADR-011 · El catálogo del agente cubre el flujo, no la configuración

**Contexto.** El dominio tiene 10 tablas y crecerá. Dar herramienta a cada entidad produciría
~50 herramientas.

**Decisión.** **11 herramientas.** Una funcionalidad necesita herramienta propia solo si se
va a pedir por chat o voz más de una vez por semana. La configuración —áreas, fuentes de
ingreso, ofertas, playbooks— se gestiona únicamente desde la UI.

**Alternativas descartadas.** Una herramienta por entidad. Herramienta genérica
`crear(entidad, datos)`. Carga progresiva de herramientas según el tema de la conversación.

**Por qué.** Con 50 herramientas el modelo elige mal entre opciones parecidas, las
definiciones se comen ~12.000 tokens por llamada, y nadie recuerda dónde vive cada regla. La
herramienta genérica pierde la validación tipada. La carga progresiva exige clasificar, o sea
latencia en cada turno. Configurar un playbook por WhatsApp sería miserable de todos modos.

**Consecuencias.** El catálogo no crece con el dominio: el panel de finanzas completo —seis
vistas, siete bloques— añadió **cero** herramientas, solo vistas a la unión discriminada de
`consultar`.

---

## ADR-012 · Las cifras financieras se calculan en vistas SQL

**Contexto.** El panel de finanzas y el agente responden las mismas preguntas sobre dinero.

**Decisión.** Cada número sale de una vista SQL. El agente lee exactamente esas vistas. No hay
cálculo financiero en TypeScript, ni en componentes, ni en el prompt.

**Alternativas descartadas.** Calcular en el backend y exponer por API. Campos de progreso
almacenados y actualizados por trigger.

**Por qué.** Si el dashboard suma en el cliente y el agente suma en su herramienta, en tres
semanas discrepan por un filtro que alguien cambió en un solo lado. Y una cifra que difiere
según dónde la mires destruye la confianza en las dos. Un campo almacenado es un campo que se
desactualiza.

**Consecuencias.** Toda vista necesita `with (security_invoker = true)`: sin ese atributo
corre con los privilegios del owner y bypasea RLS en silencio.

---

## ADR-013 · Móvil y escritorio son dos superficies, no una que se encoge

**Contexto.** El sistema se usa a diario desde el teléfono y se configura desde el escritorio.

**Decisión.** Móvil cubre el flujo (consultar, capturar, revisar). Escritorio cubre además la
configuración (playbooks, fuentes de ingreso, ofertas, metas). En móvil, la configuración se
muestra en lectura con aviso; nunca se oculta. El capturador universal en móvil es el chat con
tarjeta de confirmación editable.

**Alternativas descartadas.** Una UI única que se reorganiza por breakpoints. Reconstruir los
~12 formularios de creación en versión táctil.

**Por qué.** Es el mismo reparto de ADR-011 visto desde el otro lado: el flujo ocurre en el
teléfono, la configuración en el escritorio. Hacer que el editor de playbooks funcione en 380
píxeles es trabajo tirado —nunca vas a definir uno desde el celular— y ensucia la versión de
escritorio con concesiones táctiles innecesarias.

**Consecuencias.** Se ahorra la mayor parte del trabajo "responsivo". Ocultar secciones queda
prohibido: un panel que esconde partes te hace dudar de si existen.

---

## ADR-014 · La documentación se genera desde el código

**Contexto.** Requisito de que el sistema esté completamente documentado.

**Decisión.** Se separan dos tipos. Lo derivable se **genera**: esquema desde las migraciones,
catálogo de herramientas desde los schemas Zod, tipos desde Supabase. Lo escrito a mano cubre
solo el **porqué**: ADRs, modelo mental y runbook.

**Alternativas descartadas.** Documentación de referencia escrita y mantenida a mano.

**Por qué.** La documentación escrita a mano se desactualiza en la tercera semana, y una
documentación que miente es peor que ninguna. Un solo schema Zod por herramienta genera tres
cosas: validación en runtime, el JSON Schema que se envía al modelo, y la fila en
`docs/tools.md`. Una definición, tres usos, imposible que se desincronicen.

**Consecuencias.** Añadir una herramienta actualiza su documentación automáticamente. Los
ADRs son el único documento que envejece a propósito: registran lo que se pensaba entonces.

---

## ADR-015 · El barrido de la ingesta durable corre en `pg_cron`, no en Vercel Cron

**Contexto.** La ingesta durable (ADR-008) necesita una red de seguridad que recupere los
mensajes que quedaron `pending` si la ruta rápida (`void fetch` al worker) no dispara. El diseño
la describía como "un cron cada 60 s".

**Decisión.** El barrido lo dispara **`pg_cron` dentro de Supabase**, que invoca cada minuto el
endpoint del worker mediante **`pg_net`**. No se usa Vercel Cron para esto.

**Alternativas descartadas.** Vercel Cron; un pinger externo (cron-job.org, GitHub Actions);
subir a Vercel Pro.

**Por qué.** El plan **Vercel Hobby limita el cron a una ejecución diaria** —cualquier expresión
más frecuente falla en el deploy—, así que "cada 60 s" era imposible en el plan gratuito y la
prueba de aceptación de la Etapa 3 ("recuperación en <60 s") no se podía pasar. `pg_cron` está
habilitado en el plan gratuito de Supabase con **precisión de minuto**, y `pg_net` hace la
llamada HTTP asíncrona. El barrido queda en la misma plataforma que ya alberga los datos, sin
piezas nuevas y sin coste: el hosting sigue en $0. Un pinger externo resolvería lo mismo
añadiendo una dependencia fuera de la plataforma; Vercel Pro cuesta ~USD 20/mes y rompería el
presupuesto.

**Consecuencias.** La Etapa 0 habilita las extensiones `pg_cron` y `pg_net`. La ruta rápida
(`void fetch`) pasa a ser explícitamente *best-effort*: la garantía de durabilidad la da el
barrido de `pg_cron`, no el `fetch`. El endpoint del worker debe aceptar la invocación de
`pg_net` con el mismo secreto interno que la ruta rápida.

---

## ADR-016 · El contexto del actor viaja por *claims* del JWT, no por un GUC de sesión

**Contexto.** La auditoría por trigger (ADR-007) necesita saber quién actúa —usuario, agente o
sistema— y por qué canal. El diseño lo transportaba con `set_actor_context`, que fija GUCs
locales a la transacción (`set_config(..., true)`), y el trigger los leía con
`current_setting('app.actor', true)`.

**Decisión.** El actor viaja como **claims personalizados del JWT** (`actor`, `channel`,
`conversation`, `tool_call`). El trigger los lee de
`current_setting('request.jwt.claims', true)::jsonb`. `set_actor_context` se conserva **solo**
para el camino que escribe dentro de una función RPC de Postgres (o vía `db-pre-request`).

**Alternativas descartadas.** Fijar el GUC con `set_config` justo antes de cada escritura desde
el cliente REST; un GUC de sesión (no transaccional).

**Por qué.** El cliente REST de Supabase (PostgREST) **abre una transacción por cada request**,
y no permite ejecutar `select set_actor_context(...)` y la escritura en la *misma* transacción.
Con GUCs locales, el trigger los leería vacíos y `coalesce(..., 'system')` marcaría **todo como
`actor='system'`**, borrando la distinción user/agent/whatsapp que el sistema requiere (v3 §6).
PostgREST sí expone los claims del JWT por request —es la misma vía por la que Supabase resuelve
`auth.uid()`—, así que leerlos ahí es transaccionalmente correcto. El worker ya firma el JWT
efímero (ADR-004/C1), de modo que añadir los claims no cuesta una pieza nueva.

**Consecuencias.** El firmador del JWT (`adapters/supabase/as-user.ts`) incluye los claims de
actor. El trigger `audit_row()` parsea `request.jwt.claims`. El camino de Server Actions de la
UI, que usa la sesión emitida por Supabase (sin claims propios), enruta sus escrituras por RPCs
que llaman `set_actor_context`, o define el actor con `db-pre-request`.

---

## ADR-017 · El worker reclama el inbox bajo el JWT del usuario único

**Contexto.** Para reclamar una fila `pending` del inbox (`for update skip locked`), el worker
debe leerla **antes** de saber de qué usuario es —el `user_id` está en la propia fila—, y en ese
momento no hay sesión. La vía directa sin sesión es `service_role`, que bypasea RLS.

**Decisión.** El worker firma el JWT del **`ALLOWED_USER_ID`** (constante del sistema de un solo
usuario) y reclama el inbox **bajo RLS**. `service_role` **no** participa en el reclamo.

**Alternativas descartadas.** Reclamar con `service_role`; pasar el `user_id` desde el webhook
al worker (no cubre el camino del barrido, que escanea a ciegas).

**Por qué.** Usar `service_role` aquí reabriría el fallo C1 justo en el camino con superficie de
inyección: si tras reclamar alguien olvidara cambiar al JWT del usuario para la parte del agente,
todo el turno correría sin RLS. Como el sistema es de **un solo usuario**, la política
`user_id = (select auth.uid())` cubre todas las filas del inbox al firmar el JWT del usuario
constante, de modo que el reclamo funciona bajo RLS sin excepción. Así **se conserva el enunciado
de ADR-004**: `service_role` sigue restringida a exactamente dos usos —el INSERT en `inbox`
(antes de conocer al usuario) y las migraciones—.

**Consecuencias.** La regla de `dependency-cruiser` que confina `admin.ts` (service_role) a
`app/api/channels/**` se mantiene: el worker no lo importa. El reclamo del inbox se hace con
`adapters/supabase/as-user.ts`. Si algún día el sistema pasara a varios usuarios, este reclamo
necesitaría rediseño (un rol acotado o el paso del `user_id` por la ruta rápida más un barrido
con privilegio mínimo).

---

## ADR-018 · Dependencia declarada del secreto JWT heredado (HS256)

**Contexto.** El worker firma su JWT efímero con `SUPABASE_JWT_SECRET` (HS256), el secreto
simétrico heredado del proyecto.

**Decisión.** Se asume y se declara esta dependencia. Se conserva el secreto JWT heredado
habilitado, y se valida el flujo `clientAsUser` end-to-end en la Etapa 0/3 antes de construir
sobre él.

**Alternativas descartadas.** Firmar con una clave asimétrica propia; asumir sin verificar que
HS256 seguirá aceptándose.

**Por qué.** Desde el 1-oct-2025 los proyectos nuevos de Supabase firman las sesiones con
**ES256 asimétrico por defecto**, pero el gateway **sigue aceptando** tokens HS256 firmados con
el secreto heredado (el JWKS conserva el secreto simétrico para verificación). El enfoque
funciona hoy. El riesgo es que la nueva UI de *signing keys* permite rotar o deshabilitar ese
secreto heredado: si eso ocurre, los tokens firmados a mano dejan de validar y **se cae la
defensa C1 de golpe**. Declararlo evita que alguien lo dé por sentado.

**Consecuencias.** No rotar ni deshabilitar el secreto JWT heredado sin migrar antes el firmado
del worker. Revisar si Supabase anuncia forzar el modo asimétrico exclusivo; en ese caso, migrar
`as-user.ts` a firmar con el mecanismo vigente del proyecto.

---

## ADR-019 · Sistema de diseño: tema oscuro con acento naranja

**Contexto.** La interfaz necesitaba una dirección visual concreta. Se tomó como referencia un
dashboard financiero (oscuro, acento naranja en gradiente, tarjetas redondeadas, sidebar en
escritorio y navegación inferior en móvil).

**Decisión.** **Tema oscuro único.** Un solo acento cálido (naranja) reservado para la acción
primaria y para la única cifra más accionable. Se adopta el **lenguaje visual** de la referencia
—paleta, tarjetas, acento, navegación, pills de estado, gráfico de barras—, **no sus funciones**.
El detalle vive en `productividad-ja-sistema-diseno.md`.

**Alternativas descartadas.** Tema claro + oscuro; copiar también las funciones de la referencia
(wallets multi-moneda con límites de gasto, planes "Upgrade Pro", "Share").

**Por qué.** Esas funciones contradicen un sistema personal de un solo usuario en COP: no hay
tiers, no hay compartir, y las "tarjetas de moneda con límite" no existen en el modelo de datos.
Tomar solo el lenguaje visual da coherencia estética sin arrastrar features fuera de alcance.
Comprometerse a tema oscuro único reduce los tokens a mantener y garantiza que la estética
coincida con la referencia, a cambio de renunciar al modo claro.

**Consecuencias.** Los componentes de la referencia se **remapean** al dominio: las tarjetas de
moneda se convierten en tarjetas de fuente de ingreso; los tres KPIs en saldo/por-cobrar/neto,
con una sola tarjeta destacada en naranja (la más accionable). Sin modo claro, cualquier uso a
plena luz depende del brillo del dispositivo. El naranja no se usa para "el dinero" en general,
solo como marca y acción, para no diluir su señal.

---

## ADR-020 · WhatsApp como primer canal de mensajería

> Reemplaza a ADR-005.

**Contexto.** El asistente debe ser accesible desde el teléfono sin abrir la app. El ADR-005
había elegido Telegram como primer canal por costo y rapidez de montaje. Julián decide que el
canal donde de verdad vive su conversación es WhatsApp y prefiere construir ahí desde el inicio.

**Decisión.** Construir primero el adaptador de **WhatsApp** (Cloud API de Meta). Telegram queda
como alternativa disponible, no como primer paso. La Etapa 3 de `arquitectura-v3.md` —titulada
"WhatsApp"— pasa a ser la implementación literal; este ADR alinea la decisión de canal con ese
roadmap (el ADR-005 era el documento discordante).

**Alternativas descartadas.** Telegram primero (ADR-005); mantener ambos como iguales desde el
día uno (duplica el trabajo de canal antes de validar el hábito).

**Por qué.** Es una decisión de producto del dueño, no técnica: el valor de responder donde ya
está la conversación pesa más que el ahorro. Se asume conscientemente el costo: desde el
**1 de octubre de 2026** Meta cobra los *service messages* por mensaje (incluye respuestas de
asistentes de IA), exige **verificación de negocio** y **plantillas aprobadas** para mensajes
iniciados por el bot. La verificación de firma sigue siendo HMAC-SHA256 del cuerpo crudo contra
`X-Hub-Signature-256` (v2 §3.1); nada de la arquitectura durable cambia.

**Consecuencias.** Los pasos humanos de la Etapa 3 son los de WhatsApp Cloud API (App de Meta,
producto WhatsApp, App Secret, Phone Number ID, token permanente, Verify Token, verificación de
negocio), no los de Telegram. ~USD 3–6/mes adicionales desde octubre de 2026 (v2 §9). El canal
sigue siendo intercambiable por diseño (v3 §3.1): si el costo no compensa, revertir a Telegram
es un día de trabajo. No se construye la Etapa 3 hasta que las etapas previas lleven una semana
de uso real (regla del roadmap).

---

## ADR-021 · Las metas cuelgan de proyectos (opcionales para las tareas)

> Amplía v3 §2.4 (metas: una tabla, una vista). No la revierte: el cálculo sigue en `goal_progress`.

**Contexto.** El árbol era Área → {proyectos, metas, fuentes…} con las metas planas e
independientes. Julián quiere un árbol coherente **Área → Proyecto → (Meta) → Tarea/Evento**,
donde las cosas nazcan del proyecto, y que el agente ubique solo a qué proyecto/meta pertenece
una tarea, confirmando antes.

**Decisión.**
- Las metas ganan `project_id`: cuelgan de un proyecto. Una tarea **puede** asociarse a una meta
  de su proyecto, pero **la meta es opcional**. Lo **obligatorio** de una tarea sigue siendo su
  **proyecto** (y por él, su **área**, que se mantiene como raíz obligatoria).
- Se **conserva** el principio de v3 §2.4: el progreso de metas se calcula en la vista
  `goal_progress`; el módulo de metas no importa `finance`/`commerce`. Solo se le suma la columna
  `project_id` y una capa opcional en la UI.
- El **agente infiere** el proyecto/área (y meta si aplica) desde el mensaje y **confirma antes**
  de crear ("Creo 'X' en Proyecto Y / Meta Z, ¿ok?"). Si no puede determinar proyecto/área,
  pregunta. No inventa proyectos/metas: si no existen, ofrece crearlos.

**Alternativas descartadas.** (a) Jerarquía **estricta** (toda tarea bajo una meta, con una meta
"General" forzada por proyecto): traba la captura rápida por chat/WhatsApp. (b) **Áreas opcionales**
y proyecto como raíz absoluta: se descartó; el área se mantiene obligatoria. (c) **Reapuntar el
negocio** (fuentes/ventas/clientes/transacciones) de área→proyecto ahora: rompería las 6 vistas
financieras que igual se rediseñan en la Etapa 4; como el área sigue siendo la raíz, el negocio se
queda bajo áreas por ahora.

**Por qué.** Da la coherencia "todo cuelga del proyecto" sin romper la ingesta de captura rápida
(meta opcional) ni las finanzas (no se tocan las vistas). Es aditivo y de bajo riesgo.

**Consecuencias.** `goals.project_id` (nullable en columna; lo pone el caso de uso para metas del
árbol de trabajo) y `tasks.goal_id` (opcional). Módulo `core/work/goals`; `tasks → goals` es
intra-`work`. UI gana selector de meta opcional y pantalla de metas por proyecto. El agente suma
`meta_id` opcional a `crear_tarea` y una vista `estructura` para inferir. El negocio/finanzas se
reordenan cuando llegue la Etapa 4.

---

## ADR-022 · Las tareas NO se sincronizan al calendario; los eventos sí

> Ajusta el comportamiento de sincronización de la Etapa 1 (v3 §Etapa 1).

**Contexto.** En la Etapa 1, una tarea con hora se creaba también como evento de Google Calendar
(`syncTaskToCalendar`). Julián quiere separar los conceptos: una **tarea** es un pendiente de la
app; un **evento** es algo agendado (reunión, cita) que vive en Google Calendar.

**Decisión.**
- Las **tareas** viven solo en la app y **no** tocan el calendario, aunque tengan fecha/hora (la
  fecha es un recordatorio dentro de la app). Se quita `syncTaskToCalendar`/`removeTaskEvent` del
  camino de tareas (acciones y agente).
- Los **eventos** son entidades de Google Calendar. El agente gana la herramienta **`crear_evento`**
  (11.ª y última del catálogo) y su prompt distingue tarea vs evento por el fraseo del usuario; si
  duda, pregunta.
- El **calendario** muestra solo eventos de Google (ya no mezcla tareas). La pantalla **Hoy** sigue
  mostrando ambos (tareas de la app + eventos del día) porque es la agenda diaria.

**Alternativas descartadas.** Mantener el auto-sync tarea→evento (mezcla dos modelos mentales y
llena el calendario de to-dos); tabla local de eventos (contradice ADR-002: Google es la fuente de
verdad de los eventos).

**Consecuencias.** ADR-002 se mantiene (Google = fuente de verdad de eventos). Las tareas ya
sincronizadas antes del cambio conservan su evento viejo en Google (no se limpian automáticamente).
El catálogo del agente llega a **11 herramientas** (el tope). La asociación evento↔proyecto/meta
queda pendiente (los eventos aún no cuelgan del árbol); se abordará con `extendedProperties` de
Google más adelante.

## ADR-023 · Login con huella (passkeys/WebAuthn) y excepción acotada de `service_role`

> Extiende el acceso (correo+contraseña) con un segundo camino de entrada. No supersede a nadie.

**Contexto.** Julián quiere **entrar con huella en el móvil**. Eso es WebAuthn/passkeys: el
autenticador de plataforma firma un reto que el servidor verifica. Supabase Auth no ofrece passkeys
como primer factor de forma nativa. Además, el middleware valida la sesión con
`supabase.auth.getUser()` **contra el servidor de Auth**, así que un JWT firmado por nosotros (como
el efímero del worker, ADR-018) **no** basta para crear una sesión de navegador: `getUser` lo
rechazaría por no existir una sesión de GoTrue. Hace falta mintear una sesión real.

**Decisión.**
- Se implementa WebAuthn con `@simplewebauthn/*`. Las credenciales (clave pública, contador,
  transports) viven en la tabla `webauthn_credentials` (RLS, propiedad del usuario). El reto viaja en
  una cookie httpOnly firmada (HMAC con `WORKER_SECRET`), de vida corta; no se crea tabla de retos.
- La huella **convive** con la contraseña, no la reemplaza: la clave es el arranque para registrar el
  passkey (endpoints de registro exigen sesión) y el respaldo en equipos nuevos.
- **Puente a sesión real, sin correo:** tras `verifyAuthenticationResponse` exitosa, el endpoint
  `app/api/auth/passkey/login/verify` usa `service_role` **solo** para
  `admin.generateLink({type:'magiclink', email})` (que genera un `token_hash` sin enviar correo); el
  cliente hace `supabase.auth.verifyOtp({ token_hash })` y obtiene una sesión GoTrue completa (con
  refresh token), idéntica a la del login por contraseña.
- **Excepción a la regla no negociable #1** (`service_role` solo en `app/api/channels/*`): se permite
  `service_role` también en `app/api/auth/passkey/**`, **exclusivamente** para `generateLink` tras una
  aserción WebAuthn ya verificada. La regla depcruise `admin-only-from-channels` se amplía para incluir
  esa carpeta. Ningún otro uso de `service_role` se habilita.

**Alternativas descartadas.**
- *JWT propio (HS256) puesto como sesión:* `getUser` lo rechaza (no hay sesión GoTrue); frágil.
- *Recovery/magic link por correo:* depende del correo (que a Julián le falla y tiene rate limit bajo).
- *Guardar el `refresh_token` cifrado y restaurarlo tras la huella:* funciona pero guarda un secreto
  de larga vida; `generateLink`+`verifyOtp` es más limpio y usa APIs soportadas.
- *No hacer passkeys y quedarse con el autocompletado biométrico del navegador (Opción A):* válido y
  gratis, pero no es "entrar con huella" real; Julián lo pidió explícito.

**Consecuencias.** Aparece un endpoint público (`login/options`, `login/verify`) protegido por la
aserción WebAuthn (criptográfica), acotado al `ALLOWED_USER_ID`. `service_role` gana un segundo lugar
de uso, documentado y verificado por depcruise. Nueva dependencia y nueva tabla con su RLS. WebAuthn
exige HTTPS y `rpID` = dominio (`WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN` en el entorno).

## ADR-024 · El agente cubre todo el dominio con verbos generales

> Revisa la decisión D3 (v2/v3 §5): "configuración = UI, no herramienta" y el tope fijo de 11.

**Contexto.** El catálogo se diseñó para que el agente hiciera solo lo frecuente (capturar tareas,
dinero, consultar) y dejara la "configuración" (crear áreas, proyectos, metas, fuentes) a la UI, con un
tope de 11 herramientas porque demasiadas degradan la precisión de selección del modelo. En el uso real
Julián quiere que el agente **haga por chat/WhatsApp todo lo que él hace en la app**. Casi todos los
casos de uso ya existen en `/core`; lo único que faltaba era exponerlos.

**Decisión.**
- El agente cubre **todo el dominio** mediante **verbos generales**: `crear`, `actualizar`, `archivar`,
  cada uno una **unión por `tipo`** (tarea, evento, proyecto, meta, área, fuente, meta_dinero, documento,
  movimiento) que despacha a los casos de uso existentes de `/core`. Lecturas siguen en `consultar`
  (unión por `vista`, que absorbe `ver_calendario`), más `buscar`, `guardar_imagen`, `deshacer`.
- Se reemplaza "config = UI, tope 11 fijo" por: **el catálogo se mantiene chico por consolidación, no
  por exclusión**. Resultado: ~7 herramientas cubriendo más superficie que las 12 anteriores. La regla
  operativa pasa a ser "no una herramienta por acción; agrupa por verbo con `tipo`".
- **Fuera del agente (siguen solo en la app):** autenticación (contraseña/huella), conexión de Google,
  y ajustes de cuenta. Son acciones sensibles o irreversibles que no deben dispararse por chat.

**Alternativas descartadas.** Una herramienta por acción (infla el catálogo a 20+, peor selección,
contradice el espíritu de §5). Dejar la config solo en UI (es justo la limitación que Julián reporta).
Uniones discriminadas con `anyOf` de nivel superior en el `input_schema` (la API de tools las maneja
peor que un objeto plano; se usa objeto plano + `tipo`/`accion` + `refine`, como ya hacían
`consultar`/`gestionar_evento`).

**Consecuencias.** El agente puede crear/editar/archivar toda la estructura y las finanzas. El dominio
no cambia (los casos de uso ya estaban probados); cambia la fachada de herramientas. `CLAUDE.md`,
`docs/tools.md` y `.claude/rules/agente.md` se actualizan para reflejar los verbos generales. La regla
de "confirmar antes de escribir" y la idempotencia por `tool_call_id` se mantienen.

---

## ADR-025 · Puerta de login solo-desarrollo para verificación visual local

**Estado:** aceptado · **Fecha:** 2026-08-03

**Contexto.** Toda la app está detrás del middleware de sesión (correo+contraseña, ADR anterior;
huella, ADR-023). Para verificar cambios de UI de forma visual en local hace falta una sesión
autenticada, pero teclear la contraseña del usuario no es una opción (el asistente no maneja
credenciales; hacerlo a mano es tedioso y frágil). Sin sesión, ni el middleware ni `requireContext()`
dejan renderizar las páginas privadas.

**Decisión.**
- Se añade `app/api/dev/login` (GET) que **siembra una sesión real** del usuario único
  (`ALLOWED_USER_ID`) con el mismo mecanismo que el login por huella: `admin.generateLink`
  (sin enviar correo) + `verifyOtp` para fijar las cookies. Redirige a `/hoy`.
- **Blindaje a producción:** el handler responde `404` de inmediato si `NODE_ENV !== 'development'`,
  y la exención pública del middleware para `/api/dev` **solo** se activa en desarrollo. En Vercel la
  ruta es inerte: no siembra nada, no expone nada.
- Se amplía la lista blanca de `admin-only-from-channels` en dependency-cruiser para permitir importar
  `admin.ts` desde `app/api/dev/**` (junto a `channels` y `auth/passkey`).

**Alternativas descartadas.** Un bypass que funcione también en producción (riesgo inaceptable: cualquiera
entraría como el usuario único en la app pública). Pedir/teclear la contraseña (prohibido). Un cliente
`service_role` inline que evada la regla de lint (peor: esconde el uso en vez de declararlo).

**Consecuencias.** En `npm run dev`, abrir `/api/dev/login` autentica y permite ver la app real para
verificar UI en escritorio y móvil. La regla no negociable #1 (nunca `service_role` fuera de sitios
declarados) se respeta: el uso queda documentado aquí y acotado por lint + guard de entorno. La puerta
puede quedarse en el repo de forma permanente sin abrir superficie de ataque en producción.

---

## ADR-026 · El dinero se atribuye a proyectos (no a fuentes de ingreso)

**Estado:** aceptado · **Fecha:** 2026-08-03

**Contexto.** El modelo pedía, para registrar dinero, elegir un área y (para ingresos) una
"fuente de ingreso". Julián no piensa su dinero así: sus fuentes de ingreso **son sus proyectos**
(Cutbills, Monetización YouTube, …). Crear fuentes aparte era fricción y no reflejaba la realidad.

**Decisión.**
- Se agrega `project_id` a `transactions`. **Cada ingreso y cada gasto se atribuye a un proyecto.**
  El área sale del proyecto (la transacción sigue exigiendo `area_id`, derivado del proyecto).
- Se relaja el check `income_needs_source` → `income_has_attribution`: un ingreso necesita proyecto
  **o** fuente (la fuente queda como legado opcional).
- Nueva vista `fin_by_project` (security_invoker): ingresos/gastos/neto por proyecto y mes. Alimenta
  el panel "por proyecto" y el **balance por proyecto** en la página de cada proyecto.
- UI: al registrar un movimiento se elige **Proyecto** (no área+fuente). La gestión de "fuentes de
  ingreso" se oculta de la app. La página de proyecto muestra tareas, eventos, docs, fotos **y balance**.
- Agente: `crear movimiento` usa `proyecto_id` (obligatorio); el tool deriva el área del proyecto.

**Alternativas descartadas.** Mantener fuentes y añadir proyecto (dos conceptos que hacen lo mismo,
formulario confuso). Solo ingresos por proyecto (el balance por proyecto quedaría incompleto sin gastos).

**Consecuencias.** El módulo de finanzas pasa a girar en torno a proyectos. Las metas de dinero siguen
usando área/fuente por ahora (no se tocaron). No se migran datos viejos (la cuenta casi no tenía). Las
vistas `fin_by_source`/`goal_progress` siguen existiendo; las fuentes son legado.

---

## ADR-027 · Gastos recurrentes

**Estado:** aceptado · **Fecha:** 2026-08-05

**Contexto.** Julián tiene gastos que se repiten (arriendo, suscripciones). Quería verlos y
editarlos en Finanzas, y que al llegar la fecha la app le pida rectificar si el gasto se hizo,
con opción de editar el monto y adjuntar comprobante.

**Decisión.**
- Tabla `recurring_expenses` = **plantilla** de un gasto que se repite (proyecto, área
  desnormalizada, monto, categoría, descripción, frecuencia, próxima fecha, activo). El dinero
  se atribuye a un proyecto (ADR-026). El comprobante NO va en la plantilla: va en la
  transacción de cada instancia (attachments.transaction_id, ADR reciente).
- Frecuencias: semanal/quincenal/mensual/bimestral/trimestral/anual. `nextDue()` calcula la
  próxima fecha conservando el día sin desbordar (31 ene → 28 feb).
- **Confirmar** un recurrente vencido = crear la transacción real (monto editable) + avanzar
  `next_due_on` + adjuntar comprobante opcional. **Omitir** = solo avanzar la fecha.
- UI: sección "Gastos recurrentes" en Finanzas (CRUD) + **pop-up de rectificación** montado en
  el layout (aparece en toda la app cuando `next_due_on <= hoy`), con editar monto, adjuntar
  comprobante, "Sí, registrar" / "No se hizo" / "Ahora no".
- Notificación: el **resumen diario de WhatsApp** (cron existente) lista los recurrentes por
  confirmar. No se agrega push del navegador (requiere infra web-push aparte; queda pendiente).

**Consecuencias.** Cero cron nuevo (reusa el resumen). El pop-up corre un fetch ligero en el
layout por navegación. La confirmación reusa `registrarMovimiento` y el adjunto de comprobante.
