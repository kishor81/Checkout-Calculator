import { toSatang, fmt, thousands, divRound, percentOf } from './money';

export interface Service { id: string; title: string; type: string; providerId: number; providerName: string; price: string }
export interface Coupon {
  code: string; type: 'percent' | 'fixed'; value: string; maxDiscount: string | null; minSpend: string;
  scope: { kind: 'all' | 'type' | 'provider'; value?: string | number };
  startsOn: string; endsOn: string; usageLimit: number | null; usedCount: number;
  perCustomerLimit: number | null; usedBy: Record<string, number>; firstOrderOnly: boolean; stackable: boolean; status: string;
}
export interface Customer { id: string; name: string; ordersCount: number }
export interface Catalog { services: Service[]; customers: Customer[]; coupons: Coupon[] }
export interface QuoteRequest { lines: { serviceId: string; quantity: number }[]; couponCodes: string[]; customerId: string | null; at?: string }

/** Calendar date (YYYY-MM-DD) in Asia/Bangkok (UTC+7) */
export const bangkokDate = (d: Date): string => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

export function quote(cat: Catalog, req: QuoteRequest, now: Date = new Date()) {
  const today = bangkokDate(req.at ? new Date(req.at) : now);
  const customer = req.customerId ? cat.customers.find(c => c.id === req.customerId) ?? null : null;
  const lines = req.lines.map(l => {
    const s = cat.services.find(x => x.id === l.serviceId)!;
    const amount = toSatang(s.price) * BigInt(l.quantity);
    return { s, quantity: l.quantity, amount, cur: amount, discounts: {} as Record<string, bigint> };
  });
  type R = { code: string; status: 'applied'; discount: string } | { code: string; status: 'rejected'; reason: string };
  const results: (R | undefined)[] = [];
  const accepted: { idx: number; code: string; c?: Coupon }[] = [];
  const seen = new Set<string>();
  req.couponCodes.forEach((raw, idx) => {
    const code = raw.trim().toUpperCase();
    if (seen.has(code)) return void (results[idx] = { code, status: 'rejected', reason: 'This code is already applied.' });
    if (seen.size >= 2) return void (results[idx] = { code, status: 'rejected', reason: 'You can use up to 2 codes per order.' });
    seen.add(code);
    accepted.push({ idx, code, c: cat.coupons.find(c => c.code.toUpperCase() === code) });
  });
  // non-stackable first, then stackable; stable sort keeps entry order
  const order = [...accepted].sort((a, b) => Number(!!b.c && !b.c.stackable) - Number(!!a.c && !a.c.stackable));
  let nonStackApplied: string | null = null;

  for (const { idx, code, c } of order) {
    const reject = (reason: string) => { results[idx] = { code, status: 'rejected', reason }; };
    if (!c) { reject("We don't recognise this code."); continue; }
    if (c.status !== 'active') { reject('This code is no longer active.'); continue; }
    if (today < c.startsOn) { reject(`This code starts on ${c.startsOn}.`); continue; }
    if (today > c.endsOn) { reject(`This code expired on ${c.endsOn}.`); continue; }
    if (c.usageLimit !== null && c.usedCount >= c.usageLimit) { reject('This code has been fully used.'); continue; }
    if ((c.perCustomerLimit !== null || c.firstOrderOnly) && !customer) { reject('Log in to use this code.'); continue; }
    if (c.perCustomerLimit !== null && (c.usedBy[customer!.id] ?? 0) >= c.perCustomerLimit) { reject("You've already used this code."); continue; }
    if (c.firstOrderOnly && customer!.ordersCount > 0) { reject('This code is only for your first order.'); continue; }
    if (!c.stackable && nonStackApplied) { reject(`This code can't be combined with ${nonStackApplied}.`); continue; }
    const elig = lines.filter(l => c.scope.kind === 'all' || (c.scope.kind === 'type' && l.s.type === c.scope.value) || (c.scope.kind === 'provider' && l.s.providerId === c.scope.value));
    if (!elig.length) { reject('No items in your cart qualify for this code.'); continue; }
    const eligible = elig.reduce((a, l) => a + l.cur, 0n);
    const min = toSatang(c.minSpend);
    if (eligible < min) { reject(`Spend ฿${thousands(min - eligible)} more on eligible items to use this code.`); continue; }

    let d = c.type === 'percent' ? percentOf(eligible, c.value) : toSatang(c.value);
    if (c.type === 'percent' && c.maxDiscount !== null) { const m = toSatang(c.maxDiscount); if (d > m) d = m; }
    if (d > eligible) d = eligible;
    const shares = elig.map(l => (eligible === 0n ? 0n : divRound(d * l.cur, eligible)));
    const diff = d - shares.reduce((a, b) => a + b, 0n);
    let big = 0; elig.forEach((l, i) => { if (l.cur > elig[big].cur) big = i; }); // strict > => first on ties
    shares[big] += diff;
    elig.forEach((l, i) => { l.discounts[code] = shares[i]; l.cur -= shares[i]; });
    if (!c.stackable) nonStackApplied = code;
    results[idx] = { code, status: 'applied', discount: fmt(d) };
  }

  const subtotal = lines.reduce((a, l) => a + l.amount, 0n);
  const discountTotal = lines.reduce((a, l) => a + (l.amount - l.cur), 0n);
  const net = subtotal - discountTotal;
  const vat = divRound(net * 7n, 100n);
  return {
    lines: lines.map(l => ({
      serviceId: l.s.id, quantity: l.quantity, amount: fmt(l.amount),
      discounts: Object.fromEntries(Object.entries(l.discounts).map(([k, v]) => [k, fmt(v)])),
      amountAfterDiscounts: fmt(l.cur),
    })),
    coupons: results.filter((r): r is R => !!r),
    subtotal: fmt(subtotal), discountTotal: fmt(discountTotal), netAmount: fmt(net), vat: fmt(vat), total: fmt(net + vat),
  };
}
export type Quote = ReturnType<typeof quote>;
