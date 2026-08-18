export function SliderRow({ label, value, min, max, step = 1, onChange, unit = '' }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="field-row">
      <label>{label}：{value}{unit}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

export function ToggleCard({ label, hint, checked, onChange }: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="experience-toggle-card">
      <span className="experience-toggle-copy">
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
