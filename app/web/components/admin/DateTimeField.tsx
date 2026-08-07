"use client";
import { useEffect, useMemo, useRef, useState } from "react";

// Custom date+time picker over the same `datetime-local` string contract
// ("YYYY-MM-DDTHH:mm") the form uses, styled to the console aesthetic.
const pad = (n: number) => String(n).padStart(2, "0");

type Parts = { y: number; mo: number; d: number; h: number; mi: number };

function parse(local: string): Parts {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  const now = new Date();
  if (!m)
    return {
      y: now.getFullYear(),
      mo: now.getMonth(),
      d: now.getDate(),
      h: now.getHours(),
      mi: now.getMinutes(),
    };
  return {
    y: +m[1],
    mo: +m[2] - 1,
    d: +m[3],
    h: +m[4],
    mi: +m[5],
  };
}

function toLocal(p: Parts): string {
  return `${p.y}-${pad(p.mo + 1)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function displayLabel(p: Parts): string {
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  const ap = p.h < 12 ? "AM" : "PM";
  return `${MONTHS[p.mo]} ${p.d}, ${p.y} · ${pad(h12)}:${pad(p.mi)} ${ap}`;
}

export function DateTimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const parts = useMemo(() => parse(value), [value]);
  const [open, setOpen] = useState(false);
  // Which month the calendar is currently showing (independent of selection).
  const [viewY, setViewY] = useState(parts.y);
  const [viewMo, setViewMo] = useState(parts.mo);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setViewY(parts.y);
      setViewMo(parts.mo);
    }
  }, [open, parts.y, parts.mo]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const set = (patch: Partial<Parts>) => onChange(toLocal({ ...parts, ...patch }));

  const firstDow = new Date(viewY, viewMo, 1).getDay();
  const daysInMonth = new Date(viewY, viewMo + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const stepMonth = (dir: number) => {
    const d = new Date(viewY, viewMo + dir, 1);
    setViewY(d.getFullYear());
    setViewMo(d.getMonth());
  };

  const h12 = parts.h % 12 === 0 ? 12 : parts.h % 12;
  const isPm = parts.h >= 12;

  const setHour12 = (raw: number) => {
    const clamped = Math.min(12, Math.max(1, raw || 12));
    const base = clamped % 12; // 12 -> 0
    set({ h: isPm ? base + 12 : base });
  };
  const setMinute = (raw: number) => {
    set({ mi: Math.min(59, Math.max(0, raw || 0)) });
  };
  const setMeridiem = (pm: boolean) => {
    const base = parts.h % 12;
    set({ h: pm ? base + 12 : base });
  };

  return (
    <div className="dtp" ref={rootRef}>
      <button
        type="button"
        className={`dtp__trigger${open ? " dtp__trigger--open" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        {displayLabel(parts)}
        <span className="dtp__caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="dtp__pop" role="dialog">
          <div className="dtp__cal-head">
            <button
              type="button"
              className="dtp__nav"
              onClick={() => stepMonth(-1)}
              aria-label="previous month"
            >
              ‹
            </button>
            <span className="dtp__month">
              {MONTHS[viewMo]} {viewY}
            </span>
            <button
              type="button"
              className="dtp__nav"
              onClick={() => stepMonth(1)}
              aria-label="next month"
            >
              ›
            </button>
          </div>

          <div className="dtp__grid dtp__grid--dow">
            {WEEKDAYS.map((d) => (
              <span key={d} className="dtp__dow">
                {d}
              </span>
            ))}
          </div>
          <div className="dtp__grid">
            {cells.map((c, i) =>
              c === null ? (
                <span key={i} className="dtp__day dtp__day--empty" />
              ) : (
                <button
                  key={i}
                  type="button"
                  className={`dtp__day${
                    c === parts.d && viewMo === parts.mo && viewY === parts.y
                      ? " dtp__day--sel"
                      : ""
                  }`}
                  onClick={() => set({ y: viewY, mo: viewMo, d: c })}
                >
                  {c}
                </button>
              )
            )}
          </div>

          <div className="dtp__time">
            <input
              type="number"
              min={1}
              max={12}
              className="dtp__num"
              value={h12}
              onChange={(e) => setHour12(Number(e.target.value))}
            />
            <span className="dtp__colon">:</span>
            <input
              type="number"
              min={0}
              max={59}
              className="dtp__num"
              value={pad(parts.mi)}
              onChange={(e) => setMinute(Number(e.target.value))}
            />
            <div className="dtp__ampm">
              <button
                type="button"
                className={`dtp__ap${!isPm ? " dtp__ap--on" : ""}`}
                onClick={() => setMeridiem(false)}
              >
                AM
              </button>
              <button
                type="button"
                className={`dtp__ap${isPm ? " dtp__ap--on" : ""}`}
                onClick={() => setMeridiem(true)}
              >
                PM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
