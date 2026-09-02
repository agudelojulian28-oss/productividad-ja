'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Desplegable moderno con el tema oscuro/naranja. El menú va en un portal (position:fixed)
// para no quedar tapado por el z-index/overflow de las tarjetas. value + onChange(value).
export type DropOption = { v: string; label: string; group?: string; dot?: string | null };

export function Dropdown({
  value,
  options,
  onChange,
  ariaLabel,
  align = 'left',
}: {
  value: string;
  options: DropOption[];
  onChange: (v: string) => void;
  ariaLabel?: string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const current = options.find((o) => o.v === value)?.label ?? '';

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.max(r.width, 160);
      let left = align === 'right' ? r.right - width : r.left;
      left = Math.min(Math.max(8, left), vw - 8 - width);
      const h = menuRef.current?.offsetHeight ?? 220;
      let top = r.bottom + 6;
      if (top + h > vh - 8) top = Math.max(8, r.top - 6 - h);
      setPos({ top, left, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="dd-wrap">
      <button
        ref={btnRef}
        type="button"
        className="dd-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{current}</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={open ? 'dd-chev dd-chev-up' : 'dd-chev'}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className="dd-menu"
            role="listbox"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, minWidth: pos?.width }}
          >
            {options.map((o, i) => {
              const showHeader = o.group && o.group !== options[i - 1]?.group;
              return (
                <div key={o.v || i}>
                  {showHeader && <div className="dd-group">{o.group}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.v === value}
                    className={`dd-opt${o.v === value ? ' dd-opt-on' : ''}`}
                    onClick={() => {
                      onChange(o.v);
                      setOpen(false);
                    }}
                  >
                    <span className="dd-opt-label">
                      {o.dot && <span className="dd-dot" style={{ background: o.dot }} aria-hidden="true" />}
                      {o.label}
                    </span>
                    {o.v === value && (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
