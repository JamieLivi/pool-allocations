import { fmtPct, fmtUsd } from '../format';
import type { ModelResult } from '../sim/types';

type Props = {
  results: ModelResult[];
};

export function BorrowerPanel({ results }: Props) {
  return (
    <div className="borrower-panel">
      <p className="panel-intro">
        Borrowers in Profitr-style vaults receive a coupon-residual rebate:
        the IP pays a fixed coupon (loan-token rate) on their pledged
        collateral, lenders draw a lower rate on debt, and the surplus rebates
        to the borrower. The rebate math is identical across NAV, EQ Premium,
        and Pro-rata models — they only differ in how lenders share the
        lender-side draw. Std DeFi pools have no per-borrower coupon concept.
        Upside RR can skip or partially fill borrows when chunked allocation
        runs out of headroom — those borrowers walk away with less.
      </p>

      <div className="borrower-grid">
        {results.map((r) => {
          const b = r.borrower;
          return (
            <div key={r.modelKey} className={`borrower-card model-${r.modelKey}`}>
              <header>
                <span className="model-tag">{r.modelName}</span>
              </header>
              <div className="borrower-stats">
                <Stat
                  label="Borrowers filled"
                  value={`${b.filledBorrowers + b.partialBorrowers} / ${b.totalBorrowers}`}
                  muted={!b.hasRebateConcept}
                />
                {b.partialBorrowers > 0 ? (
                  <Stat
                    label="Partial fills"
                    value={String(b.partialBorrowers)}
                    accent="warn"
                  />
                ) : null}
                {b.skippedBorrowers > 0 ? (
                  <Stat
                    label="Skipped"
                    value={String(b.skippedBorrowers)}
                    accent="warn"
                  />
                ) : null}
                {b.hasRebateConcept ? (
                  <>
                    <Stat
                      label="Total rebate"
                      value={fmtUsd(b.totalRebate, { compact: true })}
                      accent="strong"
                    />
                    <Stat
                      label="Avg per borrower"
                      value={fmtUsd(b.avgRebate)}
                    />
                    <Stat
                      label="% of debt"
                      value={fmtPct(b.rebateAsPctOfDebt)}
                    />
                  </>
                ) : (
                  <Stat
                    label="Rebate model"
                    value="N/A — pure pool draw"
                    muted
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: 'strong' | 'warn';
  muted?: boolean;
}) {
  return (
    <div className={`borrower-stat${muted ? ' muted' : ''}${accent ? ` accent-${accent}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
