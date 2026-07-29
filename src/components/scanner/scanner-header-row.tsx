export function ScannerHeaderRow() {
  return (
    <div className="grid grid-cols-[1fr_repeat(6,auto)] items-center gap-4 border-b border-border bg-surface-hover/50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">
      <div>Market</div>
      <div>Recommendation</div>
      <div className="w-16 text-right">Score</div>
      <div className="w-28 text-right">Market → Fair</div>
      <div className="w-16 text-right">Conf.</div>
      <div>Risk</div>
      <div className="w-20 text-right">Liquidity</div>
    </div>
  );
}
