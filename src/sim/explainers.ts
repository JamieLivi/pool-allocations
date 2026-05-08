import type { ModelKey } from './types';

export type Explainer = {
  key: ModelKey;
  name: string;
  shortDescription: string;
  whatItDoes: string;
  rationale: string;
  borrowerSide: string;
  fairnessProperties: { label: string; pass: boolean | 'partial'; note?: string }[];
  references?: { label: string; href: string }[];
  /**
   * Span this many grid columns on wide viewports. Defaults to 1.
   * Falls back to auto on narrow viewports (see App.css).
   */
  widthCols?: 2 | 3;
};

export const EXPLAINERS: Record<ModelKey, Explainer> = {
  idealDefi: {
    key: 'idealDefi',
    name: 'Std DeFi (pool-share)',
    shortDescription:
      'Aave/Compound/Maple-style pool. Every dollar-second of deposit earns the same APR.',
    whatItDoes:
      "The total interest pool over the tenor is divided proportionally across each lender's $-years of participation. Lenders who deposit early or large get more in absolute terms because they contribute more $-years — but the per-$-year rate is identical for everyone.",
    rationale:
      'This is the dominant fairness model in DeFi pool lending. It satisfies all four standard mechanism-design fairness axioms: proportionality, no-envy, monotonicity, and strategy-proofness. Used as the reference benchmark — any deviation in another model is measured as RMS basis-points away from this APR.\n\nNote: this is the canonical DeFi convention, but it is not the only credible fairness model. Closed-end TradFi private credit funds explicitly reward early entrants via subsequent-close equalisation interest — see the Equalisation Premium card for the alternative anchor.',
    borrowerSide:
      "Borrowers in standard DeFi pools pay a flat rate on debt and get nothing back. There's no concept of pledged collateral earning a separate coupon — the borrower's interest payment goes straight to the pool and is shared by lenders. So the rebate column shows N/A for this model. (Aave, Compound, Maple all work this way; the rate is set by a kinked utilisation curve, not by a coupon-residual.)",
    fairnessProperties: [
      { label: 'Proportionality', pass: true },
      { label: 'No-envy', pass: true },
      { label: 'Monotonicity', pass: true },
      { label: 'Strategy-proof', pass: true },
    ],
    references: [
      {
        label: 'Aave V3 borrow rate / utilisation',
        href: 'https://docs.aave.com/risk/liquidity-risk/borrow-interest-rate',
      },
      { label: 'Compound v2 cTokens', href: 'https://docs.compound.finance/v2/ctokens/' },
      {
        label: 'Maple lending docs',
        href: 'https://docs.maple.finance/cash-management-pool/lending',
      },
    ],
  },
  vanillaNav: {
    key: 'vanillaNav',
    name: 'Vanilla NAV',
    shortDescription:
      "ERC-4626 share vault with no late-deposit correction. What you'd get if you implemented a pool with no equalisation logic.",
    whatItDoes:
      "When a lender deposits, they receive shares = amount × totalShares / totalAssets. The vault's NAV grows as borrower interest accrues. Late depositors buy in at the current PPS, which means they don't 'miss' anything — but if they deposit during a low-util ramp-up, they get a depressed entry price and ride the subsequent rate increase essentially for free.",
    rationale:
      'This is what happens if you build a 4626 vault and call it a day. It tends to over-reward late entrants in scenarios where utilisation rises after they deposit, because their cheap shares capture the same forward NAV uplift as long-time holders. In stable-util pools the bias is small; in pathological cases it can be enormous (see the late-entrant scenario).',
    borrowerSide:
      "Every borrower fully fills (the vault doesn't gate borrows by allocation). Each borrower receives a coupon-residual rebate: `(pledged × loan_rate − debt × pool_rate) × tenure`, clamped at zero. The IP pays a fixed coupon on collateral; lenders only draw the lower pool rate on debt; the surplus belongs to the borrower. This is identical across all Profitr-style and Pro-rata models — borrower-side attribution is independent of how lenders are allocated.",
    fairnessProperties: [
      { label: 'Proportionality', pass: 'partial', note: 'within a stable-util cohort' },
      { label: 'No-envy', pass: false, note: 'late entrants prefer cheap PPS during ramps' },
      { label: 'Monotonicity', pass: 'partial' },
      { label: 'Strategy-proof', pass: false, note: 'incentive to time low-util windows' },
    ],
    references: [
      {
        label: 'EIP-4626 Tokenized Vault Standard',
        href: 'https://eips.ethereum.org/EIPS/eip-4626',
      },
    ],
  },
  upsideProRata: {
    key: 'upsideProRata',
    name: 'Upside Pro-rata',
    shortDescription:
      'BorrowLendPool — per-lender pro-rata locking. Snapshot mechanism with structural exclusion of late entrants from prior borrows.',
    whatItDoes:
      "Each new borrow locks all eligible lenders proportionally to their available capacity at that moment. Lenders who deposited later don't share in earlier borrows — they're literally not in the lock set. On repay, capital pro-rata-unlocks across whoever is currently locked.",
    rationale:
      'Closely models real Upside contracts: capital is allocated per-borrow against a snapshot of current capacity. Strong cohort-level proportionality (everyone in the lock set earns identically per locked $-year) but late entrants are structurally excluded from existing positions — they cannot earn from borrows that already started. This produces lower late-entrant APRs even in non-pathological scenarios.',
    borrowerSide:
      "Borrowers receive the same coupon-residual rebate as the Profitr NAV models. Caveat: a borrow is rejected outright if total available capacity across eligible lenders is less than the requested amount — no partial fills, no pro-rating from full deposits. Push utilisation high enough and you'll see borrowers skipped (count appears in the panel). Skipped borrowers walk away with no debt and no rebate.",
    fairnessProperties: [
      { label: 'Proportionality', pass: true, note: 'within each borrow cohort' },
      { label: 'No-envy', pass: false, note: 'late lenders cannot access prior borrows' },
      { label: 'Monotonicity', pass: false, note: 'late ≠ less reward; structural exclusion' },
      { label: 'Strategy-proof', pass: false, note: 'entry timing critical' },
    ],
    references: [
      { label: 'BorrowLendPool.sol', href: 'https://github.com/republicfund/borrow-lend-protocol' },
    ],
  },
  upsideRoundRobin: {
    key: 'upsideRoundRobin',
    name: 'Round-Robin (flat chunks)',
    shortDescription:
      'Upside [DirectedLendingPool](https://github.com/republicfund/borrow-lend-protocol/blob/main/contracts/DirectedLendingPool.sol) + backend allocator — queue rotation with **flat** chunk-per-pass allocation. Each `borrowFrom` ties one specific borrower to one specific lender on-chain.',
    whatItDoes:
      'Eligible lenders are sorted each pass by [last-served, enter-at, id]. Every pass gives every lender min(chunk, remaining, headroom). The loop continues until the borrow is filled or no lender can move. Each allocation is its own `borrowFrom(borrower, lender, amount)` transaction — partial fills commit on-chain.',
    rationale:
      "**Architecture: Upside Directed Pool.** This model and the Weighted RR variant both simulate the [DirectedLendingPool](https://github.com/republicfund/borrow-lend-protocol/blob/main/contracts/DirectedLendingPool.sol) contract — fundamentally different from BorrowLendPool / Pro-rata in how borrows attach to lenders. The on-chain primitive is `borrowFrom(borrower, lender, collateralAmount)`, called by the operator under `onlyTransferAdmin`. The contract has **no on-chain matching logic** — it just accepts the operator's choice of which lender funds which borrower and locks that lender's capital. All allocation logic (queue rotation, chunking, weighting) lives in `allocationService.ts` in the backend.\n\n**What \"directed\" means in practice:**\n\n• **Per-loan lender-borrower pairing.** Each borrow is funded by one specific lender (or, in flat RR's case, a small set of lenders, one per chunk). For the duration of the loan, *that lender's capital is funding that borrower's debt* — not pooled exposure. Each `borrowFrom` emits a `BorrowedFrom(borrower, lender, …)` event you can audit on-chain.\n• **Lock duration matches loan term.** Once the operator routes a borrow to Lender A, Lender A's principal is locked until the borrower repays. Lenders cannot withdraw locked capital mid-loan.\n• **Per-lender interest attribution.** Only the matched lender(s) accrue interest on the locked amount while it's deployed. The contract's `_snapshotTargetLender` mapping tracks who was directed to each borrow, and `_computeLockedAndOwnership` attributes interest accordingly. This is the source of per-lender APR variance.\n• **Repay diffusion weakens the link.** When *any* borrower repays, the unlock spreads proportionally across *all* currently-locked lenders (`unlock_i = (delta × locked_i) / totalLocked`) — not just the lender originally matched to that borrower. So the directed link is strongest at borrow-time and degrades as repays cycle through.\n• **Default recovery is pool-wide, not directed.** `claimDefaultedCollateral()` distributes residual collateral proportionally to share balance — not to whoever was matched to the defaulting borrower. The directed architecture gives interest attribution but **NOT default isolation**: a lender matched to a high-quality borrower bears the same default risk as one matched to a risky borrower.\n• **Operator concentration risk.** Lenders trust the operator to allocate fairly. The on-chain contract has no opinion about who gets matched to whom; it executes whatever the operator submits.\n\n**Implementation history.** The flat chunk shape was our best-effort interpretation of the \"queue-based borrow allocation\" requirement we were given. An earlier, simpler round-robin attempt — just cycle through eligible lenders in fixed order, one chunk per turn — skewed APRs massively in favour of late entrants: small late-arriving lenders ran at near-full utilisation while the anchor sat partially idle. Adding the [last-served-seq ASC (never-served first), enter-at ASC, address ASC] sort order each pass dampens that bias by ensuring no lender is repeatedly skipped over, but it doesn't fix the underlying problem.\n\n**Why the skew remains.** The chunk-per-pass mechanic is structurally insensitive to deposit size. A $5M anchor and a $500K small lender both receive the same per-pass chunk, so the small lender's deposit gets consumed (and earns interest) at 10× the rate per dollar deployed. The deviation you see in the results table — anchor underperforming, small late entrants overperforming — is the visible manifestation of this proportionality break.\n\n**Doesn't the chunk-size knob help?** It's tweakable (the slider in panel 2) but it controls *dispersion of each borrow*, not lender-side proportionality. Sweeping chunk size from $1K to unlimited on the dynamic-flow scenario barely moves the APR distribution: anchor stays at 3.08–3.12%, smallest lender stays at 4.74–4.86%. With small chunks each borrow spreads across many lenders per pass, but every lender still gets the same per-pass amount, so small lenders proportionally fill up faster. With large chunks each borrow concentrates to the front-of-queue lender, but queue rotation hands borrows out roughly evenly *by count* across lenders — which is even worse for proportionality, because count-equal allocation gives a small lender the same number of borrows as the anchor. The fundamental fix would be a deposit-weighted chunk (e.g., `chunkSize × lender.deposit / totalEligibleDeposit`), which is what \"weighted RR\" should arguably mean — and what we now ship as the `WEIGHTED_ROUND_ROBIN` strategy alongside this one.",
    borrowerSide:
      "Borrowers can be partially filled or skipped depending on lender headroom across passes. A borrow that gets some chunks placed but not all of them is committed at the partial amount — the borrower's effective debt is whatever filled, and their rebate scales down with it. If no lender has any headroom by the time the loop terminates, the borrow is skipped entirely. This is the only model where the borrower outcome can vary based on the allocator state at borrow-time.",
    fairnessProperties: [
      { label: 'Proportionality', pass: false, note: 'chunk-per-pass insensitive to deposit size' },
      { label: 'No-envy', pass: false, note: 'same stake, different queue position' },
      { label: 'Monotonicity', pass: false },
      { label: 'Strategy-proof', pass: false },
    ],
    references: [
      {
        label: 'DirectedLendingPool.sol',
        href: 'https://github.com/republicfund/borrow-lend-protocol',
      },
    ],
  },
  upsideWeightedRoundRobin: {
    key: 'upsideWeightedRoundRobin',
    name: 'Weighted Round-Robin\n(capacity-proportional)',
    widthCols: 2,
    shortDescription:
      "Same queue ordering as flat RR but each pass distributes the chunk **split proportionally to each lender's free capacity**. **Identical to Upside Pro-rata under capacity** — same allocation strategy in two different operational shapes. Diverges only when individual borrows exceed available headroom (Pro-rata skips, WRR partial-fills).",
    whatItDoes:
      "Per pass, the allocator computes `weight_i = passVolume × freeCapacity_i / totalFreeCapacity` for each eligible lender and gives them `min(weight_i, remaining, headroom_i)`. Queue ordering ([last-served, enter-at, address]) is preserved as a tiebreaker for tx emission order, but the per-lender chunk now scales with capacity rather than being flat.\n\n**Chunk size only affects tx granularity, not allocation outcome.** Each lender's total accumulation across all passes simplifies to `borrowAmount × freeCapacity_i / totalFreeCapacity` — invariant of the chunk size. Sweeping the chunk slider from $1K to unlimited gives identical APR distributions to two decimal places. The chunk only controls how many `borrowFrom` transactions get emitted on-chain (1 at unlimited, many at small sizes). End-state is **capacity pro-rata** — the same as the existing `PRO_RATA` strategy in one shot — while preserving the per-allocation tx ordering and on-chain queue semantics of round-robin.",
    rationale:
      "**Architecture: Upside Directed Pool.** Like flat RR, this strategy targets the [DirectedLendingPool](https://github.com/republicfund/borrow-lend-protocol/blob/main/contracts/DirectedLendingPool.sol) contract. Each pass emits one `borrowFrom(borrower, lender, amount)` per eligible lender, so a single borrow becomes a *fan-out* of small directed locks across the entire eligible set rather than a single concentrated lock. The architectural implications still apply but with different intensity:\n\n• **Per-loan lender-borrower pairing — but fragmented.** A borrow funded by 6 lenders produces 6 distinct `BorrowedFrom` events, each binding one lender to a fraction of that borrower's debt. The `_snapshotTargetLender` chain trail attributes interest correctly per fragment.\n• **Lock duration still matches loan term.** Each fragment of locked capital stays locked until the borrower repays — same as flat RR, just distributed.\n• **Per-lender interest attribution.** Each lender's locked fragment accrues interest while deployed; the per-lender APR distribution converges to capacity-pro-rata across many borrows.\n• **Repay diffusion same as flat RR.** Repays unlock proportionally across all currently-locked lenders, weakening the directed link over time.\n• **Default recovery is pool-wide, not directed.** `claimDefaultedCollateral()` distributes residual collateral by share balance — not by which fragments were tied to the defaulting borrower. So fan-out spreading doesn't buy default isolation; the only thing it diversifies is the *interest-attribution* mapping, not the *risk* mapping.\n• **More on-chain transactions per borrow.** N eligible lenders × M passes = up to N×M `borrowFrom` calls per single borrow request. Higher gas cost than flat RR (which can be one tx per borrow if the chunk is unlimited) and much higher than Pro-rata (one logical batch per borrow).\n\n**Why we added this.** Empirically, sweeping flat-RR chunk size from $1K to unlimited barely moved the APR distribution: anchor stays at ~3.1%, smallest lender at ~4.8%. The skew is structural — a flat per-lender chunk treats a $5M anchor and a $500K small lender identically per pass, so small lenders saturate at the same dollar rate as anchors. Weighting the chunk by free capacity removes that structural break.\n\n**Equivalence with Pro-rata under capacity.** For our purposes, this and `PRO_RATA` are the **same allocation strategy in two different operational shapes**. The math is identical:\n\n- **Pro-rata**: per borrow, lock `lender_i = borrow × freeCap_i / totalFreeCap` in one shot.\n- **Weighted RR**: per borrow, run multiple passes, each distributing `passVolume × freeCap_i / totalFreeCap`. Summed over all passes, each lender accumulates exactly `borrow × freeCap_i / totalFreeCap`.\n\nBoth filter eligible lenders by `enterAt ≤ t`, so late entrants are excluded from prior borrows in both. The comparison table confirms this — APRs match to two decimal places across every scenario at any util ≤ 100%, any chunk size, any borrower count.\n\n**Where they diverge: capacity stress.** When an individual borrow exceeds the eligible lenders' combined free headroom:\n- **Pro-rata** has a hard skip guard (`if totalAvailable < ev.debt: skip`). Either the whole borrow fits or it's rejected outright.\n- **Weighted RR** allocates whatever capacity is available across passes and commits the partial fill. Only fully skips when no capacity exists at all.\n\nSo under stress (target util > 100%, or chunky borrows before repayments cycle capacity), WRR delivers strictly more interest than Pro-rata — at the cost of some borrowers being partially funded rather than cleanly rejected. Push the util slider past 99% on Dynamic flow with `wave1=5` to see it in action.\n\n**Other than the partial-fill divergence, the only differences are operational**:\n\n- On-chain tx count per borrow: Pro-rata = 1 logical op; Weighted RR = N (one per pass × eligible lender).\n- Queue tiebreaker for tx order: Pro-rata = none; Weighted RR = `[last-served, enter-at, address]`.\n- Implementation complexity: Pro-rata is simpler; Weighted RR needs queue-state tracking.\n\nSo: pick Weighted RR if you want capacity-proportional economics with queue-based on-chain tx semantics (e.g. for downstream tooling that consumes one `borrowFrom` per allocation). Pick Pro-rata if you don't care about per-tx ordering — same end-state, less code, fewer txs.\n\n**Implementation.** Lives alongside `ROUND_ROBIN` in `allocationService.ts` as a new `WEIGHTED_ROUND_ROBIN` strategy; reuses the existing `roundRobinChunkTokens` config field but reinterprets it as the **base per-pass volume** rather than per-lender. Floor-division stalls (when the chunk is so small that all proportional shares round to 0) fall back to the same 1-wei sweep used by `EQUAL_SPLIT`.",
    borrowerSide:
      'Borrower-side behaviour mirrors the flat round-robin: same coupon-residual rebate math, same skip / partial-fill semantics when capacity is tight. The only thing that changes is *which* lenders absorb each borrow — and that’s a lender-side concern, not a borrower-side one.',
    fairnessProperties: [
      { label: 'Proportionality', pass: true, note: 'capacity-weighted per pass' },
      { label: 'No-envy', pass: 'partial', note: 'tx ordering may still differ' },
      { label: 'Monotonicity', pass: true },
      { label: 'Strategy-proof', pass: 'partial', note: 'same as PRO_RATA in steady state' },
    ],
    references: [
      {
        label: 'allocationService.ts — WEIGHTED_ROUND_ROBIN implementation',
        href: 'https://github.com/profitr/profitr-monorepo/blob/main/backend/src/domains/borrow-lend/services/allocationService.ts',
      },
    ],
  },
  eqPremium: {
    key: 'eqPremium',
    name: 'Equalisation Premium',
    widthCols: 3,
    shortDescription:
      'Proposed mechanism. Late depositor receives fewer ERC-4626 shares per the additive cap formula: cap = FIXED + RATE × yearsSinceInception.',
    whatItDoes:
      "Like Vanilla NAV with an adjustment: at deposit time, the share count is haircut by an additive cap with two components — a fixed entry premium and a time-scaled accrual. A lender entering at t=0 gets a vanilla 1:1 deposit-to-shares conversion. A lender entering at t=1y gets `1 − (FIXED + RATE × 1)` of the vanilla shares — the rest accrues to standing lenders as a NAV uplift. The cap is bounded at 95% to keep the vault solvent.\n\nThe two-component shape directly mirrors the way closed-end private equity / credit funds handle subsequent closings: late LPs pay (i) **Equalisation Capital** — a one-time catch-up payment for their pro-rata share of prior drawdowns and organisational expenses — and (ii) **Equalisation Interest** — a per-year accrual on the catch-up. Profitr's FIXED corresponds to (i); RATE × t corresponds to (ii).",
    rationale:
      "**Why two components?** The fixed and variable parts answer different questions and have different precedents.\n\n**Time-scaled (RATE × t) — the equalisation interest layer.** Asks: given the late lender missed N years of pool risk, what should they pay per year of absence? Direct precedent: Macfarlanes' direct-lending equalisation interest range (6.5–8.5%/y), ILPA-model LPA equalisation interest (typically pegged to the fund's preferred return), and real estate mezzanine debt all-in cost (12–18%/y). Default 18%/y sits at the upper bound of RE mezz, which is internally consistent with the asset class — late entrants are charged at the same risk-adjusted return the underlying loans generate.\n\n**Fixed (FIXED) — the catch-up / anti-dilution layer.** Asks: what does a late lender owe just for the act of joining, regardless of how recently the pool launched? Three precedents stack:\n\n1. **PE Equalisation Capital** — distinct from equalisation interest in every standard LPA. Late LPs make a one-time catch-up payment covering their pro-rata share of (a) prior drawdowns, (b) organisational/setup expenses (typically capped at ~1% of fund size), and (c) any management fees accrued since inception. Set at the moment of entry based on pool state, not scaled by time since inception. Profitr's FIXED is the closed-form proxy: instead of accounting for each individual late LP's catch-up amount, the share-haircut captures their share of foundational deployment in one number.\n\n2. **UCITS swing pricing / SEC Rule 22c-1 anti-dilution levy.** Subscribing investor's NAV is \"swung\" by a fixed swing factor — typically 0.5–2% for liquid funds, capped around 2% for bond funds — to internalise the transaction and dilution costs imposed on standing investors. Discrete, set by the fund manager, applied per subscription, not time-scaled. Profitr's FIXED is structurally identical to a swing factor, just larger because it bundles the catch-up and dilution layers together.\n\n3. **NYC co-op working capital contribution.** Fixed entry fee (1–2 months maintenance) paid by every new buyer, layered on top of an age-graduated flip tax. The fixed component recognises that the building's reserves were funded by prior owners — a discrete acknowledgement of foundational work, not a time-scaled amount.\n\n**Why we need it (anti-gaming).** Without a fixed floor, the cap = RATE × t formula collapses to ~0% at t = 0⁺, meaning a sophisticated lender could deposit one day after pool launch and pay essentially nothing — despite missing the entire pre-deployment risk-bearing phase that anchor lenders absorbed. The FIXED is the anti-gaming guard rail: even the very-fastest follower pays a non-trivial premium in recognition of being a follower at all.\n\n**Calibration of FIXED = 8%.** The default sits at the canonical **PE preferred-return hurdle** — ILPA's industry-intelligence reports show 8% is the single most common pref rate across closed-end credit and PE funds. Using the same number as the fund's standard hurdle is the most internally-consistent choice: late entrants effectively pre-pay one full year of pref-equivalent up front, then continue to accrue the time-scaled component on top.\n\nIt's higher than a pure UCITS swing factor (≤2%) because it bundles two layers in one share-fraction haircut — the catch-up to existing deployment AND the per-subscription dilution premium — instead of splitting them across two on-chain mechanisms. Empirically, at 8% fixed + 18%/y variable, the EQ Premium produces anchor-lender APRs that closely match Upside Pro-rata's anchor APR in the dynamic-flow scenario, while preserving lender-size proportionality that Pro-rata partially loses.\n\n**Beyond the equalisation math — what the vault wrapper itself buys you.** The EQ Premium isn't just a fairness mechanism; it's a haircut applied at one specific point in a broader ERC-4626 vault. Choosing the vault path (vs Upside-style non-transferable lender shares) brings a stack of benefits regardless of which haircut formula you pick — and EQ Premium gets all of them by living inside that wrapper:\n\n• **[ERC-7540](https://eips.ethereum.org/EIPS/eip-7540) queued + sync redemptions.** Lenders can request a redemption that gets serviced as USDC frees up. Sync `redeem()` against currently-liquid USDC plus any sleeve withdrawability for instant exit when capacity exists; `requestRedeem` → `claimRedeem` for the queued path when locked. Direct on-chain analogue of TradFi interval funds (Apollo ADCF, Ares ASIF) but continuous rather than quarterly. Used in production by Centrifuge V3 ($1.34B TVL) and other RWA platforms. Compare with Upside, where lender principal is locked until the matched borrower repays — no programmatic exit option at all.\n\n• **ERC-1404 KYC-gated transferable shares.** Shares can transfer between allowlisted holders, enabling secondary-market resale to other approved lenders. Direct on-chain analogue of LSTA-style assignment in syndicated loans. Upside lender tokens are permanently soulbound — no resale path, ever.\n\n• **NAV-based mark-to-market.** `convertToAssets(shares)` gives a continuous fair-value snapshot at any moment. Useful for accounting, reporting, secondary-trade pricing, and lender-side P&L. Direct holders and Upside lenders have no equivalent oracle; pricing requires admin intervention or stale snapshots.\n\n• **Permissionless default recovery.** `markDefaulted` and `claimDefaultedCollateral` are open functions — not admin-gated. If the operator freezes, exits, or simply takes too long, lenders can still recover collateral pro-rata without anyone's signature. Critical risk-mitigant for the worst tail-events; Upside's same path is admin-only.\n\n• **Composability with the wider DeFi stack.** ERC-4626 is the dominant vault standard — yield aggregators (Morpho Vault V2, Yearn V3), portfolio dashboards, on-chain accounting tools, KYC-aware DEXes, and risk frameworks all speak it natively. Building on the standard means the vault inherits the entire 4626 tooling ecosystem for free. Custom share tokens (Upside) get none of this.\n\n• **Real liquidity premium credit (~50–150bps).** Real markets price *non-transferable, no-exit, no-quote* assets 50–150bps below *transferable + queued + NAV-marked* equivalents. The vault flips the liquidity adjustment from a cost (Upside-style) to a credit (vault-style) — typically about 75bps in the spread budget at midpoint. That credit is bigger than the 50bp wedge between EQ Premium and the DeFi pool-share baseline, so the vault more than pays for the equalisation correction it enables.\n\nThese aren't unique to EQ Premium — they apply to Vanilla NAV too. The point is that *because EQ Premium runs inside this same vault wrapper* (it's just an additional haircut at the share-issuance point), choosing it doesn't sacrifice any of the above. You get the equalisation correction *plus* the standard vault benefits, in one design.",
    borrowerSide:
      "Borrower-side behaviour is identical to Vanilla NAV: same coupon-residual rebate, every borrower fills. The Equalisation Premium only modifies share issuance to late lenders — the borrower's pledged collateral, debt, IP coupon, and rebate calculation are unchanged. From the borrower's perspective, this model and Vanilla NAV are indistinguishable.",
    fairnessProperties: [
      { label: 'Proportionality', pass: 'partial', note: 'within a cohort, after share haircut' },
      { label: 'No-envy', pass: 'partial', note: 'transfers value from late to early' },
      { label: 'Monotonicity', pass: true },
      { label: 'Strategy-proof', pass: false, note: 'entry timing matters by design' },
    ],
    references: [
      {
        label: 'ILPA Model LPA (subsequent close equalisation)',
        href: 'https://ilpa.org/wp-content/uploads/2020/07/ILPA-Model-LPA-Term-Sheet-WOF-Version-1.pdf',
      },
      {
        label: 'ILPA — What is Market in Fund Terms (8% pref prevalence)',
        href: 'https://ilpa.org/wp-content/uploads/2021/10/2021-ILPA-Industry-Intelligence-Report-What-is-Market-in-Fund-Terms.pdf',
      },
      {
        label: 'EisnerAmper — Subsequent Closings for PE Funds (catch-up + interest)',
        href: 'https://www.eisneramper.com/insights/private-equity/subsequent-closings-finds-pe-0623/',
      },
      {
        label: 'Khan (Cash & Carried) — Catch Ups and Equalisation Interest',
        href: 'https://cashandcarried.substack.com/p/catch-ups-and-equalization-interest',
      },
      {
        label: 'AFG — Swing Pricing & Anti-Dilution Levies guide',
        href: 'https://www.afg.asso.fr/app/uploads/2020/12/guidepro-swingpricing-eng-201207web-1.pdf',
      },
      {
        label: 'BlackRock — Swing Pricing whitepaper',
        href: 'https://www.blackrock.com/corporate/literature/whitepaper/spotlight-swing-pricing-raising-the-bar-september-2021.pdf',
      },
      {
        label: 'Macfarlanes — Credit funds equalisation interest',
        href: 'https://www.macfarlanes.com/insights/102lodj/credit-funds-transfers-between-related-funds-and-accounts-equalisation-and-ram/',
      },
      {
        label: 'Ascendant Capital — Mezzanine Debt Explained (12-18%/y range)',
        href: 'https://www.ascendantglobalcreditgroup.com/insights/mezzanine-debt-explained-high-risk-high-reward-private-credit',
      },
      {
        label: 'EIP-7540 — Asynchronous ERC-4626 Tokenized Vaults',
        href: 'https://eips.ethereum.org/EIPS/eip-7540',
      },
      {
        label: 'EIP-4626 — Tokenized Vault Standard',
        href: 'https://eips.ethereum.org/EIPS/eip-4626',
      },
      {
        label: 'Centrifuge V3 — production ERC-7540 RWA implementation',
        href: 'https://docs.centrifuge.io/use/',
      },
    ],
  },
};
