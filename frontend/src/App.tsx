import { useEffect, useMemo, useState } from 'react';

type Service = { id: string; title: string; providerName: string; price: string };
type Customer = { id: string; name: string };
type CouponRes = { code: string; status: 'applied'; discount: string } | { code: string; status: 'rejected'; reason: string };
type QLine = { serviceId: string; quantity: number; amount: string; discounts: Record<string, string>; amountAfterDiscounts: string };
type Quote = { lines: QLine[]; coupons: CouponRes[]; subtotal: string; discountTotal: string; netAmount: string; vat: string; total: string };
type Conflict = { removed: { code: string; reason: string }[]; quote: Quote };

const baht = (s: string) => {
  const [i, f] = s.split('.');
  return `฿${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${f}`;
};
const applied = (q: Quote | null) => (q?.coupons ?? []).filter(c => c.status === 'applied').map(c => c.code);

async function api<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<{ status: number; data: any }> {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal } : { signal });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

export default function App() {
  const [services, setServices] = useState<Service[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadErr, setLoadErr] = useState('');
  const [cart, setCart] = useState<{ serviceId: string; quantity: number }[]>([]);
  const [codes, setCodes] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [err, setErr] = useState('');
  const [placing, setPlacing] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [done, setDone] = useState<{ id: string; total: string } | null>(null);

  const load = () => {
    setLoadErr('');
    Promise.all([api('/api/services'), api('/api/customers')])
      .then(([s, c]) => { setServices(s.data); setCustomers(c.data); })
      .catch(() => setLoadErr('Could not load services. Check that the API is running.'));
  };
  useEffect(load, []);

  const req = useMemo(() => ({ lines: cart, couponCodes: codes, customerId }), [cart, codes, customerId]);
  useEffect(() => {
    if (!cart.length) { setQuote(null); setErr(''); return; }
    const ac = new AbortController();
    setQuoting(true); setErr('');
    api('/api/quote', req, ac.signal)
      .then(r => { if (r.status === 200) setQuote(r.data); else setErr(r.data.error ?? 'Could not calculate your total.'); })
      .catch(e => { if (e.name !== 'AbortError') setErr('Could not reach the server. Try again.'); })
      .finally(() => { if (!ac.signal.aborted) setQuoting(false); });
    return () => ac.abort();
  }, [req]);

  const title = (id: string) => services.find(s => s.id === id)?.title ?? id;
  const add = (id: string) => { setDone(null); setConflict(null); setCart(c => c.some(l => l.serviceId === id) ? c.map(l => l.serviceId === id ? { ...l, quantity: Math.min(20, l.quantity + 1) } : l) : [...c, { serviceId: id, quantity: 1 }]); };
  const setQty = (id: string, q: number) => setCart(c => c.map(l => l.serviceId === id ? { ...l, quantity: Math.max(1, Math.min(20, q || 1)) } : l));
  const addCode = () => { const v = input.trim(); if (v) { setCodes(c => [...c, v]); setInput(''); setConflict(null); } };

  const place = async (quotedApplied: string[]) => {
    setPlacing(true); setErr('');
    try {
      const r = await api('/api/orders', { ...req, quotedApplied });
      if (r.status === 201) { setDone({ id: r.data.orderId, total: r.data.quote.total }); setCart([]); setCodes([]); setQuote(null); setConflict(null); }
      else if (r.status === 409) { setQuote(r.data.quote); setConflict({ removed: r.data.removed, quote: r.data.quote }); }
      else setErr(r.data.error ?? 'Could not place the order.');
    } catch { setErr('Could not reach the server. Try again.'); }
    setPlacing(false);
  };

  return (
    <main>
      <header><h1>MedEx checkout</h1>
        <label>Ordering as <select value={customerId ?? ''} onChange={e => setCustomerId(e.target.value || null)}>
          <option value="">Guest (not logged in)</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      </header>

      {done && <div className="ok" role="status">Order {done.id} placed. Total paid: {baht(done.total)}.</div>}
      {loadErr && <div className="bad" role="alert">{loadErr} <button onClick={load}>Retry</button></div>}

      <div className="grid">
        <section>
          <h2>Services</h2>
          {!services.length && !loadErr && <p className="muted">Loading services…</p>}
          <ul className="list">{services.map(s => (
            <li key={s.id}><div><strong>{s.title}</strong><span className="muted">{s.providerName}</span></div>
              <span className="price">{baht(s.price)}</span><button onClick={() => add(s.id)} aria-label={`Add ${s.title}`}>Add</button></li>))}</ul>
        </section>

        <section>
          <h2>Your cart</h2>
          {!cart.length && <p className="muted">Add a service to see your total.</p>}
          {cart.map(l => {
            const ql = quote?.lines.find(x => x.serviceId === l.serviceId);
            return (<div className="line" key={l.serviceId}>
              <div className="row"><strong>{title(l.serviceId)}</strong>
                <span className="qty"><button aria-label="Decrease" onClick={() => setQty(l.serviceId, l.quantity - 1)}>−</button>
                  <input type="number" min={1} max={20} value={l.quantity} aria-label="Quantity" onChange={e => setQty(l.serviceId, parseInt(e.target.value))} />
                  <button aria-label="Increase" onClick={() => setQty(l.serviceId, l.quantity + 1)}>+</button></span>
                <button className="link" onClick={() => setCart(c => c.filter(x => x.serviceId !== l.serviceId))}>Remove</button></div>
              {ql && <dl>
                <div><dt>Amount</dt><dd>{baht(ql.amount)}</dd></div>
                {Object.entries(ql.discounts).map(([k, v]) => <div key={k} className="disc"><dt>{k}</dt><dd>−{baht(v)}</dd></div>)}
                <div className="strong"><dt>After discounts</dt><dd>{baht(ql.amountAfterDiscounts)}</dd></div></dl>}
            </div>);
          })}

          <h3>Coupon codes</h3>
          <div className="row"><input value={input} placeholder="Enter a code" aria-label="Coupon code" onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCode()} />
            <button onClick={addCode}>Apply</button></div>
          <ul className="chips">{codes.map((c, i) => { const r = quote?.coupons[i]; return (
            <li key={i} className={r?.status === 'rejected' ? 'rej' : ''}>
              <span className="chip">{c.trim().toUpperCase()}
                <button aria-label={`Remove ${c}`} onClick={() => setCodes(x => x.filter((_, j) => j !== i))}>×</button></span>
              {r?.status === 'applied' && <span className="okt">Applied: −{baht(r.discount)}</span>}
              {r?.status === 'rejected' && <span className="rt">{r.reason}</span>}
            </li>); })}</ul>

          {err && <div className="bad" role="alert">{err}</div>}
          {quote && <div className={`totals ${quoting ? 'busy' : ''}`} aria-busy={quoting}>
            <div><span>Subtotal</span><span>{baht(quote.subtotal)}</span></div>
            <div><span>Discounts</span><span>−{baht(quote.discountTotal)}</span></div>
            <div><span>VAT (7%)</span><span>{baht(quote.vat)}</span></div>
            <div className="grand"><span>Total</span><span>{baht(quote.total)}</span></div>
            {quoting && <p className="muted">Updating…</p>}
          </div>}

          {conflict && <div className="warn" role="alert">
            <strong>Your discounts changed.</strong>
            <ul>{conflict.removed.map(r => <li key={r.code}>{r.code.toUpperCase()} is no longer available: {r.reason}</li>)}</ul>
            <p>Your total is now {baht(conflict.quote.total)}.</p>
            <button className="primary" disabled={placing} onClick={() => place(applied(conflict.quote))}>Confirm {baht(conflict.quote.total)} and place order</button>
          </div>}
          {!conflict && <button className="primary" disabled={!quote || quoting || placing} onClick={() => place(applied(quote))}>{placing ? 'Placing order…' : 'Place order'}</button>}
        </section>
      </div>
    </main>
  );
}
