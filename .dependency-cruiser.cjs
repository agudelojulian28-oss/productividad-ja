/**
 * Reglas de arquitectura verificadas en CI (v2 §7 + v3 §4).
 * Estas reglas *son* la arquitectura; lo demás es convención.
 */
module.exports = {
  forbidden: [
    // ── v2 §7 ──────────────────────────────────────────────────────────
    {
      name: 'core-no-framework',
      comment: 'core/** es dominio puro: no importa app/agent/adapters/next.',
      severity: 'error',
      from: { path: '^core/' },
      to: { path: '^(app|agent|adapters)/|^next($|/)' },
    },
    {
      name: 'agent-no-supabase',
      comment: 'agent/** no toca la BD directamente.',
      severity: 'error',
      from: { path: '^agent/' },
      to: { path: '^adapters/supabase/' },
    },
    {
      name: 'admin-only-from-channels',
      comment: 'service_role (admin.ts) solo desde app/api/channels/**.',
      severity: 'error',
      from: { pathNot: '^app/api/channels/' },
      to: { path: '^adapters/supabase/admin\\.ts$' },
    },
    {
      name: 'supabase-only-in-adapters',
      comment: 'Solo adapters/supabase/** importa @supabase/*.',
      severity: 'error',
      from: { pathNot: '^adapters/supabase/' },
      to: { path: 'node_modules/@supabase/' },
    },
    // ── v3 §4 · dependencias permitidas entre módulos de core ──────────
    {
      name: 'work-deps',
      comment: 'work solo importa de structure.',
      severity: 'error',
      from: { path: '^core/work/' },
      to: { path: '^core/(commerce|finance|goals)/' },
    },
    {
      name: 'commerce-deps',
      comment: 'commerce importa de structure y work, no de finance/goals.',
      severity: 'error',
      from: { path: '^core/commerce/' },
      to: { path: '^core/(finance|goals)/' },
    },
    {
      name: 'finance-deps',
      comment: 'finance solo importa de structure.',
      severity: 'error',
      from: { path: '^core/finance/' },
      to: { path: '^core/(work|commerce|goals)/' },
    },
    {
      name: 'goals-isolated',
      comment: 'goals no importa de otros módulos de core (lee goal_progress).',
      severity: 'error',
      from: { path: '^core/goals/' },
      to: { path: '^core/(work|commerce|finance)/' },
    },
    {
      name: 'structure-isolated',
      comment: 'structure no importa de otros módulos de core.',
      severity: 'error',
      from: { path: '^core/structure/' },
      to: { path: '^core/(work|commerce|finance|goals)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.js', '.jsx'] },
  },
};
// Regla 10 (fuga de secretos a NEXT_PUBLIC_*): no es de imports, se verifica
// con un chequeo aparte en CI. Pendiente: scripts/check-env-leak.mjs.
