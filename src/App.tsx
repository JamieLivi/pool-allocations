import { useMemo, useState } from 'react';
import { BorrowerPanel } from './components/BorrowerPanel';
import { ModelExplainer } from './components/ModelExplainer';
import { ParamControls } from './components/ParamControls';
import { ResultsTable } from './components/ResultsTable';
import { ScenarioPicker } from './components/ScenarioPicker';
import { fmtPct, fmtUsd } from './format';
import { runAllModels } from './sim/models';
import { SCENARIO_BUILDERS, getScenarioBuilder, type ScenarioConfig } from './sim/scenarios';
import type { ModelKey, SimParams } from './sim/types';
import './App.css';

const DEFAULT_PARAMS: SimParams = {
  loanTokenRate: 0.065,
  poolRate: 0.05,
  tenor: 2,
  eqFixed: 0.08,
  eqRate: 0.18,
  upsideRrChunkSize: 20_000,
};

const MODEL_ORDER: ModelKey[] = [
  'idealDefi',
  'vanillaNav',
  'upsideProRata',
  'upsideRoundRobin',
  'upsideWeightedRoundRobin',
  'eqPremium',
];

export default function App() {
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS);
  const [scenarioKey, setScenarioKey] = useState<string>(SCENARIO_BUILDERS[0].key);
  const [scenarioConfig, setScenarioConfig] = useState<ScenarioConfig>(
    SCENARIO_BUILDERS[0].defaultConfig,
  );

  const builder = useMemo(() => getScenarioBuilder(scenarioKey), [scenarioKey]);
  const scenario = useMemo(() => builder.build(scenarioConfig), [builder, scenarioConfig]);

  const effectiveParams: SimParams = useMemo(
    () => ({ ...params, tenor: scenario.tenor }),
    [params, scenario.tenor],
  );

  const sim = useMemo(
    () =>
      runAllModels(scenario.lenderEvents, scenario.borrowerEvents, effectiveParams),
    [scenario, effectiveParams],
  );

  const handleScenarioChange = (key: string) => {
    setScenarioKey(key);
    const next = getScenarioBuilder(key);
    setScenarioConfig(next.defaultConfig);
  };

  const totalDeposit = scenario.lenderEvents.reduce((s, l) => s + l.deposit, 0);
  const totalDebt = scenario.borrowerEvents.reduce((s, b) => s + b.debt, 0);
  const totalPledged = scenario.borrowerEvents.reduce((s, b) => s + b.pledged, 0);

  return (
    <div className="app">
      <header className="page-header">
        <div className="eyebrow">Pool allocation visualiser</div>
        <h1>Late-deposit fairness in tokenised credit pools</h1>
        <p className="subtitle">
          Compare five lender attribution models — DeFi pool-share, vanilla
          ERC-4626, Upside's pro-rata and round-robin allocators, and Profitr's
          proposed Equalisation Premium — on identical lender + borrower
          scenarios. All parameters are live; tweak any control to re-run.
        </p>
      </header>

      <section className="panel">
        <h2>1 · Pick a scenario</h2>
        <ScenarioPicker
          scenarios={SCENARIO_BUILDERS}
          activeKey={scenarioKey}
          config={scenarioConfig}
          tunables={builder.tunables}
          onChangeScenario={handleScenarioChange}
          onChangeConfig={setScenarioConfig}
        />
        <div className="scenario-stats">
          <div>
            <span>Lenders</span>
            <strong>{scenario.lenderEvents.length}</strong>
          </div>
          <div>
            <span>Borrowers</span>
            <strong>{scenario.borrowerEvents.length}</strong>
          </div>
          <div>
            <span>Total deposit</span>
            <strong>{fmtUsd(totalDeposit, { compact: true })}</strong>
          </div>
          <div>
            <span>Total pledged</span>
            <strong>{fmtUsd(totalPledged, { compact: true })}</strong>
          </div>
          <div>
            <span>Total debt</span>
            <strong>{fmtUsd(totalDebt, { compact: true })}</strong>
          </div>
          <div>
            <span>Pool util</span>
            <strong>{fmtPct(totalDebt / totalDeposit, 0)}</strong>
          </div>
          <div>
            <span>Tenor</span>
            <strong>{scenario.tenor}y</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>2 · Tune parameters</h2>
        <p className="panel-intro">
          All five models share the same pool/IP rates. Only the Equalisation
          Premium model uses the EQ controls. Tenor follows the chosen
          scenario; util is on the scenario panel.
        </p>
        <ParamControls
          params={params}
          onChange={setParams}
          onReset={() => setParams(DEFAULT_PARAMS)}
        />
      </section>

      <section className="panel">
        <h2>3 · Compare lender APRs</h2>
        <p className="panel-intro">
          APR is annualised over each lender's hold period. The number under
          each column header is RMS deviation from the Std DeFi baseline in
          basis points — lower is closer to the canonical DeFi pool-share
          rate. The small ±bp under each lender's APR is that lender's own
          delta from the baseline.
        </p>
        <ResultsTable idealApr={sim.idealApr} results={sim.results} />
      </section>

      <section className="panel">
        <h2>4 · Borrower side</h2>
        <BorrowerPanel results={sim.results} />
      </section>

      <section className="panel">
        <h2>5 · How each model works</h2>
        <p className="panel-intro">
          Each card explains what the model does, its design rationale, and how
          it scores on the four standard mechanism-design fairness axioms.
        </p>
        <div className="explainer-stack">
          {MODEL_ORDER.map((k) => (
            <ModelExplainer key={k} modelKey={k} />
          ))}
        </div>
      </section>

      <footer className="page-footer">
        <p>
          Source simulation:{' '}
          <code>ai_docs/sim/profitr-equalisation-premium.ts</code>. Methodology
          docs: <code>local_docs/secured-lending-v13-fairness-analysis.md</code>.
        </p>
      </footer>
    </div>
  );
}
