// Decisión pura de "deshacer" (v2 §6.5): alcance acotado y declarado. Fuera de esto,
// se rehúsa con motivo. No ejecuta nada — solo decide qué es reversible y cómo.
//
// Reversible: una sola operación, sobre tarea o documento, insert/update, últimos 5
// minutos, sin efecto externo (evento de Google). Es, por diseño, la última mutación
// del log → nada vino después (satisface "sin acción posterior sobre la entidad").

export interface AuditEntry {
  action: string; // ej. 'tasks.insert', 'documents.update'
  entityType: string; // nombre de la tabla
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  occurredAt: string; // ISO
}

export type UndoPlan =
  | {
      ok: true;
      kind: 'delete' | 'restore';
      entityType: 'tasks' | 'documents';
      entityId: string;
      before: Record<string, unknown> | null;
    }
  | { ok: false; motivo: string };

const VENTANA_MIN = 5;

export function planUndo(entry: AuditEntry | null, nowMs: number): UndoPlan {
  if (!entry) return { ok: false, motivo: 'No hay ninguna acción reciente para deshacer.' };

  const ageMin = (nowMs - new Date(entry.occurredAt).getTime()) / 60000;
  if (ageMin > VENTANA_MIN) {
    return {
      ok: false,
      motivo: `La última acción fue hace ${Math.round(ageMin)} min (más de ${VENTANA_MIN}); no la deshago automáticamente.`,
    };
  }

  if (entry.entityType !== 'tasks' && entry.entityType !== 'documents') {
    return { ok: false, motivo: `No sé deshacer cambios en "${entry.entityType}" automáticamente.` };
  }
  if (!entry.entityId) return { ok: false, motivo: 'La acción no apunta a una entidad concreta.' };

  const op = entry.action.split('.')[1];
  if (op === 'delete') {
    return {
      ok: false,
      motivo: 'Deshacer un borrado no es seguro (se perderían vínculos). Puedo recrearlo si me pasas los datos.',
    };
  }

  // Efecto externo: tarea con evento de Google asociado.
  if (entry.entityType === 'tasks') {
    const row = (entry.after ?? entry.before) as { google_event_id?: unknown } | null;
    if (row && row.google_event_id) {
      return {
        ok: false,
        motivo: 'Esa tarea tiene un evento de calendario asociado; no lo deshago automáticamente.',
      };
    }
  }

  if (op === 'insert') {
    return { ok: true, kind: 'delete', entityType: entry.entityType, entityId: entry.entityId, before: null };
  }
  if (op === 'update') {
    if (!entry.before) return { ok: false, motivo: 'No tengo el estado anterior para restaurar.' };
    return {
      ok: true,
      kind: 'restore',
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before,
    };
  }
  return { ok: false, motivo: 'No reconozco esa acción para deshacer.' };
}
