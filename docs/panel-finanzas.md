# Panel de Finanzas — Adenda a la Arquitectura v3

**Fecha:** 23 de julio de 2026 · **Extiende:** v3 §2.2 (transacciones), §5 (herramientas), §7 Etapa 4
**Estado en la v3:** mencionado como `dashboard financiero`, sin especificar. Esta adenda lo corrige.

---

## 1. El principio que hace que el panel no mienta

Un panel de finanzas puede fallar de dos formas. La segunda es la que arruina proyectos.

1. **Muestra las cifras equivocadas.** Se detecta rápido y se arregla.
2. **Muestra cifras distintas a las que dice el agente por WhatsApp.** No se detecta nunca del todo, y el día que lo notas dejas de confiar en las dos.

> **Una cifra, una fuente.** Cada número del panel sale de una vista SQL. El agente lee **exactamente esas mismas vistas**. No hay cálculo financiero en TypeScript, ni en el componente de React, ni en el prompt.

Es el mismo razonamiento que llevó a calcular `goal_progress` en una vista (v3 §2.4), aplicado a todo el dinero. Si el dashboard suma en el cliente y el agente suma en su herramienta, en tres semanas discrepan por un `filter` que alguien cambió en un solo lado.

---

## 2. Qué muestra, y en qué orden

Orden por **valor de decisión**, no por lógica contable. Vas a mirar esto en el teléfono, y lo primero que ves es lo que más veces te va a hacer actuar.

```
┌──────────────────────────────────────────┐
│ ⚠  Último movimiento registrado: hace 4 d │   ← §2.1
└──────────────────────────────────────────┘

① POR COBRAR                    $ 8.400.000
   3 ventas · 1 vencida hace 68 días  ⚠

② ESTE MES                     $ 12.100.000
   Meta $20.000.000 · 61% · quedan 9 días

③ NETO DEL MES                  $ 4.300.000
   Entró 12.1M  ·  Salió 7.8M

④ POR FUENTE DE INGRESO
   Consultoría    8.200.000   ▲ +18% vs mes anterior
   Cursos         3.100.000   ▼ −22%
   Asesorías        800.000   ▲  +5%

⑤ GASTOS — top 5 del mes
   Nómina         4.100.000
   Software         890.000
   ...

⑥ PIPELINE ABIERTO
   Negociación    2 · $ 6.500.000
   Propuesta      4 · $ 9.200.000
   Prospecto      6 · $14.000.000

⑦ DISCREPANCIAS                          ⚠
   2 ventas marcadas como cobradas sin movimiento registrado
```

### 2.1 El indicador de frescura no es decorativo

Un panel financiero que no te dice que está desactualizado es **peor que no tener panel**: te da confianza calibrada sobre datos viejos. Si llevas cuatro días sin registrar movimientos, "Neto del mes: $4.3M" es una afirmación falsa presentada con la autoridad de un número.

Regla: si el último movimiento tiene más de 3 días, el panel muestra la advertencia arriba del todo y **atenúa visualmente** las cifras de flujo (② y ③). Las de saldo acumulado (①) no se atenúan, porque envejecen distinto.

### 2.2 Por qué ① va primero

En un negocio de servicios, la plata que ya ganaste pero no has cobrado es casi siempre la cifra más accionable del panel. "Facturé 12 millones" no cambia lo que haces hoy. "Carlos me debe 3.2 millones hace 68 días" sí.

### 2.3 Por qué el pipeline va sin ponderar

La tentación es mostrar el pipeline multiplicado por una probabilidad según la etapa (prospecto 10%, propuesta 30%, negociación 60%). **Con tu volumen eso es ruido con apariencia de precisión.** Los pesos son promedios estadísticos; con ~8 ventas al mes no hay suficiente masa para que un promedio signifique algo, y el número ponderado transmite una certeza que no existe.

Valor bruto y conteo por etapa. Tú sabes cuáles van bien; el sistema no.

---

## 3. Las vistas

Seis vistas. Ninguna tabla nueva.

> **`security_invoker = true` en todas.** Sin ese atributo, una vista corre con los privilegios de su dueño y **bypasea RLS**. Es el fallo C1 de la v2 disfrazado de vista, y por eso está en la prueba de aceptación de la Etapa 0.

### V1 · Flujo de caja mensual

```sql
create or replace view fin_cashflow_monthly with (security_invoker = true) as
select
  t.user_id,
  t.area_id,
  date_trunc('month', t.occurred_on)::date as month,
  sum(t.base_amount_minor) filter (where t.direction = 'in')  as inflow_minor,
  sum(t.base_amount_minor) filter (where t.direction = 'out') as outflow_minor,
  sum(case when t.direction = 'in' then  t.base_amount_minor
                                   else -t.base_amount_minor end) as net_minor,
  count(*) as movements,
  max(t.created_at) as last_recorded_at        -- alimenta §2.1
from transactions t
group by t.user_id, t.area_id, date_trunc('month', t.occurred_on);
```

### V2 · Ingreso por fuente, con comparativa

```sql
create or replace view fin_by_source with (security_invoker = true) as
with p as (
  select date_trunc('month', current_date)::date as this_month,
         (date_trunc('month', current_date) - interval '1 month')::date as last_month
)
select
  s.user_id, s.id as income_source_id, s.name, s.model, a.name as area,
  coalesce(sum(t.base_amount_minor) filter (
    where date_trunc('month', t.occurred_on)::date = p.this_month), 0) as this_month_minor,
  coalesce(sum(t.base_amount_minor) filter (
    where date_trunc('month', t.occurred_on)::date = p.last_month), 0) as last_month_minor,
  coalesce(sum(t.base_amount_minor) filter (
    where t.occurred_on >= current_date - interval '12 months'), 0)    as ttm_minor
from income_sources s
join areas a on a.id = s.area_id
cross join p
left join transactions t
  on t.income_source_id = s.id and t.direction = 'in'
where s.status <> 'archived'
group by s.user_id, s.id, s.name, s.model, a.name, p.this_month, p.last_month;
```

`ttm_minor` (últimos 12 meses) es la cifra que revela **qué fuente sostiene realmente el negocio**. El mes actual fluctúa demasiado para decidir con él.

### V3 · Por cobrar — la vista más importante

```sql
create or replace view fin_receivables with (security_invoker = true) as
select
  s.user_id, s.id as sale_id,
  c.name    as client,
  o.name    as offering,
  isrc.name as income_source,
  s.amount_minor                                    as invoiced_minor,
  coalesce(paid.total_minor, 0)                     as paid_minor,
  s.amount_minor - coalesce(paid.total_minor, 0)    as outstanding_minor,
  s.currency,
  s.closed_at::date                                 as closed_on,
  (current_date - s.closed_at::date)                as days_outstanding,
  case
    when current_date - s.closed_at::date <=  30 then '0-30'
    when current_date - s.closed_at::date <=  60 then '31-60'
    when current_date - s.closed_at::date <=  90 then '61-90'
    else '90+'
  end as aging_bucket,
  -- Doble uso: marcada cobrada pero sin plata registrada = discrepancia ⑦
  (s.stage = 'cobrada') as marked_paid
from sales s
join offerings      o    on o.id    = s.offering_id
join income_sources isrc on isrc.id = o.income_source_id
left join clients   c    on c.id    = s.client_id
left join lateral (
  select sum(t.base_amount_minor) as total_minor
  from transactions t
  where t.sale_id = s.id and t.direction = 'in'
) paid on true
where s.stage in ('ganada','entregando','entregada','cobrada')
  and s.amount_minor > coalesce(paid.total_minor, 0);
```

Dos decisiones deliberadas:

- **Incluye `'cobrada'`.** El filtro real es la comparación de montos, no la etapa. Así una venta que marcaste como cobrada pero cuyo movimiento nunca registraste **aparece**, en vez de desaparecer silenciosamente. Ese es el bloque ⑦.
- **Soporta pagos parciales** sin ninguna tabla extra, porque `transactions.sale_id` ya existe en la v3. Varias transacciones contra la misma venta se suman solas.

### V4 · Pipeline

```sql
create or replace view fin_pipeline with (security_invoker = true) as
select s.user_id, s.stage,
       count(*)                as deals,
       sum(s.amount_minor)     as value_minor,
       min(s.expected_close)   as nearest_close
from sales s
where s.stage in ('prospecto','propuesta','negociacion')
group by s.user_id, s.stage;
```

### V5 · Gastos por categoría

```sql
create or replace view fin_expenses_by_category with (security_invoker = true) as
select t.user_id, t.area_id,
       date_trunc('month', t.occurred_on)::date as month,
       coalesce(nullif(btrim(t.category), ''), 'sin categoría') as category,
       sum(t.base_amount_minor) as amount_minor,
       count(*)                 as movements
from transactions t
where t.direction = 'out'
group by 1, 2, 3, 4;
```

El panel muestra el **top 5 ordenado**, no una torta. Una torta con nueve porciones te dice que gastas en cosas; una lista ordenada te dice cuál recortar.

### V6 · Saldo acumulado, para cuadrar contra el banco

```sql
create or replace view fin_running_balance with (security_invoker = true) as
select
  t.user_id, t.occurred_on, t.id, t.description,
  case when t.direction = 'in' then t.base_amount_minor else -t.base_amount_minor end as delta_minor,
  sum(case when t.direction = 'in' then  t.base_amount_minor
                                   else -t.base_amount_minor end)
    over (partition by t.user_id order by t.occurred_on, t.id) as balance_minor
from transactions t;
```

**Límite declarado, para que nadie lo asuma más fuerte de lo que es.** Esto no es conciliación bancaria real: la v3 no tiene tabla `accounts`, así que este saldo es un acumulado desde cero, no el saldo de una cuenta concreta. Sirve para lo que necesitas ahora — comparar la **variación** de un periodo contra la variación real de tu banco — y detecta movimientos faltantes o duplicados, que es el 90% de los errores.

Conciliación de verdad requiere `accounts` (cuenta, saldo inicial, fecha de corte). Es una tabla y ~2 días. Está fuera de alcance a propósito hasta que la Etapa 4 demuestre que hace falta.

---

## 4. Cómo lo lee el agente: cero herramientas nuevas

Esta es la prueba de que D3 funciona. Un panel de finanzas completo —seis vistas, siete bloques— **no añade ni una herramienta al catálogo**. Extiende la unión discriminada de `consultar`:

```ts
export const ConsultarInput = z.discriminatedUnion('vista', [
  z.object({ vista: z.literal('agenda_hoy') }),
  z.object({ vista: z.literal('pendientes'), proyecto: z.string().optional() }),
  z.object({ vista: z.literal('metas') }),

  // ── nuevas en esta adenda ──────────────────────────────
  z.object({ vista: z.literal('resumen_financiero'),
             periodo: z.enum(['mes','trimestre','ano']).default('mes') }),
  z.object({ vista: z.literal('por_cobrar'),
             solo_vencidas: z.boolean().default(false) }),
  z.object({ vista: z.literal('por_fuente') }),
  z.object({ vista: z.literal('gastos'),
             periodo: z.enum(['mes','trimestre']).default('mes') }),
  z.object({ vista: z.literal('pipeline') }),
]);
```

Costo en contexto: ~250 tokens más, cacheados a $0.20/MTok. El catálogo sigue en **once herramientas**.

Y como el agente consulta las mismas vistas que pinta el panel, esto es cierto por construcción y no por disciplina:

> *"¿cuánto me deben?"* por WhatsApp y el bloque ① del panel **no pueden discrepar.** Es la misma consulta.

---

## 5. Lo que este panel deliberadamente NO tiene

Cada ausencia es una decisión. En finanzas la tentación de añadir es especialmente fuerte, porque todo suena responsable.

| No incluido | Por qué |
|---|---|
| **Estado de resultados y balance general** | Son artefactos de contabilidad de partida doble. La v3 usa registro simple a propósito. Si necesitas estados formales, los produce tu contador con estos datos exportados — no este panel. |
| **Proyecciones automáticas** | Con menos de 18 meses de historia, una proyección es una extrapolación de ruido presentada como pronóstico. Peligrosa precisamente porque parece rigurosa. |
| **Runway / burn rate** | Métricas de startup quemando inversión. Un negocio de servicios rentable no tiene runway: tiene estacionalidad, que se ve mejor en el `ttm` de V2. |
| **Gráficos de torta** | No accionables. Una lista ordenada por monto contiene la misma información y además te dice qué recortar primero. |
| **Multi-cuenta / conciliación bancaria** | Necesita `accounts`. Se añade cuando V6 demuestre que se queda corta, no antes. |
| **Presupuesto por categoría** | Ya es expresable con una meta `money_net` acotada a un área (v3 §2.4). Si resulta que necesitas topes por categoría, es un campo en `goals`, no un módulo. |
| **Impuestos / retenciones / facturación DIAN** | Proyecto propio, del tamaño de las Etapas 4 y 5 juntas. Después de la Etapa 6, si acaso. |

---

## 6. Dónde encaja en el plan

La Etapa 4 de la v3 se parte en dos, porque **un panel financiero con dos semanas de datos no muestra nada**. Los bloques ④ (comparativa mensual) y V2 (`ttm`) requieren historia para significar algo.

### Etapa 4a — Registro · ~1 semana
Fuentes de ingreso · transacciones · herramienta `registrar_movimiento` · formulario de carga rápida en la UI · importación desde CSV para cargar el histórico.

**Prueba de aceptación:** cargar **tres meses reales** y que V6 cuadre con la variación de tu banco al peso.

### Etapa 4b — Panel · ~1 semana
Las seis vistas · el panel mobile-first · indicador de frescura · las cinco vistas nuevas de `consultar`.

**Prueba de aceptación**
1. `select` sobre las seis vistas como usuario A no devuelve datos de usuario B. *(Verifica `security_invoker`.)*
2. Preguntar *"¿cuánto me deben?"* por WhatsApp devuelve **el mismo número, al peso**, que el bloque ① del panel.
3. Marcar una venta como cobrada **sin** registrar el movimiento → aparece en el bloque ⑦ de discrepancias.
4. Registrar un pago parcial → ① baja exactamente por ese monto, y la venta sigue apareciendo con el saldo restante.
5. No registrar nada durante 4 días → aparece la advertencia de frescura y las cifras de flujo se atenúan.

> La prueba 2 es la que importa. Si falla, hay una cifra calculada en dos sitios y el problema no es el número: es que el principio del §1 se rompió en algún lado.

**Nota de secuencia.** El bloque ①, V3 y V4 dependen de la tabla `sales`, que llega en la Etapa 5. Hasta entonces el panel muestra ②, ③, ④ y ⑤ —todo lo que sale de transacciones— y los bloques comerciales aparecen vacíos con un mensaje explícito, no ocultos. Un panel que esconde secciones te hace dudar de si existen; uno que las muestra vacías te dice exactamente en qué punto está el sistema.
