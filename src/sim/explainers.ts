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
  /** Render this card spanning two grid columns on wide viewports. */
  wide?: boolean;
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
      'DirectedLendingPool + backend allocator — queue rotation with **flat** chunk-per-pass allocation.',
    whatItDoes:
      'Eligible lenders are sorted each pass by [last-served, enter-at, id]. Every pass gives every lender min(chunk, remaining, headroom). The loop continues until the borrow is filled or no lender can move. Each allocation is its own borrowFrom transaction — partial fills commit on-chain.',
    rationale:
      "**Implementation history.** This is our best-effort interpretation of the \"queue-based borrow allocation\" requirement we were given. An earlier, simpler round-robin attempt — just cycle through eligible lenders in fixed order, one chunk per turn — skewed APRs massively in favour of late entrants: small late-arriving lenders ran at near-full utilisation while the anchor sat partially idle. Adding the [last-served-seq ASC (never-served first), enter-at ASC, address ASC] sort order each pass dampens that bias by ensuring no lender is repeatedly skipped over, but it doesn't fix the underlying problem.\n\n**Why the skew remains.** The chunk-per-pass mechanic is structurally insensitive to deposit size. A $5M anchor and a $500K small lender both receive the same per-pass chunk, so the small lender's deposit gets consumed (and earns interest) at 10× the rate per dollar deployed. The deviation you see in the results table — anchor underperforming, small late entrants overperforming — is the visible manifestation of this proportionality break.\n\n**Doesn't the chunk-size knob help?** It's tweakable (the slider in panel 2) but it controls *dispersion of each borrow*, not lender-side proportionality. Sweeping chunk size from $1K to unlimited on the dynamic-flow scenario barely moves the APR distribution: anchor stays at 3.08–3.12%, smallest lender stays at 4.74–4.86%. With small chunks each borrow spreads across many lenders per pass, but every lender still gets the same per-pass amount, so small lenders proportionally fill up faster. With large chunks each borrow concentrates to the front-of-queue lender, but queue rotation hands borrows out roughly evenly *by count* across lenders — which is even worse for proportionality, because count-equal allocation gives a small lender the same number of borrows as the anchor. The fundamental fix would be a deposit-weighted chunk (e.g., `chunkSize × lender.deposit / totalEligibleDeposit`), which is what \"weighted RR\" should arguably mean — but that's not how the deployed allocator behaves today.\n\n**What this matches.** The implementation mirrors what's actually deployed in the Upside backend (`allocationService.allocateRoundRobin` + `processDirectedBorrowRequests`). The deployment is operator-driven: the matching layer runs off-chain in the backend and emits one `borrowFrom` transaction per allocation; the on-chain `DirectedLendingPool` accepts whatever the operator submits under `onlyTransferAdmin`.",
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
    name: 'Weighted Round-Robin (capacity-proportional)',
    shortDescription:
      'New backend strategy. Same queue ordering as flat RR but each pass distributes the chunk **split proportionally to each lender’s free capacity** — fixing the proportionality break.',
    whatItDoes:
      "Per pass, the allocator computes `weight_i = passVolume × freeCapacity_i / totalFreeCapacity` for each eligible lender and gives them `min(weight_i, remaining, headroom_i)`. Queue ordering ([last-served, enter-at, address]) is preserved as a tiebreaker for tx emission order, but the per-lender chunk now scales with capacity rather than being flat.\n\n**Chunk size only affects tx granularity, not allocation outcome.** Each lender's total accumulation across all passes simplifies to `borrowAmount × freeCapacity_i / totalFreeCapacity` — invariant of the chunk size. Sweeping the chunk slider from $1K to unlimited gives identical APR distributions to two decimal places. The chunk only controls how many `borrowFrom` transactions get emitted on-chain (1 at unlimited, many at small sizes). End-state is **capacity pro-rata** — the same as the existing `PRO_RATA` strategy in one shot — while preserving the per-allocation tx ordering and on-chain queue semantics of round-robin.",
    rationale:
      '**Why we added this.** Empirically, sweeping flat-RR chunk size from $1K to unlimited barely moved the APR distribution: anchor stays at ~3.1%, smallest lender at ~4.8%. The skew is structural — a flat per-lender chunk treats a $5M anchor and a $500K small lender identically per pass, so small lenders saturate at the same dollar rate as anchors. Weighting the chunk by free capacity removes that structural break.\n\n**How it relates to the existing strategies.** It sits between `ROUND_ROBIN` (true flat rotation) and `PRO_RATA` (one-shot capacity-proportional split). The single-shot pro-rata strategy gives identical economics in steady state but emits all allocations as one logical batch. Weighted-RR keeps round-robin’s pass-by-pass cadence and queue-tiebreaker for tx ordering — useful if there’s an operational reason to keep that shape (e.g. front-of-queue priority for late-served lenders, deterministic tx order for downstream tooling).\n\n**Implementation.** Lives alongside `ROUND_ROBIN` in `allocationService.ts` as a new `WEIGHTED_ROUND_ROBIN` strategy; reuses the existing `roundRobinChunkTokens` config field but reinterprets it as the **base per-pass volume** rather than per-lender. Floor-division stalls (when the chunk is so small that all proportional shares round to 0) fall back to the same 1-wei sweep used by `EQUAL_SPLIT`.',
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
    wide: true,
    shortDescription:
      "Profitr's proposed mechanism. Late depositor receives fewer ERC-4626 shares per the additive cap formula: cap = FIXED + RATE × yearsSinceInception.",
    whatItDoes:
      "Like Vanilla NAV with one twist: at deposit time, the share count is haircut by an additive cap with two components — a fixed entry premium and a time-scaled accrual. A lender entering at t=0 gets a vanilla 1:1 deposit-to-shares conversion. A lender entering at t=1y gets `1 − (FIXED + RATE × 1)` of the vanilla shares — the rest accrues to standing lenders as a NAV uplift. The cap is bounded at 95% to keep the vault solvent.\n\nThe two-component shape directly mirrors the way closed-end private equity / credit funds handle subsequent closings: late LPs pay (i) **Equalisation Capital** — a one-time catch-up payment for their pro-rata share of prior drawdowns and organisational expenses — and (ii) **Equalisation Interest** — a per-year accrual on the catch-up. Profitr's FIXED corresponds to (i); RATE × t corresponds to (ii).",
    rationale:
      "**Why two components?** The fixed and variable parts answer different questions and have different precedents.\n\n**Time-scaled (RATE × t) — the equalisation interest layer.** Asks: given the late lender missed N years of pool risk, what should they pay per year of absence? Direct precedent: Macfarlanes' direct-lending equalisation interest range (6.5–8.5%/y), ILPA-model LPA equalisation interest (typically pegged to the fund's preferred return), and real estate mezzanine debt all-in cost (12–18%/y). Default 18%/y sits at the upper bound of RE mezz, which is internally consistent with the asset class — late entrants are charged at the same risk-adjusted return the underlying loans generate.\n\n**Fixed (FIXED) — the catch-up / anti-dilution layer.** Asks: what does a late lender owe just for the act of joining, regardless of how recently the pool launched? Three precedents stack:\n\n1. **PE Equalisation Capital** — distinct from equalisation interest in every standard LPA. Late LPs make a one-time catch-up payment covering their pro-rata share of (a) prior drawdowns, (b) organisational/setup expenses (typically capped at ~1% of fund size), and (c) any management fees accrued since inception. Set at the moment of entry based on pool state, not scaled by time since inception. Profitr's FIXED is the closed-form proxy: instead of accounting for each individual late LP's catch-up amount, the share-haircut captures their share of foundational deployment in one number.\n\n2. **UCITS swing pricing / SEC Rule 22c-1 anti-dilution levy.** Subscribing investor's NAV is \"swung\" by a fixed swing factor — typically 0.5–2% for liquid funds, capped around 2% for bond funds — to internalise the transaction and dilution costs imposed on standing investors. Discrete, set by the fund manager, applied per subscription, not time-scaled. Profitr's FIXED is structurally identical to a swing factor, just larger because it bundles the catch-up and dilution layers together.\n\n3. **NYC co-op working capital contribution.** Fixed entry fee (1–2 months maintenance) paid by every new buyer, layered on top of an age-graduated flip tax. The fixed component recognises that the building's reserves were funded by prior owners — a discrete acknowledgement of foundational work, not a time-scaled amount.\n\n**Why we need it (anti-gaming).** Without a fixed floor, the cap = RATE × t formula collapses to ~0% at t = 0⁺, meaning a sophisticated lender could deposit one day after pool launch and pay essentially nothing — despite missing the entire pre-deployment risk-bearing phase that anchor lenders absorbed. The FIXED is the anti-gaming guard rail: even the very-fastest follower pays a non-trivial premium in recognition of being a follower at all.\n\n**Calibration of FIXED = 8%.** The default sits at the canonical **PE preferred-return hurdle** — ILPA's industry-intelligence reports show 8% is the single most common pref rate across closed-end credit and PE funds. Using the same number as the fund's standard hurdle is the most internally-consistent choice: late entrants effectively pre-pay one full year of pref-equivalent up front, then continue to accrue the time-scaled component on top.\n\nIt's higher than a pure UCITS swing factor (≤2%) because it bundles two layers in one share-fraction haircut — the catch-up to existing deployment AND the per-subscription dilution premium — instead of splitting them across two on-chain mechanisms. Empirically, at 8% fixed + 18%/y variable, the EQ Premium produces anchor-lender APRs that closely match Upside Pro-rata's anchor APR in the dynamic-flow scenario, while preserving lender-size proportionality that Pro-rata partially loses.",
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
    ],
  },
};
