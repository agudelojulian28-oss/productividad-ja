---
paths:
  - "agent/**"
---

# Agente

El agente **propone** acciones; `/core` las autoriza y ejecuta. No tiene credenciales de
base de datos, no ejecuta SQL, no hace HTTP genérico.

- **Verbos generales (ADR-024).** Catálogo chico por consolidación: `consultar`/`buscar` +
  `crear`/`actualizar`/`archivar` (uniones por `tipo`) + `guardar_imagen`/`deshacer`. No añadas
  una herramienta por acción; agrupa por verbo. Auth/Google/ajustes se quedan en la UI.
- Cada caso (o rama de `tipo`) es un envoltorio de ~15 líneas sobre un caso de uso de `/core`.
- Toda herramienta de escritura consulta `tool_executions` por `tool_call_id` antes
  de ejecutar. Los reintentos del inbox son reales.
- Operaciones destructivas: crean fila en `pending_actions` y esperan `confirmar`.
  El modelo no puede fabricar un UUID que exista en la tabla.
- Presupuestos por turno: máximo 8 iteraciones, 10 escrituras por conversación,
  y el circuit breaker mensual de costo.
- Fechas: `Instant` con regex de ISO-8601 **con offset**. Nunca `z.coerce.date()`.

**Layout de caché** — el orden es `tools → system → messages`. El `cache_control` va al
final de `system`. Todo lo volátil (hora actual, tareas de hoy, historial) va en `messages`.
Si algo cambia entre dos peticiones y está en `system`, invalidas el caché completo y pagas
10x sin enterarte.

La salida de herramientas se envuelve en `<datos_externos>`. Es defensa en profundidad, no
la defensa principal: las capas reales son RLS, ownership en `/core` y el catálogo cerrado.
