import type {
  LenderInput,
  ScenarioBuilder,
  ScenarioConfig,
  ScenarioTunable,
} from '../sim/scenarios';
import { fmtPct } from '../format';
import { LenderEditor } from './LenderEditor';
import { RichText } from './RichText';

type Props = {
  scenarios: ScenarioBuilder[];
  activeKey: string;
  config: ScenarioConfig;
  tunables: ScenarioTunable[];
  onChangeScenario: (key: string) => void;
  onChangeConfig: (next: ScenarioConfig) => void;
};

export function ScenarioPicker({
  scenarios,
  activeKey,
  config,
  tunables,
  onChangeScenario,
  onChangeConfig,
}: Props) {
  const active = scenarios.find((s) => s.key === activeKey);
  const update = <K extends keyof ScenarioConfig>(key: K, value: ScenarioConfig[K]) => {
    onChangeConfig({ ...config, [key]: value });
  };

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

      {tunables.includes('targetUtil') ? (
        <div className="util-slider">
          <div className="util-slider-row">
            <span className="util-slider-label">Target utilisation</span>
            <strong className="util-slider-value">{fmtPct(config.targetUtil, 0)}</strong>
          </div>
          <input
            type="range"
            min={0.1}
            max={0.99}
            step={0.01}
            value={config.targetUtil}
            onChange={(e) => update('targetUtil', Number(e.target.value))}
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
      ) : null}

      {tunables.includes('lenders') ? (
        <LenderEditor
          lenders={config.lenders}
          onChange={(next: LenderInput[]) => update('lenders', next)}
        />
      ) : null}

      {tunables.includes('wave1RampMonths') ? (
        <div className="util-slider">
          <div className="util-slider-row">
            <span className="util-slider-label">Wave 1 ramp window</span>
            <strong className="util-slider-value">
              {config.wave1RampMonths === 0
                ? 'instant'
                : `${config.wave1RampMonths.toFixed(1)}m`}
            </strong>
          </div>
          <input
            type="range"
            min={0}
            max={18}
            step={0.5}
            value={config.wave1RampMonths}
            onChange={(e) => update('wave1RampMonths', Number(e.target.value))}
          />
          <div className="util-slider-extremes">
            <span>0 (instant draw)</span>
            <span>18m (slow ramp)</span>
          </div>
          <span className="util-slider-hint">
            How long wave-1 borrowers take to draw their loans, spread evenly
            over this window. Shorter = sharper ramp-up; 0 = all borrowers
            draw at T=0 (no ramp); longer = pool sits at lower util for more
            of the tenor. Watch the Vanilla NAV anchor APR vs late-entrant
            APRs change as the ramp shifts.
          </span>
        </div>
      ) : null}

      {tunables.includes('wave1Count') || tunables.includes('wave2Count') ? (
        <div className="wave-controls">
          {tunables.includes('wave1Count') ? (
            <div className="util-slider">
              <div className="util-slider-row">
                <span className="util-slider-label">Wave 1 borrower count</span>
                <strong className="util-slider-value">{config.wave1Count}</strong>
              </div>
              <input
                type="range"
                min={5}
                max={300}
                step={1}
                value={config.wave1Count}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  // wave2 can never exceed wave1 — clamp it down if needed.
                  onChangeConfig({
                    ...config,
                    wave1Count: next,
                    wave2Count: Math.min(config.wave2Count, next),
                  });
                }}
              />
              <div className="util-slider-extremes">
                <span>5</span>
                <span>300</span>
              </div>
              <span className="util-slider-hint">
                Borrowers drawing during the first 6 months of the tenor on a
                smooth cadence. More borrowers ⇒ smaller individual loans for
                the same total debt; fewer ⇒ chunkier loans.
              </span>
            </div>
          ) : null}
          {tunables.includes('wave2Count') ? (
            <div className="util-slider">
              <div className="util-slider-row">
                <span className="util-slider-label">Wave 2 backfill count</span>
                <strong className="util-slider-value">{config.wave2Count}</strong>
              </div>
              <input
                type="range"
                min={0}
                max={Math.min(config.wave1Count, 60)}
                step={1}
                value={config.wave2Count}
                onChange={(e) => update('wave2Count', Number(e.target.value))}
              />
              <div className="util-slider-extremes">
                <span>0 (no recycling)</span>
                <span>{Math.min(config.wave1Count, 60)} (heavy)</span>
              </div>
              <span className="util-slider-hint">
                How many wave-1 borrowers repay early (months 13–18) and are
                replaced by wave-2 backfill borrowers. Models active capital
                recycling. Capped at the wave-1 count.
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
