import { describe, it, expect } from 'vitest';
import fs from 'fs';
import request from 'supertest';
import { Store, DATA_PATH } from '../src/store';
import { createApp } from '../src/app';

const examples = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')).examples;
const AT = '2026-11-02T10:00:00+07:00';
const L = [{ serviceId: 'S1', quantity: 1 }];

describe('data-file examples', () => {
  examples.forEach((ex: any, i: number) =>
    it(`example ${i + 1}`, () => expect(new Store().quote(ex.request)).toEqual(ex.expected)));
});

describe('edge cases', () => {
  const rej = (codes: string[], customerId: string | null = 'C1', at = AT, lines = L) =>
    new Store().quote({ lines, couponCodes: codes, customerId, at }).coupons;
  it('duplicate + 2-code limit', () => {
    const c = rej(['river200', ' RIVER200', 'SPA50', 'THIRD']);
    expect(c[1]).toMatchObject({ reason: 'This code is already applied.' });
    expect(c[3]).toMatchObject({ reason: 'You can use up to 2 codes per order.' });
  });
  it('rejections', () => {
    expect(rej(['NOPE'])[0]).toMatchObject({ reason: "We don't recognise this code." });
    expect(rej(['OLDCODE'])[0]).toMatchObject({ reason: 'This code is no longer active.' });
    expect(rej(['NEWYEAR'])[0]).toMatchObject({ reason: 'This code starts on 2027-01-01.' });
    expect(rej(['LIMITED'])[0]).toMatchObject({ reason: 'This code has been fully used.' });
    expect(rej(['WELCOME10'], null)[0]).toMatchObject({ reason: 'Log in to use this code.' });
    expect(rej(['ONCE'], 'C2')[0]).toMatchObject({ reason: "You've already used this code." });
    expect(rej(['WELCOME10'], 'C2')[0]).toMatchObject({ reason: 'This code is only for your first order.' });
    expect(rej(['SPA50'])[0]).toMatchObject({ reason: 'No items in your cart qualify for this code.' });
    expect(rej(['LAB15'])[0]).toMatchObject({ reason: 'Spend ฿300.00 more on eligible items to use this code.' });
  });
  it('non-stackable conflict, non-stackables evaluated first', () => {
    const q = new Store().quote({ lines: [{ serviceId: 'S1', quantity: 2 }], couponCodes: ['RIVER200', 'LAB15'], customerId: 'C1', at: AT });
    expect(q.coupons.map(c => c.status)).toEqual(['applied', 'applied']);
    expect(q.lines[0].discounts).toEqual({ LAB15: '360.00', RIVER200: '200.00' }); // LAB15 ran first
    const r = new Store().quote({ lines: [{ serviceId: 'S1', quantity: 2 }], couponCodes: ['WELCOME10', 'LAB15'], customerId: 'C1', at: AT });
    expect(r.coupons[1]).toMatchObject({ reason: "This code can't be combined with WELCOME10." });
  });
  it('Bangkok date boundary (endsOn inclusive)', () => {
    expect(rej(['FLASH25'], null, '2026-10-07T23:59:00+07:00')[0].status).toBe('applied');
    expect(rej(['FLASH25'], null, '2026-10-07T17:30:00Z')[0]).toMatchObject({ reason: 'This code expired on 2026-10-07.' });
  });
  it('THIRD uses exact decimal percent', () => {
    expect(new Store().quote({ lines: [{ serviceId: 'S4', quantity: 1 }], couponCodes: ['THIRD'], customerId: null, at: AT }).discountTotal).toBe('111.11');
  });
  it('fixed discount capped at eligible amount', () => {
    expect(new Store().quote({ lines: [{ serviceId: 'S6', quantity: 1 }], couponCodes: ['BIGFIX'], customerId: null, at: AT }).total).toBe('0.00');
  });
});

describe('API', () => {
  const body = (o = {}) => ({ lines: L, couponCodes: ['LASTONE'], customerId: 'C1', at: AT, ...o });
  it('validates input', async () => {
    const app = createApp(new Store());
    expect((await request(app).post('/api/quote').send(body({ lines: [{ serviceId: 'X', quantity: 1 }] }))).status).toBe(400);
    expect((await request(app).post('/api/quote').send(body({ lines: [{ serviceId: 'S1', quantity: 21 }] }))).status).toBe(400);
    expect((await request(app).post('/api/quote').send(body({ lines: [{ serviceId: 'S1', quantity: 1.5 }] }))).status).toBe(400);
  });
  it('LASTONE: only one of two simultaneous orders gets it', async () => {
    const app = createApp(new Store());
    const rs = await Promise.all(['C1', 'C3'].map(id => request(app).post('/api/orders').send(body({ customerId: id, quotedApplied: ['LASTONE'] }))));
    expect(rs.map(r => r.status).sort()).toEqual([201, 409]);
    expect(rs.find(r => r.status === 409)!.body.quote.coupons[0].reason).toBe('This code has been fully used.');
  });
  it('order bumps firstOrderOnly', async () => {
    const app = createApp(new Store());
    expect((await request(app).post('/api/orders').send(body({ couponCodes: ['WELCOME10'] }))).status).toBe(201);
    const q = await request(app).post('/api/quote').send(body({ couponCodes: ['WELCOME10'] }));
    expect(q.body.coupons[0].status).toBe('rejected');
  });
});
