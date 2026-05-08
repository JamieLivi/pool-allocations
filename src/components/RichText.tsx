import { Fragment } from 'react';

type Props = {
  text: string;
};

// Minimal renderer for the tiny markdown subset we author in
// src/sim/explainers.ts and src/sim/scenarios.ts:
//   - blank-line separated paragraphs
//   - lines starting with "• " grouped into <ul><li>
//   - **bold** runs
//   - [label](url) links (rendered with target="_blank")
export function RichText({ text }: Props) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        const isBulletList = lines.every((line) => line.startsWith('• '));
        if (isBulletList) {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks are stable per render
            <ul key={i} className="rt-list">
              {lines.map((line, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lines stable
                <li key={j}>{renderInline(line.slice(2))}</li>
              ))}
            </ul>
          );
        }
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: blocks stable
          <p key={i}>{renderInline(block)}</p>
        );
      })}
    </>
  );
}

// Tokenise on **bold** OR [label](url) — emit a flat list of nodes.
function renderInline(text: string) {
  const tokens = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return tokens.map((token, i) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: tokens stable
        <strong key={i}>{token.slice(2, -2)}</strong>
      );
    }
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          // biome-ignore lint/suspicious/noArrayIndexKey: tokens stable
          key={i}
          href={linkMatch[2]}
          target="_blank"
          rel="noreferrer noopener"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return <Fragment key={i}>{token}</Fragment>;
  });
}
