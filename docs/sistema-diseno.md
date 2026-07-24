# Sistema de Diseño — Adenda a la Arquitectura v3

**Fecha:** 23 de julio de 2026 · **Extiende:** v3 §5 (D3), `superficie-movil.md`, ADR-006 (PWA)
**Decisión de respaldo:** ADR-019 · **Estado previo:** "mobile-first / PWA", sin lenguaje visual.

Este documento fija la capa visual del sistema. Se derivó de un dashboard financiero de
referencia (oscuro, acento naranja, tarjetas, sidebar/bottom-nav). **Se adopta su lenguaje
visual, no sus funciones.**

---

## 1. El principio

> **Un solo acento cálido sobre superficies oscuras.** El naranja se reserva para la **acción
> primaria** y para la **única cifra más accionable** de cada pantalla. Todo lo demás —incluido
> el dinero en general— va en texto neutro.

Si el naranja pinta cada cifra, deja de señalar nada. En el panel de finanzas, la tarjeta
naranja es **"por cobrar"** (la más accionable, `panel-finanzas §2.2`); saldo y neto van neutros.
Es la misma lógica de "una cifra, una fuente": una jerarquía visible en vez de ruido uniforme.

## 2. Qué se adopta de la referencia, y qué no

| Se adopta (lenguaje visual) | Se descarta (funciones fuera de alcance) |
|---|---|
| Paleta oscura + gradiente naranja | Wallets multi-moneda con **límites de gasto** |
| Tarjetas redondeadas, borde sutil | Planes "Upgrade Pro" / tiers |
| Sidebar (escritorio) · bottom-nav (móvil) | Botón "Share" / colaboración |
| Pills de estado (activo/completado…) | Estados "Activo/Inactivo" por divisa |
| Gráfico de barras con toggle y tooltip | — |

El sistema es de **un solo usuario, en COP con `fx_rate` congelado**. Nada de la columna
derecha encaja en el modelo de datos (v3 §2), así que no se construye.

## 3. Tokens — **tema oscuro único**

Una sola fuente de verdad para el color. Nunca hex sueltos en componentes.

```css
:root {
  /* Superficies */
  --bg:            #0D0D10;   /* fondo de página */
  --surface:       #16161B;   /* tarjetas */
  --surface-2:     #1E1E25;   /* anidado / elevado / inputs */
  --surface-3:     #26262F;   /* hover / activo */
  --border:        #2A2A33;   /* hairline */
  --border-strong: #3A3A45;

  /* Acento (naranja) — SOLO acción primaria y la cifra más accionable */
  --accent:      #FF5A2C;
  --accent-from: #FF8A3D;     /* inicio del gradiente */
  --accent-to:   #FF4E2E;     /* fin del gradiente */
  --accent-weak: rgba(255, 90, 44, 0.12);   /* tinte: tarjeta destacada, estado activo */
  --on-accent:   #FFFFFF;

  /* Texto */
  --text:        #F5F5F7;
  --text-muted:  #9B9BA6;
  --text-subtle: #6A6A75;

  /* Semánticos — dirección y estado, NO marca */
  --positive:      #35C77E;   /* ingreso, delta ▲, al día */
  --positive-weak: rgba(53, 199, 126, 0.14);
  --negative:      #F5533D;   /* gasto, delta ▼, vencido */
  --negative-weak: rgba(245, 83, 61, 0.14);
  --warning:       #F5A623;   /* frescura ⚠, por confirmar */
  --warning-weak:  rgba(245, 166, 35, 0.14);

  /* Radio */
  --radius-card:  18px;
  --radius-input: 12px;
  --radius-sm:    10px;
  --radius-pill:  999px;

  /* Elevación (sutil: en oscuro manda el borde, la sombra solo separa) */
  --shadow-card: 0 8px 24px rgba(0, 0, 0, 0.35);

  /* Gradiente de marca reutilizable */
  --grad-accent: linear-gradient(135deg, var(--accent-from), var(--accent-to));

  /* Área segura móvil */
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
```

No hay variante clara: el sistema es solo oscuro (ADR-019). No se usa
`@media (prefers-color-scheme)` para invertir tokens.

## 4. Regla dinero / color

- Cifras **siempre** con `font-variant-numeric: tabular-nums` (alinean en columnas y no “bailan”).
- **Verde/rojo solo para dirección y vencidos:** ingreso vs gasto, delta ▲/▼, `aging_bucket` 90+.
- **Naranja solo marca y acción primaria.** Nunca "el dinero es naranja".
- Formato **siempre** por `lib/format.ts` (`superficie-movil §3`): compacto en cifras
  principales (`$ 12,1 M`), exacto en listados y formularios (`$ 12.100.000`).

## 5. Tipografía · espaciado

- Familia: **Inter** (o Geist), con fallback de sistema. Números tabulares en toda cifra.
- Escala: cifra *hero* 32–40 / 600 · título de sección 18 / 600 · etiqueta de tarjeta 13 / 500
  en `--text-muted` · cuerpo 15 · caption 12–13 en `--text-subtle`.
- Espaciado en múltiplos de 4 (4 · 8 · 12 · 16 · 20 · 24 · 32). Padding de tarjeta ≥ 16.

## 6. Componentes, mapeados al dominio

| Componente de la referencia | En este sistema |
|---|---|
| 3 tarjetas KPI (balance/savings/investment) | **Saldo · Por cobrar · Neto del mes.** Solo **una** destacada con `--accent-weak` + borde acento: *por cobrar*. Las otras en `--surface`. |
| Tarjetas de moneda (bandera + saldo + estado) | **Tarjetas de fuente de ingreso:** nombre + `this_month`/`ttm` (`fin_by_source`) + pill `activo/pausado`. Sin límites de gasto. |
| Cash Flow (barras, Monthly/Yearly, tooltip) | `fin_cashflow_monthly`. Barra del periodo actual con `--grad-accent`; el resto en `--surface-3`. Toggle Mensual/Anual. Tooltip con inflow/outflow. |
| Recent Activities (tabla) | Últimas actividades / transacciones. **Escritorio: tabla. Móvil: tarjetas** (`superficie-movil §3`). Pills de estado. |
| — | **Banner de frescura ⚠** arriba del panel si el último movimiento tiene > 3 días (`panel-finanzas §2.1`), en `--warning`. |
| Sidebar / topbar | **Escritorio: sidebar** con jerarquía completa. **Móvil: bottom-nav, máx. 4** (`Hoy · Chat · Dinero · Más`). |

**Pills de estado** (fondo `*-weak`, texto del color pleno, `--radius-pill`):

| Estado | Color |
|---|---|
| Activo · Completado · Al día · Cobrada | `--positive` |
| Pausado · Pendiente · Prospecto | `--text-subtle` sobre `--surface-2` |
| Vencido · Fallido · Perdida | `--negative` |
| Por confirmar · Advertencia | `--warning` |

## 7. Traducción móvil

Móvil es la superficie principal. Rigen los 8 innegociables de `superficie-movil §4` (16px en
inputs, `100dvh`, `safe-area`, táctiles ≥ 44px, `inputmode="decimal"`, acciones abajo,
`touch-action: manipulation`, nada de `hover`). Las tablas se vuelven tarjetas; las cifras
principales usan notación compacta. La configuración (playbooks, fuentes, ofertas, metas) es
solo escritorio; en móvil se muestra en lectura con aviso, nunca oculta.

## 8. Gráficos

Antes de escribir código de cualquier chart (Cash Flow, gastos, progreso de metas), **carga el
skill `dataviz`**: da la paleta categórica/secuencial validada para modo oscuro y las reglas de
ejes, leyendas y tooltips. Mantén `tabular-nums` en los valores y notación compacta en los ejes
(`lib/format.ts`). Nada de gráficos de torta (`panel-finanzas §5`): listas ordenadas por monto.

## 9. Dónde encaja en el plan

No es una etapa nueva; es criterio de aceptación añadido a las que ya existen:

| Etapa | Qué se añade |
|---|---|
| **1 — Trabajo** | Shell oscuro, tokens del §3, sidebar/bottom-nav, tarjetas base, PWA instalable, los 8 puntos móviles |
| **2 — Agente** | Chat móvil con tarjeta de confirmación editable (`superficie-movil §2`) |
| **4b — Panel** | Tarjetas en vez de tablas, notación compacta, banner de frescura, presupuesto de 1,5 s |
| **5 — Comercio** | Editor de playbooks **solo escritorio**; en móvil, lectura con aviso |
