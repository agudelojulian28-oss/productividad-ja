import { getSaludData } from '@/app/actions/health';
import { PageHero } from '../../page-hero';
import { SaludNav } from '../salud-nav';
import { ItemGroup, type GroupConfig } from '../item-editor';

export const dynamic = 'force-dynamic';

const TRATAMIENTOS: GroupConfig = {
  section: 'cuerpo',
  kind: 'tratamiento',
  title: 'Tratamientos',
  hint: 'Pastillas, minoxidil y cuidado personal. Con seguimiento diario los marcas en el checklist.',
  addLabel: 'Nuevo tratamiento',
  empty: 'Sin tratamientos.',
  fields: { time: true, weekdays: true, trackable: true },
};
const HABITOS: GroupConfig = {
  section: 'cuerpo',
  kind: 'habito',
  title: 'Hábitos del cuerpo',
  addLabel: 'Nuevo hábito',
  empty: 'Agrega hábitos como sueño, agua o estiramiento.',
  fields: { time: true, duration: true, weekdays: true, trackable: true },
};

export default async function CuerpoPage() {
  const { items } = await getSaludData();
  const n = items.filter((i) => i.section === 'cuerpo' && i.kind === 'tratamiento' && i.active).length;
  return (
    <div className="page">
      <PageHero
        eyebrow="Salud"
        title="Cuerpo"
        subtitle="Tratamientos y hábitos de cuidado personal."
        kpis={[{ label: 'Tratamientos', value: String(n) }]}
      />
      <SaludNav active="cuerpo" />
      <ItemGroup config={TRATAMIENTOS} items={items} />
      <ItemGroup config={HABITOS} items={items} />
    </div>
  );
}
