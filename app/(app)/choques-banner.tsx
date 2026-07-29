import { dayLabelInTz, timeInTz } from '@/lib/format';
import type { Choque } from '@/lib/agenda';

/** Aviso de solapes de agenda. No renderiza nada si no hay choques. */
export function ChoquesBanner({ choques, tz }: { choques: Choque[]; tz: string }) {
  if (choques.length === 0) return null;
  return (
    <div className="choques-banner" role="status">
      <strong>
        ⚠ {choques.length} {choques.length === 1 ? 'choque' : 'choques'} de agenda
      </strong>
      <ul>
        {choques.slice(0, 5).map((c, i) => (
          <li key={i}>
            «{c.a}» y «{c.b}» se solapan el {dayLabelInTz(c.startIso, tz)}{' '}
            {timeInTz(c.startIso, tz)}–{timeInTz(c.endIso, tz)}
          </li>
        ))}
      </ul>
    </div>
  );
}
