import { fmtUsd } from '../format';
import type { LenderInput } from '../sim/scenarios';

type Props = {
  lenders: LenderInput[];
  onChange: (next: LenderInput[]) => void;
};

export function LenderEditor({ lenders, onChange }: Props) {
  const totalDeposit = lenders.reduce((s, l) => s + l.deposit, 0);

  const updateAt = (idx: number, patch: Partial<LenderInput>) => {
    onChange(lenders.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const removeAt = (idx: number) => {
    onChange(lenders.filter((_, i) => i !== idx));
  };

  const addLender = () => {
    // Sensible defaults for a new row: 5% slot, entered just after the
    // latest existing lender, auto-numbered label.
    const latest = lenders.reduce((max, l) => Math.max(max, l.enterAt), 0);
    const slot = Math.max(100_000, totalDeposit * 0.05);
    onChange([
      ...lenders,
      {
        id: `Lender-${lenders.length + 1}`,
        deposit: Math.round(slot),
        enterAt: latest + 1 / 12,
      },
    ]);
  };

  return (
    <div className="lender-editor">
      <div className="lender-editor-head">
        <span className="util-slider-label">Lenders</span>
        <span className="lender-editor-total">
          {lenders.length} lender{lenders.length === 1 ? '' : 's'} ·{' '}
          <strong>{fmtUsd(totalDeposit, { compact: true })}</strong> total
        </span>
      </div>

      <div className="lender-rows">
        <div className="lender-row lender-row-head">
          <span>Name</span>
          <span>Deposit (USD)</span>
          <span>Entered (months)</span>
          <span />
        </div>
        {lenders.map((lender, i) => {
          const sharePct = totalDeposit > 0 ? (lender.deposit / totalDeposit) * 100 : 0;
          return (
            <div key={`${i}-${lender.id}`} className="lender-row">
              <input
                type="text"
                className="lender-name-input"
                value={lender.id}
                onChange={(e) => updateAt(i, { id: e.target.value })}
                aria-label={`Lender ${i + 1} name`}
              />
              <div className="lender-deposit-cell">
                <input
                  type="number"
                  className="lender-deposit-input"
                  min={0}
                  step={50_000}
                  value={lender.deposit}
                  onChange={(e) => updateAt(i, { deposit: Math.max(0, Number(e.target.value)) })}
                  aria-label={`Lender ${i + 1} deposit`}
                />
                <span className="lender-share-pct">{sharePct.toFixed(1)}%</span>
              </div>
              <input
                type="number"
                className="lender-enter-input"
                min={0}
                max={60}
                step={0.5}
                value={Number((lender.enterAt * 12).toFixed(2))}
                onChange={(e) =>
                  updateAt(i, { enterAt: Math.max(0, Number(e.target.value) / 12) })
                }
                aria-label={`Lender ${i + 1} entry month`}
              />
              <button
                type="button"
                className="lender-remove"
                onClick={() => removeAt(i)}
                aria-label={`Remove ${lender.id}`}
                disabled={lenders.length <= 1}
                title={lenders.length <= 1 ? 'At least one lender required' : 'Remove'}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <button type="button" className="secondary lender-add" onClick={addLender}>
        + Add lender
      </button>
    </div>
  );
}
