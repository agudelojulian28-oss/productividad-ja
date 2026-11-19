import { getSaludData } from '@/app/actions/health';
import { routineForDay, childrenOf, weekSchedule } from '@/core/health/plan';
import { PageHero } from '../../page-hero';
import { SaludNav } from '../salud-nav';
import { WeekStrip } from '../week-strip';
import { ItemGroup, type GroupConfig } from '../item-editor';

export const dynamic = 'force-dynamic';

const RUTINAS: GroupConfig = {
  section: 'entrenamiento',
  kind: 'rutina',
  title: 'Rutinas',
  hint: 'Cada rutina tiene sus días. Abre una para ver y editar sus ejercicios.',
  addLabel: 'Nueva rutina',
  empty: 'Aún no tienes rutinas.',
  fields: { weekdays: true, duration: true, trackable: true },
  child: { kind: 'ejercicio', label: 'ejercicio', addLabel: 'Agregar ejercicio', fields: {} },
};

export default async function EntrenamientoPage() {
  const { items, today } = await getSaludData();
  const hoy = routineForDay(items, today);
  const ejerciciosHoy = hoy ? childrenOf(items, hoy.id) : [];
  const diasEntreno = weekSchedule(items).filter(Boolean).length;

  return (
    <div className="page">
      <PageHero
        eyebrow="Salud"
        title="Entrenamiento"
        subtitle="Tu semana de entreno y lo que toca hoy."
        kpis={[
          { label: 'Hoy', value: hoy ? hoy.title.split('·')[0]!.trim() : 'Descanso', tone: hoy ? 'acc' : undefined },
          { label: 'Días de entreno', value: `${diasEntreno} / 7` },
        ]}
      />
      <SaludNav active="entrenamiento" />

      <section className="sl-card" aria-labelledby="sl-semana">
        <h2 id="sl-semana" className="fin-h2">
          Semana
        </h2>
        <WeekStrip items={items} today={today} />
      </section>

      <section className="sl-card sl-today-routine" aria-labelledby="sl-hoy-rutina">
        <h2 id="sl-hoy-rutina" className="fin-h2">
          {hoy ? `Hoy · ${hoy.title}` : 'Hoy · descanso'}
        </h2>
        {hoy ? (
          <>
            {hoy.detail && <p className="sl-item-detail">{hoy.detail}</p>}
            <ol className="sl-steps">
              {ejerciciosHoy.map((e) => (
                <li key={e.id}>
                  <span className="sl-item-title">{e.title}</span>
                  {e.detail && <span className="sl-item-meta">{e.detail}</span>}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="muted">Día de descanso: recupera, camina y estira.</p>
        )}
      </section>

      <ItemGroup config={RUTINAS} items={items} />
    </div>
  );
}
