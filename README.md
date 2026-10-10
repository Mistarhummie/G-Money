# G-Money

Skill-based gaming tournaments for Kenyan gamers: eFootball, EA SPORTS FC, chess (via Lichess) and our own speed puzzle.

The planning documents (fair play, money model, competitor review) live in the project files under `plan/`.

## What's in this version

- **Sign-in** with a Kenyan phone number and a 6-digit SMS code (Africa's Talking). One account per number.
- **Profiles** with a username and game IDs (eFootball, EA FC, Lichess).
- **Bracket tournaments** for eFootball, EA FC and chess, with random seeding and byes.
  - eFootball / EA FC: a player reports the score with a screenshot, the opponent confirms or disputes within 30 minutes, and unanswered reports are accepted automatically.
  - Chess: players paste the Lichess game link and the result is read from Lichess, so there is nothing to dispute.
- **Speed puzzle leaderboards** (15-tile sliding puzzle). The server hands out the board and keeps the clock, replays every move to check the solution, and flags attempts faster than a person can play.
- **Admin dashboard**: create, start, finish and cancel tournaments; resolve disputes with the evidence side by side and each player's record; record M-Pesa prize payouts; suspend players.
- **Prize ledger**: a double-entry ledger records every prize owed and paid.
- **Paid entry is built but switched off** (`PAID_ENTRY_ENABLED`) until the legal review is done. Pilot tournaments are free to enter with sponsored prizes.

Not yet built: automatic M-Pesa deposits and payouts (Daraja), 8-ball pool, CoD Mobile / PUBG Mobile, native apps.

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
4. In the project, open **Storage → Create Database → Neon** (free plan) and connect it to the project. This sets `DATABASE_URL`.
5. **Deployments → Redeploy**. Database tables are created automatically on first use.

For a real launch, turn `OTP_DEV_MODE` off, add the Africa's Talking SMS settings and remove `SITE_PASSWORD`.

After changing `src/db/schema.ts`, generate a migration with `npm run db:generate`.

## Stack

Next.js 16 (App Router, server actions), React 19, Tailwind CSS 4, Drizzle ORM on Postgres (PGlite locally), Vitest.
