import { useEffect, useRef, useState } from 'react';

export function SettingsSliderRow({ label, value, min, max, step = 1, onChange, unit = '' }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const changeRef = useRef(onChange);
  const committedRef = useRef(value);
  const timerRef = useRef<number | null>(null);
  changeRef.current = onChange;

  useEffect(() => {
    draftRef.current = value;
    committedRef.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  function schedule(next: number) {
    draftRef.current = next;
    setDraft(next);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (Object.is(committedRef.current, next)) return;
      committedRef.current = next;
      changeRef.current(next);
    }, 160);
  }

  function commit() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (Object.is(committedRef.current, draftRef.current)) return;
    committedRef.current = draftRef.current;
    changeRef.current(draftRef.current);
  }

  return (
    <div className="field-row">
      <label>{label}：{draft}{unit}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => schedule(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </div>
  );
}
