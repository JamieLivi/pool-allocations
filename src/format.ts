export function fmtUsd(n: number, opts?: { compact?: boolean }): string {
  if (opts?.compact && Math.abs(n) >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(2)}M`;
  }
  if (opts?.compact && Math.abs(n) >= 1_000) {
    return `$${(n / 1_000).toFixed(0)}K`;
  }
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function fmtPct(n: number, decimals = 2): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

export function fmtMonths(years: number): string {
  return `${(years * 12).toFixed(1)}m`;
}

export function fmtBps(bps: number): string {
  return `${bps.toFixed(0)}bp`;
}
