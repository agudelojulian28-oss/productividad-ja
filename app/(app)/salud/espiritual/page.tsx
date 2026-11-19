import { getSaludData } from '@/app/actions/health';
import { childrenOf } from '@/core/health/plan';
import { PageHero } from '../../page-hero';
import { SaludNav } from '../salud-nav';
import { ItemGroup, type GroupConfig } from '../item-editor';

export const dynamic = 'force-dynamic';

const COMPROMISOS: GroupConfig = {
  section: 'espiritual',
  kind: 'compromiso',
  title: 'Compromisos con Dios',
  hint: 'Tu asistente los respeta al organizar la agenda (p. ej. no agenda trabajo el domingo).',
  addLabel: 'Nuevo compromiso',
  empty: 'Sin compromisos.',
  fields: {},
  numbered: true,
};
const RUTINAS: GroupConfig = {
  section: 'espiritual',
  kind: 'habito',
  title: 'Hora dorada y rutinas',
  hint: 'Abre la hora dorada para ver y editar sus pasos. Se marca una vez al día en el checklist.',
  addLabel: 'Nueva rutina',
  empty: 'Sin rutinas espirituales.',
  fields: { time: true, duration: true, weekdays: true, trackable: true },
  child: { kind: 'habito', label: 'paso', addLabel: 'Agregar paso', fields: { duration: true } },
};

export default async function EspiritualPage() {
  const { items } = await getSaludData();
  const compromisos = items.filter((i) => i.section === 'espiritual' && i.kind === 'compromiso' && i.active).length;
  const hd = items.find((i) => i.section === 'espiritual' && i.kind === 'habito' && !i.parentId && i.active);
  const min = hd ? childrenOf(items, hd.id).reduce((s, k) => s + (k.durationMin ?? 0), 0) || hd.durationMin || 0 : 0;
  return (
    <div className="page">
      <PageHero
        eyebrow="Salud"
        title="Espiritual"
        subtitle="Entregar mi vida a Dios y confiar."
        kpis={[
          { label: 'Compromisos', value: String(compromisos) },
          { label: 'Hora dorada', value: `${min} min`, tone: 'acc' },
        ]}
      />
      <SaludNav active="espiritual" />
      <ItemGroup config={COMPROMISOS} items={items} />
      <ItemGroup config={RUTINAS} items={items} />
    </div>
  );
}
