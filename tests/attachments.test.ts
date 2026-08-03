import { describe, it, expect } from 'vitest';
import {
  registerAttachment,
  saveAttachment,
  listSavedAttachments,
} from '@/core/structure/attachments';
import { makeFakeStructureRepo } from './fake-structure-repo';
import { ctx } from './fake-repo';

const PROJ = '00000000-0000-4000-8000-0000000000cc';

describe('attachments', () => {
  it('registra un adjunto como no guardado', async () => {
    const repo = makeFakeStructureRepo();
    const r = await registerAttachment(ctx(), repo, { storagePath: 'u/1.jpg', mime: 'image/jpeg' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.saved).toBe(false);
      expect(r.value.storagePath).toBe('u/1.jpg');
    }
  });

  it('guarda y enlaza a un proyecto', async () => {
    const repo = makeFakeStructureRepo();
    const reg = await registerAttachment(ctx(), repo, { storagePath: 'u/2.jpg', mime: 'image/jpeg' });
    if (!reg.ok) throw new Error('setup');
    const r = await saveAttachment(ctx(), repo, {
      id: reg.value.id,
      projectId: PROJ,
      description: 'recibo del almuerzo',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.saved).toBe(true);
      expect(r.value.projectId).toBe(PROJ);
      expect(r.value.description).toBe('recibo del almuerzo');
    }
    const list = await listSavedAttachments(ctx(), repo, PROJ);
    expect(list.ok && list.value.length).toBe(1);
  });

  it('adjunto_id inexistente → NOT_FOUND', async () => {
    const repo = makeFakeStructureRepo();
    const r = await saveAttachment(ctx(), repo, { id: '00000000-0000-4000-8000-000000000999' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
  });

  it('id no-uuid → INVALID_INPUT', async () => {
    const repo = makeFakeStructureRepo();
    const r = await saveAttachment(ctx(), repo, { id: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_INPUT');
  });

  it('no lista los no guardados', async () => {
    const repo = makeFakeStructureRepo();
    const reg = await registerAttachment(ctx(), repo, { storagePath: 'u/3.jpg', mime: 'image/jpeg' });
    if (!reg.ok) throw new Error('setup');
    // sin guardar → no aparece
    const list = await listSavedAttachments(ctx(), repo, PROJ);
    expect(list.ok && list.value.length).toBe(0);
  });
});
