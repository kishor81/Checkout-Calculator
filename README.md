# MedEx Coupon & Checkout Calculator

MedEx is a checkout calculator that applies coupon codes, validates discount rules, calculates VAT, and places orders. It also tracks coupon usage and customer order counts.

## 1. How to Run the Project

### Start the Backend

```bash
cd backend
npm install
npm run dev
```

Backend URL: http://localhost:3001

### Start the Frontend

Open a new terminal and run:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: http://localhost:5173

### Run Tests

```bash
cd backend
npm test
```

The tests cover examples from the data file, edge cases, API behavior, and concurrent orders.

## 2. Data and Storage

- Coupon and checkout rules are stored in `data/checkout.json`.
- Coupon usage, customer order counts, and placed orders are saved in `backend/data/state.json`.
- Data persists when the server restarts.
- Delete `backend/data/state.json` to reset the saved state.

## 3. How the Calculation Works

The calculation logic is implemented in `backend/src/calc.ts`.

1. **Calculate subtotal:** Multiply each service price by its quantity.
2. **Validate coupon codes:** Codes are trimmed and converted to uppercase. Duplicate codes are rejected, and a maximum of two different codes is allowed.
3. **Apply coupons:** Non-stackable coupons are evaluated first, followed by stackable coupons. Results are displayed in the original entry order.
4. **Check coupon rules:** Each coupon is checked against its eligibility rules. If a check fails, the first failure explains why the coupon cannot be applied.
5. **Calculate discounts:** Discounts apply to eligible items after previous discounts have been deducted. Percentage discounts respect their maximum limit, while fixed discounts cannot exceed the eligible amount.
6. **Split discounts:** Each discount is distributed across eligible items. Any rounding difference is assigned to the largest eligible item.
7. **Calculate VAT:** VAT is 7% of the amount remaining after discounts.

The system uses the Asia/Bangkok calendar date for coupon date checks. The coupon's `endsOn` date is inclusive.

## 4. Money Accuracy

- All monetary calculations use `BigInt` and integer satang to avoid floating-point errors.
- Amounts are parsed digit by digit rather than converted through JavaScript `Number`.
- Rounding uses the round-half-up method.
- Percentage values with decimals are handled as exact ratios.

This helps ensure accurate discounts, VAT, and final totals.

## 5. API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/services` | Get available services |
| GET | `/api/customers` | Get customers for the login picker |
| POST | `/api/quote` | Calculate the checkout total and applicable discounts |
| POST | `/api/orders` | Validate and place an order |

Invalid requests return a `400` status with an error message.

### Order Confirmation

The order endpoint supports an optional `quotedApplied` field containing the coupon codes applied in the customer's previous quote.

If any of those coupons no longer apply, the server returns `409 Conflict` with the removed coupons, their reasons, and an updated quote. The frontend displays the changes and allows the customer to confirm the new total before submitting again.

## 6. Concurrency and Order Safety

- Before placing an order, the server recalculates the quote and checks coupon usage limits.
- Coupon usage and order records are updated together in a synchronous operation.
- A concurrency test sends two orders for the `LASTONE` coupon at the same time. One succeeds with `201`, while the other receives `409` because the coupon limit has been reached.

**Limitation:** This approach is designed for a single Node.js server process. Multiple server processes would require database transactions or another shared locking mechanism.

## 7. Design Decisions

- Unknown customer IDs return `400 Bad Request`.
- The same service can appear on multiple order lines. The frontend merges duplicate services in the user interface.
- If `quotedApplied` is omitted, the order uses the coupons that apply at the time of submission.
- Blank coupon codes are ignored by the frontend. If sent directly to the API, they are reported as unrecognized.

## 8. AI Assistance

Claude (Anthropic) was used to help generate the code from the project requirements. The implementation should be reviewed and understood before presenting it in an interview.

## 9. Future Improvements

- Use SQLite or PostgreSQL with database transactions for multi-process safety.
- Add idempotency keys to prevent duplicate orders.
- Add frontend component tests and Playwright tests for the coupon confirmation flow.
- Debounce quote requests to reduce unnecessary API calls.
- Add property-based tests for discount distribution and non-negative totals.
- Support international currency formatting, including NPR and INR, and country-specific VAT.
- Consider migrating the backend to NestJS.
