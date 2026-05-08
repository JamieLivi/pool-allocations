import type { ScenarioBuilder } from '../sim/scenarios';
import { fmtPct } from '../format';
import { RichText } from './RichText';

type Props = {
  scenarios: ScenarioBuilder[];
  activeKey: string;
  targetUtil: number;
  onChangeScenario: (key: string) => void;
  onChangeUtil: (util: number) => void;
};

export function ScenarioPicker({
  scenarios,
  activeKey,
  targetUtil,
  onChangeScenario,
  onChangeUtil,
}: Props) {
  const active = scenarios.find((s) => s.key === activeKey);
  return (
    <div className="scenario-picker">
      <div className="scenario-tabs" role="tablist">
        {scenarios.map((s) => (
          <button
            key={s.key}
            role="tab"
            type="button"
            aria-selected={s.key === activeKey}
            className={s.key === activeKey ? 'active' : ''}
            onClick={() => onChangeScenario(s.key)}
          >
            {s.name}
          </button>
        ))}
      </div>
      {active ? (
        <div className="scenario-description">
          <RichText text={active.description} />
        </div>
      ) : null}

      <div className="util-slider">
        <div className="util-slider-row">
          <span className="util-slider-label">Target utilisation</span>
          <strong className="util-slider-value">{fmtPct(targetUtil, 0)}</strong>
        </div>
        <input
          type="range"
          min={0.1}
          max={0.99}
          step={0.01}
          value={targetUtil}
          onChange={(e) => onChangeUtil(Number(e.target.value))}
        />
        <div className="util-slider-extremes">
          <span>10% (sleepy)</span>
          <span>99% (saturated)</span>
        </div>
        <span className="util-slider-hint">
          Rescales borrower debts proportionally so pool runs at the chosen
          util. Higher util means more interest paid out, but pro-rata can run
          out of capacity for new borrows.
        </span>
      </div>
    </div>
  );
}
