import type {
  BorrowerEvent,
  BorrowerSummary,
  LenderEvent,
  ModelResult,
  SimEvent,
  SimParams,
} from './types';

function buildEventStream(le: LenderEvent[], be: BorrowerEvent[]): SimEvent[] {
  const events: SimEvent[] = [];
  for (const l of le) {
    events.push({ type: 'deposit', t: l.enterAt, lenderId: l.id, amount: l.deposit });
  }
  for (const b of be) {
    events.push({
      type: 'borrow',
      t: b.borrowAt,
      borrowerId: b.id,
      pledged: b.pledged,
      debt: b.debt,
    });
    events.push({ type: 'repay', t: b.repayAt, borrowerId: b.id });
  }
  events.sort((a, b) => a.t - b.t);
  return events;
}

function buildLenderResults(
  lenderEvents: LenderEvent[],
  attributed: Map<string, number>,
  tenor: number,
): {
  lenders: ModelResult['lenders'];
  totalLenderInterest: number;
} {
  let totalLenderInterest = 0;
  const lenders = lenderEvents.map((l) => {
    const heldYears = Math.max(0, tenor - l.enterAt);
    const interestEarned = attributed.get(l.id) ?? 0;
    const apr = heldYears > 0 ? interestEarned / l.deposit / heldYears : 0;
    totalLenderInterest += interestEarned;
    return {
      id: l.id,
      deposit: l.deposit,
      enterAt: l.enterAt,
      heldYears,
      apr,
      interestEarned,
    };
  });
  return { lenders, totalLenderInterest };
}

// ─── Std DeFi (ideal pool-share) ───────────────────────────────────
//
// Aave/Compound/Maple style. Each lender's $-seconds of deposit earn
// the same APR. Computes the global pool APR, then attributes each
// lender's share via deposit × heldYears × poolApr.

export function runIdealDefi(
  lenderEvents: LenderEvent[],
  borrowerEvents: BorrowerEvent[],
  params: SimParams,
): { idealApr: number; attributed: Map<string, number> } {
  const { tenor, poolRate } = params;
  const events = buildEventStream(lenderEvents, borrowerEvents);
  const borrowerDebt = new Map<number, number>();
  let totalDebt = 0;
  let totalInterest = 0;
  let lastT = 0;
  for (const ev of events) {
    const dt = ev.t - lastT;
    if (dt > 0) totalInterest += totalDebt * poolRate * dt;
    if (ev.type === 'borrow') {
      totalDebt += ev.debt;
      borrowerDebt.set(ev.borrowerId, ev.debt);
    } else if (ev.type === 'repay') {
      const d = borrowerDebt.get(ev.borrowerId) ?? 0;
      totalDebt -= d;
      borrowerDebt.delete(ev.borrowerId);
    }
    lastT = ev.t;
  }
  if (tenor > lastT) totalInterest += totalDebt * poolRate * (tenor - lastT);
  const totalDollarYears = lenderEvents.reduce(
    (s, l) => s + l.deposit * Math.max(0, tenor - l.enterAt),
    0,
  );
  const idealApr = totalDollarYears > 0 ? totalInterest / totalDollarYears : 0;
  const attributed = new Map<string, number>();
  for (const l of lenderEvents) {
    const heldYears = Math.max(0, tenor - l.enterAt);
    attributed.set(l.id, l.deposit * heldYears * idealApr);
  }
  return { idealApr, attributed };
}

// ─── ERC-4626 NAV vault — vanilla and Equalisation Premium ─────────
//
// Single function, two modes. Vanilla = no haircut. EQ = additive
// `cap = fixed + rate × yearsSinceInception` applied to share count
// at deposit time. Each tick, lender draw = totalDebt × poolRate × dt
// is attributed to lenders by their share fraction.

export function runProfitrNav(
  lenderEvents: LenderEvent[],
  borrowerEvents: BorrowerEvent[],
  params: SimParams,
  capMode: 'vanilla' | 'eq-premium',
): Map<string, number> {
  const { tenor, poolRate, eqFixed, eqRate } = params;
  const events = buildEventStream(lenderEvents, borrowerEvents);
  const lenderShares = new Map<string, number>();
  let totalShares = 0;
  let totalAssets = 0;
  let totalDebt = 0;
  let lastT = 0;
  const borrowerDebt = new Map<number, number>();
  const attributed = new Map<string, number>();

  const settle = (t: number) => {
    const dt = t - lastT;
    if (dt <= 0) return;
    const lenderDraw = totalDebt * poolRate * dt;
    if (totalShares > 0 && lenderDraw > 0) {
      for (const [id, sh] of lenderShares) {
        const fraction = sh / totalShares;
        attributed.set(id, (attributed.get(id) ?? 0) + fraction * lenderDraw);
      }
      totalAssets += lenderDraw;
    }
    lastT = t;
  };

  for (const ev of events) {
    settle(ev.t);
    if (ev.type === 'deposit') {
      let haircutFraction = 0;
      if (capMode === 'eq-premium' && ev.t > 0 && totalAssets > 0) {
        haircutFraction = Math.min(0.95, eqFixed + eqRate * ev.t);
      }
      const vanillaShares =
        totalAssets > 0 ? (ev.amount * totalShares) / totalAssets : ev.amount;
      const shares = vanillaShares * (1 - haircutFraction);
      lenderShares.set(ev.lenderId, (lenderShares.get(ev.lenderId) ?? 0) + shares);
      totalShares += shares;
      totalAssets += ev.amount;
    } else if (ev.type === 'borrow') {
      totalDebt += ev.debt;
      borrowerDebt.set(ev.borrowerId, ev.debt);
    } else if (ev.type === 'repay') {
      const debt = borrowerDebt.get(ev.borrowerId) ?? 0;
      totalDebt -= debt;
      borrowerDebt.delete(ev.borrowerId);
    }
  }
  settle(tenor);

  return attributed;
}

// ─── Upside Pro-rata (BorrowLendPool) ──────────────────────────────
//
// Per-lender pro-rata locking on each borrow against capacity available
// at the time. Late entrants are structurally excluded from prior borrows.

export function runUpsideProRata(
  lenderEvents: LenderEvent[],
  borrowerEvents: BorrowerEvent[],
  params: SimParams,
): { attributed: Map<string, number>; skippedBorrows: number[] } {
  const { tenor, poolRate } = params;
  const events = buildEventStream(lenderEvents, borrowerEvents);
  const lenders = new Map<string, { deposit: number; enterAt: number }>();
  const lenderLocked = new Map<string, number>();
  const attributed = new Map<string, number>();
  let lastT = 0;
  const borrowerDebt = new Map<number, number>();
  const skippedBorrows: number[] = [];

  const settle = (t: number) => {
    const dt = t - lastT;
    if (dt <= 0) return;
    for (const [id, locked] of lenderLocked) {
      attributed.set(id, (attributed.get(id) ?? 0) + locked * poolRate * dt);
    }
    lastT = t;
  };

  for (const ev of events) {
    settle(ev.t);
    if (ev.type === 'deposit') {
      lenders.set(ev.lenderId, { deposit: ev.amount, enterAt: ev.t });
    } else if (ev.type === 'borrow') {
      let totalAvailable = 0;
      const eligible: { id: string; available: number }[] = [];
      for (const [id, l] of lenders) {
        if (l.enterAt > ev.t) continue;
        const free = l.deposit - (lenderLocked.get(id) ?? 0);
        if (free > 0) {
          eligible.push({ id, available: free });
          totalAvailable += free;
        }
      }
      if (totalAvailable < ev.debt) {
        skippedBorrows.push(ev.borrowerId);
        continue;
      }
      for (const e of eligible) {
        const lockShare = (ev.debt * e.available) / totalAvailable;
        lenderLocked.set(e.id, (lenderLocked.get(e.id) ?? 0) + lockShare);
      }
      borrowerDebt.set(ev.borrowerId, ev.debt);
    } else if (ev.type === 'repay') {
      const debt = borrowerDebt.get(ev.borrowerId) ?? 0;
      let totalLocked = 0;
      for (const v of lenderLocked.values()) totalLocked += v;
      if (totalLocked > 0) {
        for (const [id, locked] of lenderLocked) {
          const unlock = (locked / totalLocked) * debt;
          lenderLocked.set(id, locked - unlock);
        }
      }
      borrowerDebt.delete(ev.borrowerId);
    }
  }
  settle(tenor);

  return { attributed, skippedBorrows };
}

// ─── Upside Weighted Round-Robin (DirectedLendingPool + backend) ───
//
// Backend allocator picks lenders by [last-served, enter-at, id]. Each
// pass gives every eligible lender min(chunk, remaining, headroom).
// Loops until filled or no lender can move.

export function runUpsideRoundRobin(
  lenderEvents: LenderEvent[],
  borrowerEvents: BorrowerEvent[],
  params: SimParams,
): {
  attributed: Map<string, number>;
  skippedBorrows: number[];
  partialBorrows: { id: number; filledFrac: number }[];
} {
  const { tenor, poolRate, upsideRrChunkSize } = params;
  const events = buildEventStream(lenderEvents, borrowerEvents);
  const lenders = new Map<string, { deposit: number; enterAt: number }>();
  const lenderLocked = new Map<string, number>();
  const lenderLastServedSeq = new Map<string, number>();
  const attributed = new Map<string, number>();
  let lastT = 0;
  let serveSeq = 0;
  const borrowerDebt = new Map<number, number>();
  const skippedBorrows: number[] = [];
  const partialBorrows: { id: number; filledFrac: number }[] = [];

  const settle = (t: number) => {
    const dt = t - lastT;
    if (dt <= 0) return;
    for (const [id, locked] of lenderLocked) {
      attributed.set(id, (attributed.get(id) ?? 0) + locked * poolRate * dt);
    }
    lastT = t;
  };

  for (const ev of events) {
    settle(ev.t);
    if (ev.type === 'deposit') {
      lenders.set(ev.lenderId, { deposit: ev.amount, enterAt: ev.t });
    } else if (ev.type === 'borrow') {
      const debt = ev.debt;
      const t = ev.t;
      const chunkSize = upsideRrChunkSize > 0 ? upsideRrChunkSize : debt;
      const passLocks = new Map<string, number>();
      const passLastSeq = new Map<string, number>();
      let remaining = debt;
      let passCount = 0;
      while (remaining > 0) {
        const eligible: { id: string; enterAt: number; headroom: number }[] = [];
        for (const [id, l] of lenders) {
          if (l.enterAt > t) continue;
          const baseLocked = lenderLocked.get(id) ?? 0;
          const tentative = passLocks.get(id) ?? 0;
          const headroom = l.deposit - baseLocked - tentative;
          if (headroom > 0) eligible.push({ id, enterAt: l.enterAt, headroom });
        }
        if (eligible.length === 0) break;
        eligible.sort((a, b) => {
          const aSeq = passLastSeq.get(a.id) ?? lenderLastServedSeq.get(a.id) ?? 0;
          const bSeq = passLastSeq.get(b.id) ?? lenderLastServedSeq.get(b.id) ?? 0;
          if (aSeq !== bSeq) return aSeq - bSeq;
          if (a.enterAt !== b.enterAt) return a.enterAt - b.enterAt;
          return a.id < b.id ? -1 : 1;
        });
        let movedThisPass = false;
        for (const e of eligible) {
          if (remaining <= 0) break;
          const take = Math.min(chunkSize, remaining, e.headroom);
          if (take <= 0) continue;
          passLocks.set(e.id, (passLocks.get(e.id) ?? 0) + take);
          serveSeq++;
          passLastSeq.set(e.id, serveSeq);
          remaining -= take;
          movedThisPass = true;
        }
        if (!movedThisPass) break;
        passCount++;
        if (passCount > 10_000) break;
      }
      const filledDebt = debt - remaining;
      if (filledDebt > 0) {
        for (const [id, amt] of passLocks) {
          lenderLocked.set(id, (lenderLocked.get(id) ?? 0) + amt);
          const seq = passLastSeq.get(id);
          if (seq !== undefined) lenderLastServedSeq.set(id, seq);
        }
        const filledFrac = filledDebt / debt;
        borrowerDebt.set(ev.borrowerId, filledDebt);
        if (remaining > 0) partialBorrows.push({ id: ev.borrowerId, filledFrac });
      }
      if (remaining > 0) skippedBorrows.push(ev.borrowerId);
    } else if (ev.type === 'repay') {
      const debt = borrowerDebt.get(ev.borrowerId) ?? 0;
      let totalLocked = 0;
      for (const v of lenderLocked.values()) totalLocked += v;
      if (totalLocked > 0) {
        for (const [id, locked] of lenderLocked) {
          const unlock = (locked / totalLocked) * debt;
          lenderLocked.set(id, locked - unlock);
        }
      }
      borrowerDebt.delete(ev.borrowerId);
    }
  }
  settle(tenor);

  return { attributed, skippedBorrows, partialBorrows };
}

// ─── Capacity-weighted Round-Robin (proposed backend method) ──────
//
// Same queue ordering as flat RR (last-served-first) but each pass
// distributes `chunkBase` of total volume *split proportionally to
// each lender's current free capacity*. In the limit of many small
// passes converges to capacity-pro-rata while preserving the per-
// allocation tx ordering of round-robin.

export function runUpsideWeightedRoundRobin(
  lenderEvents: LenderEvent[],
  borrowerEvents: BorrowerEvent[],
  params: SimParams,
): {
  attributed: Map<string, number>;
  skippedBorrows: number[];
  partialBorrows: { id: number; filledFrac: number }[];
} {
  const { tenor, poolRate, upsideRrChunkSize } = params;
  const events = buildEventStream(lenderEvents, borrowerEvents);
  const lenders = new Map<string, { deposit: number; enterAt: number }>();
  const lenderLocked = new Map<string, number>();
  const lenderLastServedSeq = new Map<string, number>();
  const attributed = new Map<string, number>();
  let lastT = 0;
  let serveSeq = 0;
  const borrowerDebt = new Map<number, number>();
  const skippedBorrows: number[] = [];
  const partialBorrows: { id: number; filledFrac: number }[] = [];

  const settle = (t: number) => {
    const dt = t - lastT;
    if (dt <= 0) return;
    for (const [id, locked] of lenderLocked) {
      attributed.set(id, (attributed.get(id) ?? 0) + locked * poolRate * dt);
    }
    lastT = t;
  };

  for (const ev of events) {
    settle(ev.t);
    if (ev.type === 'deposit') {
      lenders.set(ev.lenderId, { deposit: ev.amount, enterAt: ev.t });
    } else if (ev.type === 'borrow') {
      const debt = ev.debt;
      const t = ev.t;
      const chunkBase = upsideRrChunkSize > 0 ? upsideRrChunkSize : debt;
      const passLocks = new Map<string, number>();
      const passLastSeq = new Map<string, number>();
      let remaining = debt;
      let passCount = 0;

      while (remaining > 0) {
        const eligible: { id: string; enterAt: number; headroom: number }[] = [];
        let totalFreeCapacity = 0;
        for (const [id, l] of lenders) {
          if (l.enterAt > t) continue;
          const baseLocked = lenderLocked.get(id) ?? 0;
          const tentative = passLocks.get(id) ?? 0;
          const headroom = l.deposit - baseLocked - tentative;
          if (headroom > 0) {
            eligible.push({ id, enterAt: l.enterAt, headroom });
            totalFreeCapacity += headroom;
          }
        }
        if (eligible.length === 0 || totalFreeCapacity <= 0) break;

        eligible.sort((a, b) => {
          const aSeq = passLastSeq.get(a.id) ?? lenderLastServedSeq.get(a.id) ?? 0;
          const bSeq = passLastSeq.get(b.id) ?? lenderLastServedSeq.get(b.id) ?? 0;
          if (aSeq !== bSeq) return aSeq - bSeq;
          if (a.enterAt !== b.enterAt) return a.enterAt - b.enterAt;
          return a.id < b.id ? -1 : 1;
        });

        const passVolume = Math.min(chunkBase, remaining);
        let movedThisPass = false;
        for (const e of eligible) {
          if (remaining <= 0) break;
          const weighted = (passVolume * e.headroom) / totalFreeCapacity;
          const take = Math.min(weighted, remaining, e.headroom);
          if (take <= 0) continue;
          passLocks.set(e.id, (passLocks.get(e.id) ?? 0) + take);
          serveSeq++;
          passLastSeq.set(e.id, serveSeq);
          remaining -= take;
          movedThisPass = true;
        }
        if (!movedThisPass) break;
        passCount++;
        if (passCount > 10_000) break;
      }

      const filledDebt = debt - remaining;
      if (filledDebt > 0) {
        for (const [id, amt] of passLocks) {
          lenderLocked.set(id, (lenderLocked.get(id) ?? 0) + amt);
          const seq = passLastSeq.get(id);
          if (seq !== undefined) lenderLastServedSeq.set(id, seq);
        }
        const filledFrac = filledDebt / debt;
        borrowerDebt.set(ev.borrowerId, filledDebt);
        if (remaining > 0) partialBorrows.push({ id: ev.borrowerId, filledFrac });
      }
      if (remaining > 0) skippedBorrows.push(ev.borrowerId);
    } else if (ev.type === 'repay') {
      const debt = borrowerDebt.get(ev.borrowerId) ?? 0;
      let totalLocked = 0;
      for (const v of lenderLocked.values()) totalLocked += v;
      if (totalLocked > 0) {
        for (const [id, locked] of lenderLocked) {
          const unlock = (locked / totalLocked) * debt;
          lenderLocked.set(id, locked - unlock);
        }
      }
      borrowerDebt.delete(ev.borrowerId);
    }
  }
  settle(tenor);

  return { attributed, skippedBorrows, partialBorrows };
}

// ─── Borrower summary helper ──────────────────────────────────────
//
// Coupon-residual rebate: IP pays loan_rate on pledged collateral; lenders
// draw pool_rate on debt; the surplus rebates to the borrower. Applies to
// Profitr-NAV-style vaults and Upside Pro-rata (BorrowLendPool also exposes
// the same residual). Std DeFi pools have no per-borrower coupon concept.
//
// `filledFracs` lets the caller signal partial fills (RR) or full skips:
//   - missing key  → fully filled (default)
//   - 1.0          → fully filled
//   - 0 < f < 1    → partial fill (debt + pledged scaled by f)
//   - 0            → skipped (no rebate, no debt)

function computeBorrowerSummary(
  borrowers: BorrowerEvent[],
  filledFracs: Map<number, number>,
  params: SimParams,
  hasRebateConcept: boolean,
): BorrowerSummary {
  const { loanTokenRate, poolRate } = params;
  let filled = 0;
  let partial = 0;
  let skipped = 0;
  let totalRebate = 0;
  let totalDebtFilled = 0;
  for (const b of borrowers) {
    const f = filledFracs.get(b.id) ?? 1.0;
    if (f <= 0) {
      skipped++;
      continue;
    }
    if (f < 1) partial++;
    else filled++;
    const tenure = Math.max(0, b.repayAt - b.borrowAt);
    const debt = b.debt * f;
    const pledged = b.pledged * f;
    const surplus = (pledged * loanTokenRate - debt * poolRate) * tenure;
    totalRebate += Math.max(0, surplus);
    totalDebtFilled += debt;
  }
  const live = filled + partial;
  return {
    totalBorrowers: borrowers.length,
    filledBorrowers: filled,
    partialBorrowers: partial,
    skippedBorrowers: skipped,
    totalRebate: hasRebateConcept ? totalRebate : 0,
    avgRebate: hasRebateConcept && live > 0 ? totalRebate / live : 0,
    rebateAsPctOfDebt:
      hasRebateConcept && totalDebtFilled > 0 ? totalRebate / totalDebtFilled : 0,
    hasRebateConcept,
  };
}

// ─── Aggregate runner ─────────────────────────────────────────────

export function runAllModels(
  lenderEvents: LenderEvent[],
  borrowerEvents: BorrowerEvent[],
  params: SimParams,
): {
  idealApr: number;
  results: ModelResult[];
} {
  const ideal = runIdealDefi(lenderEvents, borrowerEvents, params);
  const vanilla = runProfitrNav(lenderEvents, borrowerEvents, params, 'vanilla');
  const eq = runProfitrNav(lenderEvents, borrowerEvents, params, 'eq-premium');
  const pr = runUpsideProRata(lenderEvents, borrowerEvents, params);
  const rr = runUpsideRoundRobin(lenderEvents, borrowerEvents, params);
  const wrr = runUpsideWeightedRoundRobin(lenderEvents, borrowerEvents, params);

  const idealRes = buildLenderResults(lenderEvents, ideal.attributed, params.tenor);
  const vanillaRes = buildLenderResults(lenderEvents, vanilla, params.tenor);
  const eqRes = buildLenderResults(lenderEvents, eq, params.tenor);
  const prRes = buildLenderResults(lenderEvents, pr.attributed, params.tenor);
  const rrRes = buildLenderResults(lenderEvents, rr.attributed, params.tenor);
  const wrrRes = buildLenderResults(lenderEvents, wrr.attributed, params.tenor);

  const computeRms = (lenders: ModelResult['lenders']): number => {
    if (lenders.length === 0) return 0;
    let sumSq = 0;
    for (const l of lenders) sumSq += (l.apr - ideal.idealApr) ** 2;
    return Math.sqrt(sumSq / lenders.length) * 10_000;
  };

  // Borrower fill maps. NAV-based models always fully fill (the vault doesn't
  // gate borrows by allocation). Pro-rata can skip when capacity is short. RR
  // can both skip and partial-fill.
  const fullFilled = new Map<number, number>();
  const prFills = new Map<number, number>();
  for (const id of pr.skippedBorrows) prFills.set(id, 0);
  const rrFills = new Map<number, number>();
  for (const id of rr.skippedBorrows) rrFills.set(id, 0);
  for (const p of rr.partialBorrows) rrFills.set(p.id, p.filledFrac);
  const wrrFills = new Map<number, number>();
  for (const id of wrr.skippedBorrows) wrrFills.set(id, 0);
  for (const p of wrr.partialBorrows) wrrFills.set(p.id, p.filledFrac);

  const idealBorrower = computeBorrowerSummary(borrowerEvents, fullFilled, params, false);
  const vanillaBorrower = computeBorrowerSummary(borrowerEvents, fullFilled, params, true);
  const eqBorrower = computeBorrowerSummary(borrowerEvents, fullFilled, params, true);
  const prBorrower = computeBorrowerSummary(borrowerEvents, prFills, params, true);
  const rrBorrower = computeBorrowerSummary(borrowerEvents, rrFills, params, true);
  const wrrBorrower = computeBorrowerSummary(borrowerEvents, wrrFills, params, true);

  const results: ModelResult[] = [
    {
      modelKey: 'idealDefi',
      modelName: 'Std DeFi (pool-share)',
      lenders: idealRes.lenders,
      totalLenderInterest: idealRes.totalLenderInterest,
      rmsDeviationBps: 0,
      borrower: idealBorrower,
    },
    {
      modelKey: 'vanillaNav',
      modelName: 'Vanilla NAV',
      lenders: vanillaRes.lenders,
      totalLenderInterest: vanillaRes.totalLenderInterest,
      rmsDeviationBps: computeRms(vanillaRes.lenders),
      borrower: vanillaBorrower,
    },
    {
      modelKey: 'upsideProRata',
      modelName: 'Upside Pro-rata',
      lenders: prRes.lenders,
      totalLenderInterest: prRes.totalLenderInterest,
      rmsDeviationBps: computeRms(prRes.lenders),
      borrower: prBorrower,
      notes:
        pr.skippedBorrows.length > 0
          ? `Skipped ${pr.skippedBorrows.length} borrow(s) — insufficient eligible capacity`
          : undefined,
    },
    {
      modelKey: 'upsideRoundRobin',
      modelName: 'Upside RR (flat chunks)',
      lenders: rrRes.lenders,
      totalLenderInterest: rrRes.totalLenderInterest,
      rmsDeviationBps: computeRms(rrRes.lenders),
      borrower: rrBorrower,
      notes:
        rr.skippedBorrows.length > 0 || rr.partialBorrows.length > 0
          ? `Skipped: ${rr.skippedBorrows.length} · Partial: ${rr.partialBorrows.length}`
          : undefined,
    },
    {
      modelKey: 'upsideWeightedRoundRobin',
      modelName: 'Weighted RR (capacity-prop)',
      lenders: wrrRes.lenders,
      totalLenderInterest: wrrRes.totalLenderInterest,
      rmsDeviationBps: computeRms(wrrRes.lenders),
      borrower: wrrBorrower,
      notes:
        wrr.skippedBorrows.length > 0 || wrr.partialBorrows.length > 0
          ? `Skipped: ${wrr.skippedBorrows.length} · Partial: ${wrr.partialBorrows.length}`
          : undefined,
    },
    {
      modelKey: 'eqPremium',
      modelName: `Equalisation Premium @ ${(params.eqRate * 100).toFixed(0)}%`,
      lenders: eqRes.lenders,
      totalLenderInterest: eqRes.totalLenderInterest,
      rmsDeviationBps: computeRms(eqRes.lenders),
      borrower: eqBorrower,
    },
  ];

  return { idealApr: ideal.idealApr, results };
}
