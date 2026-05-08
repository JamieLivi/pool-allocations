import { makeRng } from './rng';
import type { BorrowerEvent, LenderEvent } from './types';

export type Scenario = {
  key: string;
  name: string;
  description: string;
  tenor: number;
  targetUtil: number;
  lenderEvents: LenderEvent[];
  borrowerEvents: BorrowerEvent[];
};

export type ScenarioBuilder = {
  key: string;
  name: string;
  description: string;
  defaultTargetUtil: number;
  build: (targetUtil: number) => Scenario;
};

function scaleBorrowersToUtil(
  borrowers: BorrowerEvent[],
  totalDeposit: number,
  targetUtil: number,
): BorrowerEvent[] {
  const currentDebt = borrowers.reduce((s, b) => s + b.debt, 0);
  if (currentDebt === 0) return borrowers;
  const factor = (totalDeposit * targetUtil) / currentDebt;
  return borrowers.map((b) => ({
    ...b,
    pledged: b.pledged * factor,
    debt: b.debt * factor,
  }));
}

const dynamicFlowBuilder: ScenarioBuilder = {
  key: 'dynamic-flow',
  name: 'Dynamic flow',
  description:
    "A realistic 2-year ramp-up for an actively-managed tokenised credit pool. All times are in **months from pool launch (T=0)**. Six lenders deposit on a staggered schedule:\n\n• **Anchor (50%) at month 0** — underwriter LP committing at first close, before any deployment track record exists.\n• **Two mid-sized lenders (20% + 15%) at month 1** — institutional followers committing once the anchor is on-chain.\n• **Three small lenders (5% each) at months 2, 3, 4** — top-up capital filling the rest of the commitment ladder.\n\nBorrowers draw in two waves:\n\n• **Wave 1 (months 0–6):** 100 borrowers draw on a smooth cadence (~one every 1.8 days). This continuous origination pace mirrors how active managers like [Maple Finance](https://docs.maple.finance/cash-management-pool/overview), [Goldfinch](https://www.goldfinch.finance/), and [Centrifuge / Tinlake](https://docs.centrifuge.io/use/) operate — they source and underwrite deals continuously, deploying lender capital as it lands rather than parking it.\n• **Wave 2 (months 13–18):** 8 backfill borrowers replace 8 wave-1 borrowers who repay early. This models active capital recycling — pool managers redirect prepayment cash flow into new originations rather than letting capital sit idle.\n\nThe **target utilisation** slider rescales every borrower's debt proportionally to hit the chosen pool util. **90% is the institutional norm**: Maple's secured lending products explicitly target >90% sustained util via active deal sourcing; Aave-style passive pools tend to fluctuate around 70–80%. Push the slider down to model a sleepier pool, or up toward 99% to stress-test capacity-constrained behaviour.\n\nThis scenario is the closest analogue to how a real Profitr-style vault would behave in production — staggered deposits, gradual deployment, and continuous capital recycling.",
  defaultTargetUtil: 0.9,
  build: (targetUtil: number) => {
    const tenor = 2;
    const lenderEvents: LenderEvent[] = [
      { id: 'Lender-1 (anchor 50%)', deposit: 5_000_000, enterAt: 0 },
      { id: 'Lender-2 (20%)', deposit: 2_000_000, enterAt: 1 / 12 },
      { id: 'Lender-3 (15%)', deposit: 1_500_000, enterAt: 1 / 12 },
      { id: 'Lender-4 (5%)', deposit: 500_000, enterAt: 2 / 12 },
      { id: 'Lender-5 (5%)', deposit: 500_000, enterAt: 3 / 12 },
      { id: 'Lender-6 (5%)', deposit: 500_000, enterAt: 4 / 12 },
    ];
    const totalDeposit = lenderEvents.reduce((s, l) => s + l.deposit, 0);
    const rand = makeRng(42);
    const wave1: BorrowerEvent[] = Array.from({ length: 100 }, (_, i) => {
      const pledged = 100_000 + rand() * 400_000;
      const ltv = 0.5 + rand() * 0.3;
      return {
        id: i,
        pledged,
        debt: pledged * ltv,
        borrowAt: (i / 100) * (6 / 12),
        repayAt: tenor,
      };
    });
    const earlyRepayIds = new Set<number>();
    while (earlyRepayIds.size < 8) earlyRepayIds.add(Math.floor(rand() * 100));
    for (const b of wave1) {
      if (earlyRepayIds.has(b.id)) b.repayAt = 13 / 12 + rand() * (5 / 12);
    }
    const earlyRepayTimes = wave1
      .filter((b) => earlyRepayIds.has(b.id))
      .map((b) => b.repayAt)
      .sort((a, b) => a - b);
    const wave2: BorrowerEvent[] = Array.from({ length: 8 }, (_, i) => {
      const pledged = 100_000 + rand() * 400_000;
      const ltv = 0.5 + rand() * 0.3;
      return {
        id: 100 + i,
        pledged,
        debt: pledged * ltv,
        borrowAt: earlyRepayTimes[i],
        repayAt: tenor,
      };
    });
    const all = [...wave1, ...wave2];
    return {
      key: dynamicFlowBuilder.key,
      name: dynamicFlowBuilder.name,
      description: dynamicFlowBuilder.description,
      tenor,
      targetUtil,
      lenderEvents,
      borrowerEvents: scaleBorrowersToUtil(all, totalDeposit, targetUtil),
    };
  },
};

const pathologicalBuilder: ScenarioBuilder = {
  key: 'pathological-late',
  name: 'Pathological late entrant',
  description:
    "A worst-case stress test for naive late-deposit handling. **All times are in months from pool launch (T=0).** Two lenders only — an anchor committing 90% at T=0 and a 10% late entrant joining at **month 23** (one month before maturity).\n\nBorrowers come in two waves:\n\n• **Wave A (months 0–1):** 10 small borrowers consuming ~15% of anchor capital. Pool runs sleepy.\n• **Wave B (months 18–22):** 50 larger borrowers spike util to ~85% just as the late entrant is about to deposit.\n\nThis pattern can occur when an originator lines up a large back-half pipeline (e.g. tax-year-end refinancing, seasonal RE volume) and a sophisticated lender front-runs it by depositing right before the spike. Under Vanilla NAV, that lender captures most of the spike's interest for almost no risk-bearing time. Pro-rata and Round-Robin exclude them entirely. The Equalisation Premium charges the late entrant a substantial cap reflecting the 23 months of pool-launch and underwriting risk they didn't bear.",
  defaultTargetUtil: 0.85,
  build: (targetUtil: number) => {
    const tenor = 2;
    const lenderEvents: LenderEvent[] = [
      { id: 'Anchor (90%)', deposit: 9_000_000, enterAt: 0 },
      { id: 'Late entrant (10%) @ 23m', deposit: 1_000_000, enterAt: 23 / 12 },
    ];
    const totalDeposit = lenderEvents.reduce((s, l) => s + l.deposit, 0);
    const rand = makeRng(101);
    const borrowers: BorrowerEvent[] = [];
    for (let i = 0; i < 10; i++) {
      const pledged = 100_000 + rand() * 100_000;
      const ltv = 0.6 + rand() * 0.2;
      borrowers.push({
        id: i,
        pledged,
        debt: pledged * ltv,
        borrowAt: (i / 10) * (1 / 12),
        repayAt: tenor,
      });
    }
    const waveB: BorrowerEvent[] = [];
    for (let i = 0; i < 50; i++) {
      const pledged = 100_000 + rand() * 200_000;
      const ltv = 0.65 + rand() * 0.15;
      waveB.push({
        id: 10 + i,
        pledged,
        debt: pledged * ltv,
        borrowAt: 18 / 12 + (i / 50) * (4 / 12),
        repayAt: tenor,
      });
    }
    // wave A is the "background" 15% util layer; wave B is the spike (~85%
    // of the target). Preserve their relative split when rescaling.
    const waveAFraction = 0.15 / 0.85;
    const waveADebt = borrowers.reduce((s, b) => s + b.debt, 0);
    const waveBDebt = waveB.reduce((s, b) => s + b.debt, 0);
    const desiredA = totalDeposit * targetUtil * (waveAFraction / (1 + waveAFraction));
    const desiredB = totalDeposit * targetUtil * (1 / (1 + waveAFraction));
    const waveAScale = waveADebt > 0 ? desiredA / waveADebt : 1;
    const waveBScale = waveBDebt > 0 ? desiredB / waveBDebt : 1;
    for (const b of borrowers) {
      b.pledged *= waveAScale;
      b.debt *= waveAScale;
    }
    for (const b of waveB) {
      b.pledged *= waveBScale;
      b.debt *= waveBScale;
    }
    borrowers.push(...waveB);
    return {
      key: pathologicalBuilder.key,
      name: pathologicalBuilder.name,
      description: pathologicalBuilder.description,
      tenor,
      targetUtil,
      lenderEvents,
      borrowerEvents: borrowers,
    };
  },
};

const progressiveBuilder: ScenarioBuilder = {
  key: 'progressive-late',
  name: 'Progressive late entrants',
  description:
    "A graduated test of how each model treats late entry across the full tenor. **All times are in months from pool launch (T=0).** An anchor LP commits 50% at T=0; four further lenders each deposit 12.5% at **months 6, 12, 18, and 22**.\n\nEach new lender is matched by a fresh borrower cohort entering 1 millisecond after them, keeping the pool at the target utilisation throughout. The result: every late lender enters a fully-deployed pool with the same instantaneous util as the anchor saw at T=0.\n\nThis is the cleanest scenario for visualising how the Equalisation Premium scales with `yearsSinceInception`. Compare each late lender's APR to the Std DeFi baseline — under EQ Premium, the 22-month entrant pays a much steeper haircut than the 6-month entrant; under Vanilla NAV they're nearly identical; under Pro-rata and RR the difference comes from structural exclusion rather than equalisation.",
  defaultTargetUtil: 0.85,
  build: (targetUtil: number) => {
    const tenor = 2;
    const lenderEvents: LenderEvent[] = [
      { id: 'Anchor (50%)', deposit: 5_000_000, enterAt: 0 },
      { id: 'Late @ 6m (12.5%)', deposit: 1_250_000, enterAt: 6 / 12 },
      { id: 'Late @ 12m (12.5%)', deposit: 1_250_000, enterAt: 12 / 12 },
      { id: 'Late @ 18m (12.5%)', deposit: 1_250_000, enterAt: 18 / 12 },
      { id: 'Late @ 22m (12.5%)', deposit: 1_250_000, enterAt: 22 / 12 },
    ];
    const rand = makeRng(202);
    const borrowers: BorrowerEvent[] = [];
    let nextId = 0;
    const w1: BorrowerEvent[] = [];
    for (let i = 0; i < 30; i++) {
      const pledged = 100_000 + rand() * 200_000;
      const ltv = 0.6 + rand() * 0.2;
      w1.push({
        id: nextId++,
        pledged,
        debt: pledged * ltv,
        borrowAt: (i / 30) * (2 / 12),
        repayAt: tenor,
      });
    }
    const w1Scale =
      (5_000_000 * targetUtil) / Math.max(1, w1.reduce((s, b) => s + b.debt, 0));
    for (const b of w1) {
      b.pledged *= w1Scale;
      b.debt *= w1Scale;
    }
    borrowers.push(...w1);
    for (const t of [6 / 12, 12 / 12, 18 / 12, 22 / 12]) {
      const cohort: BorrowerEvent[] = [];
      for (let j = 0; j < 5; j++) {
        const pledged = 100_000 + rand() * 200_000;
        const ltv = 0.6 + rand() * 0.2;
        cohort.push({
          id: nextId++,
          pledged,
          debt: pledged * ltv,
          borrowAt: t + 0.001,
          repayAt: tenor,
        });
      }
      const cs =
        (1_250_000 * targetUtil) /
        Math.max(1, cohort.reduce((s, b) => s + b.debt, 0));
      for (const b of cohort) {
        b.pledged *= cs;
        b.debt *= cs;
      }
      borrowers.push(...cohort);
    }
    return {
      key: progressiveBuilder.key,
      name: progressiveBuilder.name,
      description: progressiveBuilder.description,
      tenor,
      targetUtil,
      lenderEvents,
      borrowerEvents: borrowers,
    };
  },
};

export const SCENARIO_BUILDERS: ScenarioBuilder[] = [
  dynamicFlowBuilder,
  pathologicalBuilder,
  progressiveBuilder,
];

export function getScenarioBuilder(key: string): ScenarioBuilder {
  const found = SCENARIO_BUILDERS.find((s) => s.key === key);
  if (!found) throw new Error(`Unknown scenario: ${key}`);
  return found;
}
