import { getSaludData } from '@/app/actions/health';
import { money } from '@/lib/format';
import { PageHero } from '../../page-hero';
import { SaludNav } from '../salud-nav';
import { ItemGroup, type GroupConfig } from '../item-editor';
import { GroceryList } from '../grocery-list';

export const dynamic = 'force-dynamic';

const COMIDAS: GroupConfig = {
  section: 'dieta',
  kind: 'comida',
  title: 'Comidas del día',
  hint: 'Ordenadas por hora. Las que tienen seguimiento salen en tu checklist.',
  addLabel: 'Nueva comida',
  empty: 'Aún no tienes comidas.',
  fields: { time: true, weekdays: true, trackable: true },
  sortByTime: true,
};
const PREPARACION: GroupConfig = {
  section: 'dieta',
  kind: 'habito',
  title: 'Preparación',
  addLabel: 'Nuevo hábito',
  empty: 'Sin hábitos de preparación.',
  fields: { time: true, duration: true, weekdays: true, trackable: true },
};
const SALVAVIDAS: GroupConfig = {
  section: 'dieta',
  kind: 'salvavidas',
  title: 'Salvavidas',
  hint: 'Opciones permitidas para cuando te dé hambre o salgas de la rutina.',
  addLabel: 'Nuevo salvavidas',
  empty: 'Sin salvavidas.',
  fields: {},
};

export default async function DietaPage() {
  const { items, groceries, mercado, projects } = await getSaludData();
  const comidas = items.filter((i) => i.section === 'dieta' && i.kind === 'comida' && i.active && !i.parentId);

  return (
    <div className="page">
      <PageHero
        eyebrow="Salud"
        title="Dieta"
        subtitle="Comidas, preparación, salvavidas y tu mercado (conectado con Finanzas)."
        kpis={[
          { label: 'Comidas al día', value: String(comidas.length) },
          { label: 'Mercado / mes', value: money(mercado.monthlyMinor, { compact: true }), tone: mercado.synced ? 'acc' : undefined },
        ]}
      />
      <SaludNav active="dieta" />
      <ItemGroup config={COMIDAS} items={items} />
      <ItemGroup config={PREPARACION} items={items} />
      <ItemGroup config={SALVAVIDAS} items={items} />
      <GroceryList groceries={groceries} mercado={mercado} projects={projects} />
    </div>
  );
}
