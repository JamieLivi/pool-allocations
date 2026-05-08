import { EXPLAINERS } from '../sim/explainers';
import type { ModelKey } from '../sim/types';
import { RichText } from './RichText';

type Props = {
  modelKey: ModelKey;
};

export function ModelExplainer({ modelKey }: Props) {
  const ex = EXPLAINERS[modelKey];
  return (
    <article
      className={`explainer-card model-${modelKey}${ex.wide ? ' explainer-card-wide' : ''}`}
    >
      <header>
        <span className="model-tag">{ex.name}</span>
        <p className="explainer-short">{ex.shortDescription}</p>
      </header>

      <section>
        <h4>How it works</h4>
        <RichText text={ex.whatItDoes} />
      </section>

      <section>
        <h4>Rationale</h4>
        <RichText text={ex.rationale} />
      </section>

      <section>
        <h4>What happens to borrowers</h4>
        <RichText text={ex.borrowerSide} />
      </section>

      <section>
        <h4>Fairness properties</h4>
        <ul className="fairness-list">
          {ex.fairnessProperties.map((p) => (
            <li key={p.label} className={`fairness-${p.pass}`}>
              <span className="fairness-icon" aria-hidden="true">
                {p.pass === true ? '✓' : p.pass === 'partial' ? '~' : '✗'}
              </span>
              <span>
                <strong>{p.label}</strong>
                {p.note ? <span className="fairness-note"> — {p.note}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {ex.references && ex.references.length > 0 ? (
        <section>
          <h4>References</h4>
          <ul className="references-list">
            {ex.references.map((r) => (
              <li key={r.href}>
                <a href={r.href} target="_blank" rel="noreferrer noopener">
                  {r.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
