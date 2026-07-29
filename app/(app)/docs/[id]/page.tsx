import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/lib/auth';
import { structureRepo } from '@/adapters/supabase/structure-repo';
import { DocEditor } from './doc-editor';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  proceso: 'Proceso',
  preferencia: 'Preferencia',
  nota: 'Nota',
};

export default async function DocDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, ctx } = await requireContext();
  const repo = structureRepo(supabase, ctx.userId);
  const doc = await repo.getDocument(id);
  if (!doc) notFound();

  return (
    <div className="page">
      <Link href="/docs" className="back-link">
        ← Documentación
      </Link>
      <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
        {KIND_LABEL[doc.kind] ?? doc.kind} · escrito por {doc.author === 'agente' ? 'el agente' : 'ti'}
      </p>
      <DocEditor
        id={doc.id}
        initialTitle={doc.title}
        initialContent={doc.content}
        initialPinned={doc.pinned}
      />
    </div>
  );
}
