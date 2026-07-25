'use client';

import { dateInTz } from '@/lib/format';
import { hexForColorId } from '@/lib/calendar-colors';
import type { CalItem } from './calendar-view';

const DOWS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

function itemHex(it: CalItem): string {
  return it.kind === 'task' ? 'var(--accent)' : hexForColorId(it.colorId);
}

export function MonthGrid({
  days,
  month,
  today,
  tz,
  items,
  onDay,
  onItem,
}: {
  days: string[];
  month: string; // YYYY-MM del mes ancla
  today: string;
  tz: string;
  items: CalItem[];
  onDay: (ymd: string) => void;
  onItem: (it: CalItem) => void;
}) {
  const byDay = new Map<string, CalItem[]>();
  for (const it of items) {
    if (!it.start) continue;
    const d = it.allDay ? it.start.slice(0, 10) : dateInTz(it.start, tz);
    const arr = byDay.get(d);
    if (arr) arr.push(it);
    else byDay.set(d, [it]);
  }
  for (const arr of byDay.values()) {
    arr.sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime());
  }

  return (
    <div className="mg">
      <div className="mg-head">
        {DOWS.map((d) => (
          <div key={d} className="mg-dow">
            {d}
          </div>
        ))}
      </div>
      <div className="mg-grid">
        {days.map((day) => {
          const inMonth = day.slice(0, 7) === month;
          const list = byDay.get(day) ?? [];
          return (
            <div
              key={day}
              className={`mg-cell${inMonth ? '' : ' mg-dim'}${day === today ? ' mg-today' : ''}`}
              onClick={() => onDay(day)}
            >
              <span className="mg-num">{Number(day.slice(8, 10))}</span>
              {list.slice(0, 3).map((it) => (
                <button
                  key={it.kind + it.id}
                  className="mg-pill"
                  style={{ borderLeftColor: itemHex(it) }}
                  title={it.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    onItem(it);
                  }}
                >
                  {it.title}
                </button>
              ))}
              {list.length > 3 && <span className="mg-more">+{list.length - 3}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
