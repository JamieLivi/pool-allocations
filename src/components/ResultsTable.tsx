import type { ModelResult } from '../sim/types';
import { fmtBps, fmtMonths, fmtPct, fmtUsd } from '../format';

type Props = {
  idealApr: number;
  results: ModelResult[];
};

export function ResultsTable({ idealApr, results }: Props) {
  const ideal = results.find((r) => r.modelKey === 'idealDefi');
  if (!ideal) return null;

  // Std DeFi is the baseline — every lender earns the same APR (shown in
  // the header). Hide that column from the per-lender table to free up
  // horizontal space; deltas in the remaining columns are still measured
  // against this baseline.
  const comparisonModels = results.filter((r) => r.modelKey !== 'idealDefi');

  return (
    <div className="results-table-wrap">
      <div className="results-summary">
        <div>
          <span className="results-summary-label">Std DeFi baseline APR (uniform)</span>
          <strong>{fmtPct(idealApr)}</strong>
        </div>
        <div>
          <span className="results-summary-label">Total interest pool</span>
          <strong>{fmtUsd(ideal.totalLenderInterest)}</strong>
        </div>
      </div>
      <div className="results-table-scroll">
        <table className="results-table">
          <thead>
            <tr>
              <th rowSpan={2} className="lender-col">
                Lender
              </th>
              <th rowSpan={2}>Deposit</th>
              <th rowSpan={2}>
                Entered<br />
                <span className="th-unit">(months from start)</span>
              </th>
              {comparisonModels.map((r) => (
                <th key={r.modelKey} className={`model-col model-${r.modelKey}`}>
                  {r.modelName}
                </th>
              ))}
            </tr>
            <tr>
              {comparisonModels.map((r) => (
                <th key={`rms-${r.modelKey}`} className={`model-rms model-${r.modelKey}`}>
                  {`RMS Δ ${fmtBps(r.rmsDeviationBps)}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ideal.lenders.map((l, i) => (
              <tr key={l.id}>
                <td className="lender-col">{l.id}</td>
                <td>{fmtUsd(l.deposit, { compact: true })}</td>
                <td>{fmtMonths(l.enterAt)}</td>
                {comparisonModels.map((r) => {
                  const lenderRow = r.lenders[i];
                  if (!lenderRow) return <td key={r.modelKey}>—</td>;
                  const delta = lenderRow.apr - idealApr;
                  return (
                    <td key={r.modelKey} className={`model-cell model-${r.modelKey}`}>
                      <div className="apr-cell">
                        <strong>{fmtPct(lenderRow.apr)}</strong>
                        <span className={delta >= 0 ? 'delta-pos' : 'delta-neg'}>
                          {delta >= 0 ? '+' : ''}
                          {(delta * 10_000).toFixed(0)}bp
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="results-notes">
        {results
          .filter((r) => r.notes)
          .map((r) => (
            <div key={`note-${r.modelKey}`} className="result-note">
              <strong>{r.modelName}:</strong> {r.notes}
            </div>
          ))}
      </div>
    </div>
  );
}
