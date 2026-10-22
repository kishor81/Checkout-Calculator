import fs from 'fs';
import path from 'path';
import { Catalog, QuoteRequest, Quote, quote } from './calc';

export const DATA_PATH = process.env.DATA_PATH ?? path.resolve(__dirname, '../../data/checkout.json');

/** Catalog + usage counters. Persisted to a JSON file (atomic rename) after each order. */
export class Store {
  cat: Catalog; orders: unknown[] = [];
  constructor(private statePath: string | null = null) {
    const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    this.cat = { services: raw.services, customers: raw.customers, coupons: raw.coupons };
    if (statePath && fs.existsSync(statePath)) {
      const s = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      for (const c of this.cat.coupons) if (s.coupons?.[c.code]) Object.assign(c, s.coupons[c.code]);
      for (const c of this.cat.customers) if (s.customers?.[c.id] !== undefined) c.ordersCount = s.customers[c.id];
      this.orders = s.orders ?? [];
    }
  }
  private save() {
    if (!this.statePath) return;
    const s = {
      coupons: Object.fromEntries(this.cat.coupons.map(c => [c.code, { usedCount: c.usedCount, usedBy: c.usedBy }])),
      customers: Object.fromEntries(this.cat.customers.map(c => [c.id, c.ordersCount])),
      orders: this.orders,
    };
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath + '.tmp', JSON.stringify(s, null, 2));
    fs.renameSync(this.statePath + '.tmp', this.statePath);
  }
  quote(req: QuoteRequest) { return quote(this.cat, req); }

  /**
   * Re-quote, verify, then update counters. Fully synchronous (no await between the
   * check and the write), so on Node's single thread two orders can never interleave.
   */
  place(req: QuoteRequest, quotedApplied: string[] | undefined):
    { ok: true; quote: Quote; orderId: string } | { ok: false; removed: { code: string; reason: string }[]; quote: Quote } {
    const q = this.quote(req);
    const applied = new Set(q.coupons.filter(c => c.status === 'applied').map(c => c.code));
    const removed = (quotedApplied ?? []).filter(c => !applied.has(c.trim().toUpperCase())).map(code => {
      const r = q.coupons.find(c => c.code === code.trim().toUpperCase());
      return { code, reason: r && r.status === 'rejected' ? r.reason : 'This code is no longer valid.' };
    });
    if (removed.length) return { ok: false, removed, quote: q };
    for (const code of applied) {
      const c = this.cat.coupons.find(x => x.code === code)!;
      c.usedCount += 1;
      if (req.customerId) c.usedBy[req.customerId] = (c.usedBy[req.customerId] ?? 0) + 1;
    }
    if (req.customerId) this.cat.customers.find(c => c.id === req.customerId)!.ordersCount += 1;
    const orderId = `ORD-${this.orders.length + 1}`;
    this.orders.push({ orderId, customerId: req.customerId, placedAt: new Date().toISOString(), quote: q });
    this.save();
    return { ok: true, quote: q, orderId };
  }
}
