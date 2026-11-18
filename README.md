# G-Money

A gaming gift card shop for Kenya (PlayStation, Xbox, Steam, Google Play, Apple, Netflix) paid with M-Pesa or card, plus skill tournaments for eFootball, EA SPORTS FC, chess (via Lichess) and our own games.

The planning documents (fair play, money model, competitor review) live in the project files under `plan/`.

## What's in this version

### Gift card shop (the home page)

- **Catalog** loaded from the supplier. New cards stay hidden until the admin puts them on sale. Prices are the supplier's dollar cost × the admin's dollar rate + 5% markup, rounded up to the next KES 10. Card buyers pay the card fee on top.
- **Checkout** with M-Pesa (STK push to the buyer's phone) or card (Paystack, with the bank's 3-D Secure check).
- **Delivery**: once payment is confirmed the card is bought from the supplier and the code is shown on the order page and kept in **My orders**. Codes are stored encrypted (`CODE_ENCRYPTION_KEY`).
- **Safety**:
  - A repeated payment callback can never buy the same card twice.
  - A supplier timeout is checked with the supplier before any retry.
  - Short payments, late payments and first card orders wait for the admin.
  - New accounts have a lower daily spending limit.
- **Shop admin** (`/admin/shop`): dollar rate, put cards on sale, approve held orders, recheck or refund problem orders, supplier balance, sales and rough profit.
- **Suppliers**: a built-in test supplier with fake codes, and Reloadly (needs a registered business) behind `SUPPLIER=reloadly`.
- **Test payments**: `PAYMENTS_MODE=simulated` replaces M-Pesa and card with "Pay (test)" buttons on test sites.

### Tournaments (`/tournaments`)

- **Sign-in** with a Kenyan phone number and a 6-digit SMS code (Africa's Talking). One account per number.
- **Profiles** with a username and game IDs (eFootball, EA FC, Lichess).
- **Bracket tournaments** for eFootball, EA FC and chess, with random seeding and byes.
  - eFootball / EA FC: a player reports the score with a screenshot, the opponent confirms or disputes within 30 minutes, and unanswered reports are accepted automatically.
  - Chess: players paste the Lichess game link and the result is read from Lichess, so there is nothing to dispute.
- **Speed puzzle leaderboards** (15-tile sliding puzzle). The server hands out the board and keeps the clock, replays every move to check the solution, and flags attempts faster than a person can play.
- **Admin dashboard**: create, start, finish and cancel tournaments; resolve disputes with the evidence side by side and each player's record; record M-Pesa prize payouts; suspend players.
- **Prize ledger**: a double-entry ledger records every prize owed and paid.
- **Gift card prizes**: a tournament can award a card per place. When it ends, prize orders wait in shop admin for the admin to send.
- **Paid entry is built but switched off** (`PAID_ENTRY_ENABLED`) until the legal review is done. Pilot tournaments are free to enter with sponsored prizes.

Not yet built: our own 10 staged games (chess, drafts, Bao, Connect Four, Snake, Block Stacker, 2048, Sudoku, more sliding puzzle sizes, 8-ball pool), automatic M-Pesa prize payouts, CoD Mobile / PUBG Mobile, native apps.

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Locally the sign-in code is shown on screen and the database is created in `.data/` automatically. Set `ADMIN_PHONES` in `.env.local` to your number to get the admin dashboard.

## Tests

```bash
npm test          # unit and flow tests on an in-memory database
npm run lint
npx tsc --noEmit
```

## Free test site (Vercel + Neon)

1. Merge this code into `main` (Vercel deploys `main`).
2. Sign up at https://vercel.com with your GitHub account (Hobby plan, free).
3. **Add New → Project**, import `G-Money`, and add these environment variables before deploying:
   - `SESSION_SECRET`: any 40+ random characters
   - `ADMIN_PHONES`: your phone number, e.g. `0712345678`
   - `OTP_DEV_MODE`: `true` (sign-in codes appear on screen, so no SMS account is needed)
   - `SITE_PASSWORD`: a password you'll share with testers (required while `OTP_DEV_MODE` is on, otherwise anyone could sign in as any number)
   - `CODE_ENCRYPTION_KEY`: 64 random hex characters (encrypts gift card codes)
   - `PAYMENTS_MODE`: `simulated` (pretend payments, no M-Pesa or card account needed)
4. In the project, open **Storage → Create Database → Neon** (free plan) and connect it to the project. This sets `DATABASE_URL`.
5. **Deployments → Redeploy**. Database tables are created automatically on first use.
6. Sign in with the admin number, open **Admin → Shop admin**, set the dollar rate, press **Load cards from supplier** and put some cards on sale.

For a real launch, turn `OTP_DEV_MODE` off, add the Africa's Talking SMS settings, remove `SITE_PASSWORD` and `PAYMENTS_MODE`, and add the Reloadly, M-Pesa and Paystack settings from `.env.example`.

After changing `src/db/schema.ts`, generate a migration with `npm run db:generate`.

## Stack

Next.js 16 (App Router, server actions), React 19, Tailwind CSS 4, Drizzle ORM on Postgres (PGlite locally), Vitest.
