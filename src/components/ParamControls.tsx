import type { SimParams } from '../sim/types';
import { fmtPct, fmtUsd } from '../format';

type Props = {
  params: SimParams;
  onChange: (next: SimParams) => void;
  onReset: () => void;
};

export function ParamControls({ params, onChange, onReset }: Props) {
  const update = <K extends keyof SimParams>(key: K, value: SimParams[K]) => {
    onChange({ ...params, [key]: value });
  };

  return (
    <div className="param-controls">
      <div className="control-grid">
        <Slider
          label="IP coupon (loan token rate)"
          hint="Coupon rate the IP pays on pledged collateral"
          value={params.loanTokenRate}
          min={0.01}
          max={0.2}
          step={0.005}
          format={(v) => fmtPct(v)}
          onChange={(v) => update('loanTokenRate', v)}
        />
        <Slider
          label="Pool rate"
          hint="Rate lenders draw on debt"
          value={params.poolRate}
          min={0.01}
          max={0.15}
          step={0.005}
          format={(v) => fmtPct(v)}
          onChange={(v) => update('poolRate', v)}
        />
        <Slider
          label="Tenor"
          hint="Pool / loan tenor in years"
          value={params.tenor}
          min={0.5}
          max={5}
          step={0.5}
          format={(v) => `${v.toFixed(1)}y`}
          onChange={(v) => update('tenor', v)}
        />
        <Slider
          label="EQ Premium — fixed component"
          hint="Floor compensating early lenders for deployment risk"
          value={params.eqFixed}
          min={0}
          max={0.3}
          step={0.01}
          format={(v) => fmtPct(v, 0)}
          onChange={(v) => update('eqFixed', v)}
        />
        <Slider
          label="EQ Premium — variable rate"
          hint="Time-scaled component (anchored to RE mezz debt 12-18%/y)"
          value={params.eqRate}
          min={0}
          max={0.4}
          step={0.005}
          format={(v) => `${(v * 100).toFixed(1)}%/y`}
          onChange={(v) => update('eqRate', v)}
        />
        <Slider
          label="Upside RR chunk size"
          hint="Flat RR: chunk per lender per pass (alters APR distribution slightly). Weighted RR: tx-granularity only — APR distribution is invariant of chunk size. Same DB field, different semantic. 0 = whole borrow."
          value={params.upsideRrChunkSize}
          min={0}
          max={200_000}
          step={5_000}
          format={(v) => (v === 0 ? 'unlimited' : fmtUsd(v, { compact: true }))}
          onChange={(v) => update('upsideRrChunkSize', v)}
        />
      </div>
      <div className="control-actions">
        <button type="button" className="secondary" onClick={onReset}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

type SliderProps = {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
};

function Slider({ label, hint, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <label className="slider">
      <span className="slider-label">
        <span>{label}</span>
        <strong>{format(value)}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="slider-hint">{hint}</span>
    </label>
  );
}
