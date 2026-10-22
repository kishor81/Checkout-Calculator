# MedEx coupon & checkout calculator

## Run
```bash
# backend (http://localhost:3001)
cd backend && npm install && npm run dev
npm test                      # runs every data-file example + edge cases + API/concurrency tests
# frontend (http://localhost:5173, proxies /api to :3001)
cd frontend && npm install && npm run dev
```
Data: `data/checkout.json`. Coupon usage, customer order counts and placed orders persist to `backend/data/state.json` (survives restarts; delete it to reset).

## How the calculation works (`backend/src/calc.ts`)
1. Lines = price × quantity. Codes are trimmed and upper-cased; a repeat is rejected, and a 3rd distinct code is rejected ("up to 2 codes").
2. Accepted codes are evaluated non-stackable first, then stackable (stable, so entry order is kept inside each group). Results are reported in entry order.
3. Checks a→k run in the specified order; the first failure is the reason. "Today" is the Asia/Bangkok calendar date (`at` + 7h, ISO date), `endsOn` inclusive.
4. Eligible amount = scoped lines **after earlier discounts**. Percent: round(eligible × value / 100), then `maxDiscount` cap. Fixed: min(value, eligible).
5. The discount is split per line with round(discount × line / eligible); the rounding difference goes to the largest eligible line (first on ties).
6. net = subtotal − discounts, VAT = round(net × 7 / 100), total = net + VAT.

**Money safety:** all amounts are `BigInt` satang. Strings are parsed digit by digit, never through `Number`. "Round half up" is integer math: `floor((2n·num + den) / (2n·den))`. Percent values with decimals (`33.333`) become an exact ratio (33333 / 100000), so no float ever appears.

## API
`GET /api/services`, `GET /api/customers` (extra, for the login picker), `POST /api/quote`, `POST /api/orders`.
Validation errors → `400 {error}`.
`POST /api/orders` accepts one extra optional field, `quotedApplied: string[]`: the codes that applied in the customer's last quote. If any no longer apply, nothing is recorded and the server returns `409 {error, removed:[{code,reason}], quote}`. The frontend shows what changed and lets the customer confirm the new total (re-sends with the new applied list).

## Concurrency
`Store.place()` re-quotes, checks and updates counters in one synchronous block (no `await`), so on Node's single thread two requests cannot interleave. The test fires two simultaneous orders for `LASTONE`: one gets 201, the other 409. This is only safe for a single server process (see below).

## Decisions / assumptions
- Unknown `customerId` → 400. Same service on two lines is allowed and treated as separate lines (the UI merges them).
- `quotedApplied` omitted → order is placed with whatever applies now.
- Empty/blank code strings are ignored by the UI; if sent to the API they're reported as unrecognised.

## AI use
I (Claude) generated the code with the author's prompt. Review and be ready to explain each part before an interview.

## With more time
- Real DB (SQLite/Postgres) with a transaction and `UPDATE … WHERE usedCount < usageLimit` for multi-process safety; idempotency keys for orders.
- Frontend component tests and Playwright for the 409 flow; debounce quote requests.
- Property tests: per-line shares always sum to the discount; totals never negative.
- Money-formatting i18n for Nepal/India (INR/NPR) and per-country VAT.
- NestJS port.
