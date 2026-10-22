import express from 'express';
import cors from 'cors';
import { Store } from './store';
import { QuoteRequest } from './calc';

function validate(body: any, store: Store): { req?: QuoteRequest; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'Body must be a JSON object.' };
  const { lines, couponCodes = [], customerId = null, at } = body;
  if (!Array.isArray(lines) || lines.length === 0) return { error: 'lines must be a non-empty array.' };
  for (const l of lines) {
    if (!l || typeof l.serviceId !== 'string' || !store.cat.services.some(s => s.id === l.serviceId)) return { error: `Unknown serviceId: ${l?.serviceId}` };
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 20) return { error: 'quantity must be a whole number from 1 to 20.' };
  }
  if (!Array.isArray(couponCodes) || couponCodes.some((c: unknown) => typeof c !== 'string')) return { error: 'couponCodes must be an array of strings.' };
  if (customerId !== null && (typeof customerId !== 'string' || !store.cat.customers.some(c => c.id === customerId))) return { error: 'Unknown customerId.' };
  if (at !== undefined && (typeof at !== 'string' || isNaN(new Date(at).getTime()))) return { error: 'at must be an ISO 8601 date-time.' };
  return { req: { lines: lines.map((l: any) => ({ serviceId: l.serviceId, quantity: l.quantity })), couponCodes, customerId, at } };
}

export function createApp(store: Store) {
  const app = express();
  app.use(cors(), express.json());
  app.get('/api/services', (_q, r) => r.json(store.cat.services));
  app.get('/api/customers', (_q, r) => r.json(store.cat.customers.map(({ id, name }) => ({ id, name }))));
  app.post('/api/quote', (q, r) => {
    const v = validate(q.body, store);
    if (v.error) return void r.status(400).json({ error: v.error });
    r.json(store.quote(v.req!));
  });
  app.post('/api/orders', (q, r) => {
    const v = validate(q.body, store);
    if (v.error) return void r.status(400).json({ error: v.error });
    const qa = q.body.quotedApplied;
    if (qa !== undefined && (!Array.isArray(qa) || qa.some((c: unknown) => typeof c !== 'string'))) return void r.status(400).json({ error: 'quotedApplied must be an array of strings.' });
    const res = store.place(v.req!, qa);
    if (!res.ok) return void r.status(409).json({ error: 'Some codes from your last quote no longer apply.', removed: res.removed, quote: res.quote });
    r.status(201).json({ orderId: res.orderId, quote: res.quote });
  });
  return app;
}
