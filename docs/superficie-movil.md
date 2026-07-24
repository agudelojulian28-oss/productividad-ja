# Superficie Móvil — Adenda a la Arquitectura v3

**Fecha:** 23 de julio de 2026 · **Extiende:** v1 §6 (rendimiento), v1 ADR-006 (PWA), v3 §5 (D3), v3 Etapa 1
**Estado previo:** mencionado como "mobile-first" y "PWA instalable", sin especificar.

---

## 1. El replanteamiento: no es una app que se encoge

La forma normal de leer "debe ser responsiva" es: construyo la app, y en pantalla pequeña las
columnas se apilan. Para este proyecto eso está mal, y la razón sale de una decisión que ya
tomamos por otro motivo.

En la v3 §5 decidimos que **el agente cubre el flujo y la UI cubre la configuración** (D3).
Ahora fíjate dónde ocurre cada cosa:

| | Flujo | Configuración |
|---|---|---|
| **Qué es** | registrar un gasto, ver qué toca hoy, consultar cuánto te deben | definir un playbook de entrega, crear una fuente de ingreso, ajustar precios de ofertas |
| **Cuándo** | 15 veces al día, en huecos de 20 segundos | una vez al mes, sentado |
| **Dónde** | **teléfono** | **escritorio** |
| **Precisión requerida** | media | alta |

> **No hay una app que se adapta. Hay dos superficies con solapamiento parcial.**

Esto no es una sutileza de diseño: es lo que evita que pierdas semanas haciendo que el editor
de playbooks —ocho pasos con offsets, duraciones y reordenamiento— funcione en 380 píxeles.
Nunca vas a definir un playbook desde el teléfono. Hacer que sea posible es trabajo tirado, y
además ensucia la versión de escritorio con concesiones táctiles que allí no hacen falta.

### 1.1 El reparto

**Móvil (≤ 768px) — superficie de flujo**

- Hoy: agenda + pendientes
- Chat con el agente
- Panel de finanzas (lectura)
- Registro rápido de movimientos y ventas
- Detalle de tarea, venta o proyecto (lectura + acciones simples)

**Escritorio — todo lo anterior, más:**

- Editor de playbooks
- Áreas, fuentes de ingreso, ofertas, clientes
- Definición de metas
- Pipeline completo
- Historial de auditoría

En móvil, la configuración no se oculta ni se degrada: se muestra en modo lectura, con un
mensaje explícito de que se edita desde escritorio. Esconder secciones te hace dudar de si
existen; mostrarlas en solo lectura te dice exactamente dónde estás.

---

## 2. En móvil, el agente es el formulario

La consecuencia más útil del reparto anterior.

La app tiene ~12 formularios de creación (tarea, proyecto, meta, venta, movimiento, cliente...).
Reconstruirlos todos en versión táctil es la mayor parte del trabajo de "hacerlo responsivo".

No hace falta. En móvil **ya tienes un capturador universal: el chat.**

```
Tú:      gasté 180 mil en el almuerzo con el equipo
         │
Agente:  registra_movimiento(...)
         │
         ▼
┌─────────────────────────────────┐
│  Gasto registrado               │
│  ─────────────────────────────  │
│  Monto      $ 180.000     [✎]   │  ← campos editables en la tarjeta
│  Categoría  Alimentación  [✎]   │
│  Área       Consultoría   [✎]   │
│  Fecha      Hoy           [✎]   │
│                                 │
│         [ Confirmar ]           │
└─────────────────────────────────┘
```

La tarjeta de confirmación resuelve la tensión entre velocidad y precisión: **capturas
hablando, corriges tocando.** Y como el agente ya interpreta lenguaje natural para WhatsApp,
esto no cuesta código nuevo: es el mismo turno, renderizado en vez de escrito.

Formularios que **sí** existen en móvil, porque el error es caro y la fricción baja:

- Registrar movimiento (el monto exige precisión)
- Registrar venta (monto + cliente + oferta)

Todo lo demás en móvil pasa por el chat.

---

## 3. El panel de finanzas en 380px

El diseño del panel ya era una pila vertical, así que traduce bien. Dos correcciones:

**Las tablas se vuelven tarjetas.** `fin_receivables` y `fin_expenses_by_category` tienen 6–8
columnas. Una tabla con scroll horizontal es el pecado móvil por excelencia: escondes
información detrás de un gesto que nadie descubre.

```
┌──────────────────────────────────┐
│ Carlos Restrepo            ⚠ 68d │
│ Diagnóstico Financiero           │
│ $ 3.200.000  de $ 4.000.000      │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░  80% cobrado │
└──────────────────────────────────┘
```

**Los montos en pesos son largos.** `$ 12.100.000` no cabe junto a una etiqueta en 380px.
Regla:

- Cifras principales (bloques ① ② ③): notación compacta → `$ 12,1 M`
- Al tocar: se expande al valor exacto
- Listados y formularios: siempre valor exacto, porque ahí sí comparas y verificas

```ts
// lib/format.ts — una sola función, usada en todas partes
export function money(minor: bigint | number, opts: { compact?: boolean } = {}) {
  const value = Number(minor) / 100;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    notation: opts.compact ? 'compact' : 'standard',
    maximumFractionDigits: opts.compact ? 1 : 0,
  }).format(value);
}
```

Igual que las cifras vienen de una sola vista SQL, el formato viene de una sola función. Dos
formateadores distintos producen dos verdades distintas sobre el mismo número.

---

## 4. Lo que se olvida siempre

Estos ocho puntos son la diferencia entre "funciona en móvil" y "se siente nativo". Ninguno
es difícil; todos se olvidan.

| # | Regla | Qué pasa si falta |
|---|---|---|
| 1 | **`font-size ≥ 16px` en todo `input`** | iOS Safari hace zoom automático al enfocar. Salta la pantalla en cada campo. |
| 2 | **`100dvh`, nunca `100vh`** | La barra de URL de móvil se colapsa al hacer scroll; con `vh` el layout salta o queda cortado. |
| 3 | **`env(safe-area-inset-bottom)` en la barra inferior** | El indicador de home del iPhone se come tus botones. |
| 4 | **Objetivos táctiles ≥ 44px** | Fallas de toque constantes en listas densas. |
| 5 | **`inputmode="decimal"` en campos de dinero** | Sale el teclado alfabético. En una app financiera lo sufres 30 veces al día. |
| 6 | **Acciones primarias abajo** | La parte superior de un teléfono es la zona más difícil de alcanzar con el pulgar. |
| 7 | **`touch-action: manipulation`** | 300 ms de retraso en cada toque. Se percibe como lentitud general. |
| 8 | **Nada que dependa de `hover`** | Tooltips y menús que no existen en táctil. |

```css
/* app/globals.css */
:root { --safe-bottom: env(safe-area-inset-bottom, 0px); }

html { -webkit-text-size-adjust: 100%; }
body { min-height: 100dvh; overscroll-behavior-y: none; }

input, select, textarea { font-size: 16px; }        /* regla 1 */
button, a, [role="button"] {
  min-height: 44px;                                  /* regla 4 */
  touch-action: manipulation;                        /* regla 7 */
}
.bottom-nav { padding-bottom: calc(0.5rem + var(--safe-bottom)); }  /* regla 3 */
```

### Navegación

- **Móvil:** barra inferior con **cuatro** destinos como máximo — `Hoy · Chat · Dinero · Más`.
  Cinco ya se sienten apretados con el pulgar, y el quinto siempre es el que menos usas.
- **Escritorio:** barra lateral con la jerarquía completa.

---

## 5. La PWA, con alcance honesto

**Sí incluye**

- Instalable desde el navegador, icono propio, arranque en modo `standalone` sin barra de URL
- Shell cacheada: arranque instantáneo en visitas siguientes
- Lectura offline de lo último sincronizado, con marca visible de "datos de hace X"

**No incluye, a propósito**

- **Escritura offline.** Encolar mutaciones en el cliente exige resolución de conflictos,
  reintentos y una segunda fuente de verdad en el navegador. Es un proyecto propio, y
  bastante más difícil de lo que aparenta. Si estás sin señal, no vas a poder ni consultar
  el calendario: el modo offline útil aquí es leer, no escribir.
- **Notificaciones push.** Los recordatorios ya llegan por WhatsApp o Telegram, que es
  además donde vas a responderlos. Duplicar el canal produce dos avisos de lo mismo.

La lección de la auditoría aplicada aquí: **una promesa de disponibilidad que el sistema no
puede cumplir es peor que no hacerla.** Un botón de guardar que "funciona" sin conexión y
pierde el dato es exactamente el fallo C2 trasladado al cliente.

---

## 6. Rendimiento en red móvil

El panel de finanzas lee seis vistas. En 4G, seis viajes secuenciales son ~1,5 s de latencia
antes de que aparezca nada.

- **Una sola RPC** que devuelve los bloques del panel en una llamada, o
- **Suspense por bloque**, para que cada uno aparezca al resolverse en vez de esperar al más
  lento. Preferible: ves ① *"por cobrar"* de inmediato, que es lo que ibas a mirar.

Presupuesto en 4G simulada, con caché fría: **primer contenido útil < 1,5 s.**

Otras dos que importan y son baratas:

- Las cifras del panel se pueden cachear 60 s. No cambian entre dos miradas seguidas.
- `next/image` con tamaños explícitos. Sin `width`/`height` el layout salta al cargar, y en
  móvil eso hace que toques el botón equivocado.

---

## 7. Dónde encaja

No es una etapa nueva. Es un criterio de aceptación **añadido a las etapas que ya existen**:

| Etapa | Qué se añade |
|---|---|
| **1 — Trabajo** | Barra inferior, `Hoy` usable con una mano, los 8 puntos del §4, PWA instalable |
| **2 — Agente** | Chat móvil con tarjetas de confirmación editables (§2) |
| **4b — Panel** | Tarjetas en vez de tablas, notación compacta, presupuesto de 1,5 s (§3, §6) |
| **5 — Comercio** | Editor de playbooks **solo escritorio**; en móvil, lectura con aviso |

### Pruebas de aceptación móviles

Añadir a cada etapa. Todas se hacen **en tu teléfono real**, no en el simulador del navegador —
el emulador no reproduce el zoom de iOS, ni el área segura, ni el retraso táctil.

1. **La semana de uso de la Etapa 1 se hace desde el teléfono**, no desde el escritorio.
   Es la prueba que de verdad importa; las demás son detalles que esa semana revela.
2. Enfocar cualquier campo de texto **no hace zoom**.
3. La barra inferior no queda tapada por el indicador de home del iPhone.
4. Registrar un gasto por chat y corregir el monto en la tarjeta toma **menos de 15 segundos**.
5. El panel de finanzas muestra el bloque ① en menos de 1,5 s con red 4G simulada.
6. Instalada como PWA, arranca sin barra de URL y sin destello blanco.
7. Ninguna tabla tiene scroll horizontal.

---

## 8. Qué cambia en la configuración del repositorio

Añade a `CLAUDE.md`, bajo **Límites del diseño**:

```markdown
- **La UI son dos superficies, no una que se encoge.** Móvil = flujo (consultar, capturar,
  revisar). Escritorio = configuración (playbooks, fuentes de ingreso, ofertas, metas).
  La configuración en móvil se muestra en lectura, nunca oculta.
- En móvil el capturador universal es el chat con tarjeta de confirmación editable.
  No reconstruyas los 12 formularios en versión táctil.
```

Y un archivo nuevo de reglas con alcance por ruta:

````markdown
---
paths:
  - "app/(dashboard)/**"
  - "components/**"
  - "app/globals.css"
---

# UI

Móvil primero, y móvil es la superficie principal: es donde se usa a diario.

Innegociables:
- `font-size: 16px` en todo input. Menos que eso hace zoom en iOS.
- `100dvh`, nunca `100vh`.
- `env(safe-area-inset-bottom)` en cualquier elemento fijo abajo.
- Objetivos táctiles ≥ 44px, con `touch-action: manipulation`.
- `inputmode="decimal"` en campos de dinero.
- Acciones primarias abajo, en la zona del pulgar.
- Nada que dependa de `hover`.
- **Ninguna tabla con scroll horizontal.** En móvil, tarjetas.

Formato de dinero: siempre `lib/format.ts`. Nunca formatees en el componente.
Compacto en cifras principales, exacto en listados y formularios.

Barra inferior en móvil, máximo 4 destinos. Barra lateral en escritorio.

La configuración (playbooks, fuentes de ingreso, ofertas, metas) es solo escritorio.
En móvil se muestra en lectura con aviso, nunca se oculta.
````
