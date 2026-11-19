import Link from 'next/link';
import type { Route } from 'next';
import { getSaludData } from '@/app/actions/health';
import { money } from '@/lib/format';
import {
  checklistForDay,
  routineForDay,
  streak,
  weekCompletionPct,
  childrenOf,
  isoWeekday,
  WEEKDAY_LONG,
} from '@/core/health/plan';
import { PageHero } from '../page-hero';
import { SaludNav } from './salud-nav';
import { HealthChecklist } from './checklist';
import { SalIcon } from './icons';

export const dynamic = 'force-dynamic';

export default async function SaludPage() {
  const { items, checkins, groceries, mercado, today } = await getSaludData();
  const due = checklistForDay(items, today);
  const doneToday = checkins.filter((c) => c.day === today).map((c) => c.itemId);
  const rutina = routineForDay(items, today);
  const racha = streak(items, checkins, today);
  const semana = weekCompletionPct(items, checkins, today);
  const dia = WEEKDAY_LONG[isoWeekday(today) - 1];

  const comidas = items.filter((i) => i.section === 'dieta' && i.kind === 'comida' && i.active && !i.parentId);
  const tratamientos = items.filter((i) => i.section === 'cuerpo' && i.kind === 'tratamiento' && i.active);
  const compromisos = items.filter((i) => i.section === 'espiritual' && i.kind === 'compromiso' && i.active);
  const horaDorada = items.find((i) => i.section === 'espiritual' && i.kind === 'habito' && !i.parentId && i.active);
  const hdMin = horaDorada
    ? childrenOf(items, horaDorada.id).reduce((s, k) => s + (k.durationMin ?? 0), 0) || horaDorada.durationMin || 0
    : 0;
  const revisar = items.filter((i) => i.needsReview && i.active).length;

  const tiles: { href: Route; key: string; title: string; icon: React.ReactNode; line: string; sub: string }[] = [
    {
      href: '/salud/entrenamiento',
      key: 'entrenamiento',
      title: 'Entrenamiento',
      icon: SalIcon.entrenamiento,
      line: rutina ? `Hoy: ${rutina.title}` : 'Hoy: descanso',
      sub: rutina ? `${childrenOf(items, rutina.id).length} ejercicios` : 'Recupera y estira',
    },
    {
      href: '/salud/dieta',
      key: 'dieta',
      title: 'Dieta',
      icon: SalIcon.dieta,
      line: `${comidas.length} comidas al día`,
      sub: `Mercado ${money(mercado.monthlyMinor, { compact: true })}/mes · ${groceries.filter((g) => g.active).length} ítems`,
    },
    {
      href: '/salud/cuerpo',
      key: 'cuerpo',
      title: 'Cuerpo',
      icon: SalIcon.cuerpo,
      line: `${tratamientos.length} tratamientos`,
      sub: 'Tratamiento de pelo y cuidado',
    },
    {
      href: '/salud/espiritual',
      key: 'espiritual',
      title: 'Espiritual',
      icon: SalIcon.espiritual,
      line: horaDorada ? `Hora dorada · ${hdMin} min` : 'Hora dorada',
      sub: `${compromisos.length} compromisos con Dios`,
    },
  ];

  return (
    <div className="page">
      <PageHero
        eyebrow={`Hoy · ${dia}`}
        title="Salud"
        subtitle="Tu plan inquebrantable: entrenamiento, dieta, cuerpo y espíritu."
        kpis={[
          { label: 'Racha', value: `${racha} ${racha === 1 ? 'día' : 'días'}`, tone: racha > 0 ? 'acc' : undefined },
          { label: 'Últimos 7 días', value: `${semana}%`, tone: semana >= 80 ? 'pos' : undefined },
          { label: 'Entreno de hoy', value: rutina ? rutina.title.split('·')[0]!.trim() : 'Descanso' },
        ]}
      />
      <SaludNav active="resumen" />

      {revisar > 0 && (
        <p className="sl-review-note" role="note">
          Precargué tu plan desde las fotos. {revisar} {revisar === 1 ? 'elemento quedó' : 'elementos quedaron'} marcado
          {revisar === 1 ? '' : 's'} como <span className="sl-badge-review">revisar</span> porque no se leía bien el manuscrito.
        </p>
      )}

      <div className="sl-grid">
        <section className="sl-card" aria-labelledby="sl-hoy">
          <div className="sl-card-head">
            <h2 id="sl-hoy" className="fin-h2">
              Checklist de hoy
            </h2>
            <span className="sl-streak" title="Días seguidos al 100%">
              <span aria-hidden="true">{SalIcon.racha}</span>
              {racha}
            </span>
          </div>
          <HealthChecklist key={doneToday.join(',')} items={due} doneIds={doneToday} day={today} />
        </section>

        <div className="sl-tiles">
          {tiles.map((t) => (
            <Link key={t.key} href={t.href} className={`sl-tile sl-tile-${t.key}`}>
              <span className="sl-tile-ico" aria-hidden="true">
                {t.icon}
              </span>
              <span className="sl-tile-title">{t.title}</span>
              <span className="sl-tile-line">{t.line}</span>
              <span className="sl-tile-sub">{t.sub}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
