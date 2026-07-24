---
paths:
  - "core/**"
---

# Capa de dominio

`/core` es la única puerta de escritura del sistema. Es código puro: no importa Next.js,
Supabase, Anthropic ni ningún canal.

Todo caso de uso sigue este orden, sin excepciones:

1. **Validar** con Zod. La entrada nunca es de confianza, venga del LLM o de un formulario.
2. **Autorizar** por ownership explícito, además de RLS.
3. **Reglas de negocio.**
4. **Ejecutar.**
5. **Devolver `Result<T>`.**

No añadas llamadas a `audit.record()`: la auditoría la hacen los triggers.

**Triggers para invariantes, dominio para flujos.** Un invariante debe ser cierto siempre
venga el cambio de donde venga (auditoría, `updated_at`) → trigger. Un flujo de negocio con
alternativas, fechas calculadas y casos límite (instanciar un playbook al ganar una venta)
→ caso de uso, donde se puede probar y depurar.

Operaciones con efectos múltiples van en una sola transacción, con guarda de idempotencia.

Dependencias permitidas: `structure` ← `work` ← `commerce`; `structure` ← `finance`.
`goals` no importa de nadie: lee la vista `goal_progress`.
