---
paths:
  - "app/(dashboard)/**"
  - "components/**"
  - "app/globals.css"
---

# UI

Móvil primero, y móvil es la superficie principal. **Tema oscuro único**, acento naranja.
Tokens y componentes: `docs/sistema-diseno.md` (ADR-019). Se adopta el lenguaje visual de la
referencia, no sus funciones.

Innegociables (móvil):
- `font-size: 16px` en todo input. Menos que eso hace zoom en iOS.
- `100dvh`, nunca `100vh`.
- `env(safe-area-inset-bottom)` en cualquier elemento fijo abajo.
- Objetivos táctiles ≥ 44px, con `touch-action: manipulation`.
- `inputmode="decimal"` en campos de dinero.
- Acciones primarias abajo, en la zona del pulgar.
- Nada que dependa de `hover`.
- **Ninguna tabla con scroll horizontal.** En móvil, tarjetas.

Color: usa solo los tokens de `docs/sistema-diseno.md`. El naranja es marca y acción primaria,
no "el color del dinero". Cifras con `font-variant-numeric: tabular-nums`.

Formato de dinero: siempre `lib/format.ts`. Compacto en cifras principales, exacto en listados.

Barra inferior en móvil, máximo 4 destinos. Barra lateral en escritorio. La configuración
(playbooks, fuentes de ingreso, ofertas, metas) es solo escritorio; en móvil, lectura con aviso.

Para cualquier gráfico, carga el skill `dataviz` antes de escribir código de chart.
