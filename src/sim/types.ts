export type LenderEvent = {
  id: string;
  deposit: number;
  enterAt: number;
};

export type BorrowerEvent = {
  id: number;
  pledged: number;
  debt: number;
  borrowAt: number;
  repayAt: number;
};

export type SimEvent =
  | { type: 'deposit'; t: number; lenderId: string; amount: number }
  | { type: 'borrow'; t: number; borrowerId: number; pledged: number; debt: number }
  | { type: 'repay'; t: number; borrowerId: number };

export type SimParams = {
  loanTokenRate: number;
  poolRate: number;
  tenor: number;
  eqFixed: number;
  eqRate: number;
  upsideRrChunkSize: number;
};

export type ModelKey =
  | 'idealDefi'
  | 'vanillaNav'
  | 'upsideProRata'
  | 'upsideRoundRobin'
  | 'upsideWeightedRoundRobin'
  | 'eqPremium';

export type LenderResult = {
  id: string;
  deposit: number;
  enterAt: number;
  heldYears: number;
  apr: number;
  interestEarned: number;
};

export type BorrowerSummary = {
  totalBorrowers: number;
  filledBorrowers: number;
  partialBorrowers: number;
  skippedBorrowers: number;
  totalRebate: number;
  avgRebate: number;
  rebateAsPctOfDebt: number;
  hasRebateConcept: boolean;
};

export type ModelResult = {
  modelKey: ModelKey;
  modelName: string;
  lenders: LenderResult[];
  totalLenderInterest: number;
  rmsDeviationBps: number;
  borrower: BorrowerSummary;
  notes?: string;
};
