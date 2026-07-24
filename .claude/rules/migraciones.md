---
paths:
  - "supabase/migrations/**"
---

# Migraciones

- Toda tabla nueva: `enable row level security` **y** `force row level security`.
- Políticas siempre con `(select auth.uid())`, nunca `auth.uid()` desnudo.
- Toda vista: `create view ... with (security_invoker = true) as ...`
- Toda tabla con mutaciones auditables lleva su trigger `audit_row()`.
- `audit_row()` debe ser propiedad de `postgres` (BYPASSRLS): con `force` RLS en `audit_log`,
  un owner sin ese privilegio hace fallar el INSERT del trigger en silencio (ADR-016).
- El actor se lee de `current_setting('request.jwt.claims', true)::jsonb` (claims del JWT),
  con `set_actor_context` solo como fallback para el camino RPC. Nunca dependas de un GUC de
  sesión para escrituras desde el cliente REST (ADR-016).
- Extensiones `pg_cron` y `pg_net` habilitadas: el barrido del inbox se agenda con `pg_cron`
  (precisión de minuto) y llama al worker vía `pg_net` (ADR-015).
- Toda tabla con `updated_at` lleva su trigger `touch_updated_at()`.
- Montos: `bigint` en unidades menores. Nunca `float` ni `numeric` para dinero.
- Prefiere `check` constraints que hagan **inexpresables** los estados imposibles,
  en vez de confiar en que la aplicación no los cree.
- Nunca modifiques una migración ya aplicada. Se corrige con una nueva.
- En triggers de `DELETE`, `NEW` es NULL: referenciar `NEW.id` lanza excepción.
  Ramifica por `TG_OP`.

Antes de terminar cualquier migración, corre `npm run check:rls`.
