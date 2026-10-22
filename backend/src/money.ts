// All money is BigInt satang (1 THB = 100). No floats anywhere.
export const toSatang = (s: string): bigint => {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) throw new Error(`Bad money string: ${s}`);
  return BigInt(m[1]) * 100n + BigInt((m[2] ?? '').padEnd(2, '0') || '0');
};
export const fmt = (n: bigint): string => {
  const neg = n < 0n; const a = neg ? -n : n;
  return `${neg ? '-' : ''}${a / 100n}.${(a % 100n).toString().padStart(2, '0')}`;
};
export const thousands = (n: bigint): string => {
  const [i, f] = fmt(n).split('.');
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${f}`;
};
/** round half up of num/den for non-negative num, positive den */
export const divRound = (num: bigint, den: bigint): bigint => (2n * num + den) / (2n * den);
/** percent value may have decimals, e.g. "33.333": exact rational, no floats */
export const percentOf = (amount: bigint, pct: string): bigint => {
  const [i, f = ''] = pct.split('.');
  return divRound(amount * BigInt(i + f), 100n * 10n ** BigInt(f.length));
};
