import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/lib/auth';
import { workRepo } from '@/adapters/supabase/work-repo';
import { DescriptionEditor } from '../../description-editor';
import { setGoalDescriptionAction } from '@/app/actions/goals';

export const dynamic = 'force-dynamic';

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, ctx } = await requireContext();
  const repo = workRepo(supabase, ctx.userId);
  const goal = await repo.getGoal(id);
  if (!goal) notFound();

  return (
    <div className="page">
      <Link href={goal.projectId ? `/proyectos/${goal.projectId}` : '/areas'} className="back-link">
        ← Volver
      </Link>
      <h1 className="page-title">{goal.title}</h1>
      <DescriptionEditor
        initial={goal.description ?? ''}
        action={setGoalDescriptionAction.bind(null, goal.id)}
      />
    </div>
  );
}
