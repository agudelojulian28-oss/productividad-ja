---
paths:
  - "app/api/channels/**"
  - "app/api/worker/**"
---

# Canales e ingesta

Un handler de webhook hace exactamente tres cosas y ninguna más:

1. **Verificar la firma sobre el cuerpo crudo** (`await req.text()`), antes de cualquier
   `JSON.parse`. Comparación en tiempo constante. `timingSafeEqual` lanza si las longitudes
   difieren: compara longitud primero.
2. **INSERT en `inbox`.** El error `23505` (duplicado) *es* la deduplicación.
3. **Devolver 200.** Solo después del INSERT. Si el INSERT falla, devuelve 500 para que
   la plataforma reintente.

Nunca proceses en línea. Nunca uses `after()` para trabajo que no se puede perder.

Lista blanca: rechaza cualquier remitente que no sea el usuario único del sistema. Es la
medida de seguridad más barata y más efectiva del proyecto.

El worker reclama con `for update skip locked`, **firma el JWT efímero del `ALLOWED_USER_ID`**
(usuario único, `adapters/supabase/as-user.ts`) y trabaja con RLS activa. `service_role` solo se
usa para el INSERT en `inbox`, nunca para el reclamo (ADR-017). El JWT lleva claims de actor
(`actor/channel/conversation/tool_call`) para que la auditoría distinga el origen (ADR-016).

El barrido es la red de seguridad real: **`pg_cron` invoca el endpoint del worker cada minuto
vía `pg_net`** (ADR-015). No uses Vercel Cron (Hobby = 1 ejecución/día). La ruta rápida
(`void fetch`) es best-effort.
