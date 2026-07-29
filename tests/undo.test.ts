import { describe, it, expect } from 'vitest';
import { planUndo, type AuditEntry } from '@/lib/undo';

const NOW = new Date('2026-07-29T18:00:00Z').getTime();
const reciente = '2026-07-29T17:58:00Z'; // 2 min

function entry(over: Partial<AuditEntry>): AuditEntry {
  return {
    action: 'tasks.insert',
    entityType: 'tasks',
    entityId: '00000000-0000-4000-8000-000000000001',
    before: null,
    after: { id: 'x', title: 'T', google_event_id: null },
    occurredAt: reciente,
    ...over,
  };
}

describe('planUndo', () => {
  it('crear tarea reciente → delete', () => {
    const p = planUndo(entry({}), NOW);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.kind).toBe('delete');
  });

  it('actualizar tarea → restore con before', () => {
    const p = planUndo(
      entry({ action: 'tasks.update', before: { title: 'viejo' }, after: { title: 'nuevo' } }),
      NOW,
    );
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.kind).toBe('restore');
      expect(p.before).toEqual({ title: 'viejo' });
    }
  });

  it('crear documento → delete', () => {
    const p = planUndo(entry({ action: 'documents.insert', entityType: 'documents', after: { id: 'd' } }), NOW);
    expect(p.ok && p.entityType).toBe('documents');
  });

  it('rehúsa si pasaron más de 5 minutos', () => {
    const p = planUndo(entry({ occurredAt: '2026-07-29T17:50:00Z' }), NOW); // 10 min
    expect(p.ok).toBe(false);
  });

  it('rehúsa borrados', () => {
    const p = planUndo(entry({ action: 'tasks.delete', before: { id: 'x' }, after: null }), NOW);
    expect(p.ok).toBe(false);
  });

  it('rehúsa tarea con evento de Google (efecto externo)', () => {
    const p = planUndo(entry({ after: { id: 'x', google_event_id: 'gcal_123' } }), NOW);
    expect(p.ok).toBe(false);
  });

  it('rehúsa entidades fuera de alcance (transactions)', () => {
    const p = planUndo(entry({ action: 'transactions.insert', entityType: 'transactions' }), NOW);
    expect(p.ok).toBe(false);
  });

  it('sin entrada → rehúsa', () => {
    expect(planUndo(null, NOW).ok).toBe(false);
  });
});
