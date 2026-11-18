# HaveAsk — AI Church Care Network

A care & community tool that helps a church notice who needs practical help and coordinate support, so **no request quietly disappears**.

> **AI helps surface needs and suggestions. Humans make all care decisions.**
> AI never contacts members and never assigns volunteers. Every match is approved by a care coordinator.

## How sign-in and payments work

- **Sign-in is Privy only** (email or Google). New users are created automatically and pick *ask for help* or *volunteer* on a short welcome screen. Volunteer applications are approved by a coordinator under **People**.
- **Every user gets a self-custodial embedded wallet** on Base the first time they sign in. The server never holds a private key.
- **Payments are USDC on Base mainnet (real money).** There are three kinds:
  - **Financial help:** to the member who made the request.
  - **Reimbursement:** to a volunteer. The volunteer requests it from their assignment, and a coordinator approves it.
  - **Payment for service:** to a volunteer.
- **How a payment is sent:** the coordinator approves it and signs the transfer from their own Privy wallet. The payee's address always comes from the server, never from the browser. A payment is marked **Paid** only after the server verifies on-chain that the exact USDC amount went from the coordinator's wallet to the payee's.
- **Safety limits:**
  - each payment is capped (default 500 USDC, editable in Settings)
  - a transaction hash can't be reused
  - coordinators can't change their own role
  - only a pastor/admin can grant care-team roles
- **Privacy:** on-chain transfers are public. They show wallet addresses and amounts, not names or request details.

## Setup

Requires **Node.js 22.13+**.

1. **Create a Privy app** at [dashboard.privy.io](https://dashboard.privy.io):
   - Enable **Email** and **Google** login.
   - Under *Embedded wallets*, enable **Ethereum**.
   - Add your site's domain (for example your Railway URL) under *Allowed domains*.
   - Optional: enable **gas sponsorship** on Base, then set `HAVEASK_SPONSOR_GAS=true` so coordinators don't need ETH for fees.
2. Copy `.env.example` and fill in `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, and `HAVEASK_ADMIN_EMAILS` (your email, so you become Pastor/Admin on first sign-in).
3. Run it:
   ```bash
   npm install
   npm run build
   npm start          # http://localhost:3001
   ```

### Deploy on Railway

1. Create a new project from this GitHub repo. `railway.json` sets the build (`npm run build`) and start (`npm start`) commands, and `.node-version` pins Node.
2. Add the variables from `.env.example` in the service's **Variables** tab.
3. Add a **Volume** mounted at `/app/data` so the database survives redeploys.
4. Generate a domain, then add it to Privy's *Allowed domains*.
5. Sign in with the email you put in `HAVEASK_ADMIN_EMAILS`. You're the Pastor/Admin. Make your care coordinators *Care Coordinator* under **People**.
6. Fund the coordinator's wallet with USDC (and a little ETH for fees unless gas is sponsored): **Wallet → Add funds**, or send to the address shown.

### Demo mode

Set `HAVEASK_DEMO_DATA=true` to load the synthetic church data and the demo controls (fast-forward clock, reset). Real Privy accounts are kept on reset, and reset is blocked once any real payment exists. Synthetic people have no wallets, so they can't be paid.

For local development without Privy keys you can set `HAVEASK_DEV_LOGIN=true`, which lets you sign in by typing an email. It is ignored when `NODE_ENV=production` and must never be used on a live server.

### Optional: Claude for request analysis

Set `ANTHROPIC_API_KEY` and new requests are analyzed by Claude (`claude-opus-5-5` by default, override with `HAVEASK_MODEL`). Without it, a built-in rule-based analyzer is used.

## Walkthrough

1. **Member** signs in, chooses *Ask for help*, and submits a private request.
2. **Coordinator** sees it on the dashboard with the AI analysis and suggested volunteers, then approves a match.
3. **Volunteer** accepts and posts updates. If they spend money, they tap *Request reimbursement*.
4. **Coordinator** approves the reimbursement under **Payments**, or sends financial help from the request page (*Send payment*), and signs it in their wallet. It shows as **Paid** once confirmed on Base, and the recipient is notified.
5. If anything goes quiet, the **care monitor** raises an alert with a recommended next step.

## Features

- **Private help requests.** Covers type, description, urgency, contact method, follow-up availability and neighbourhood. Members see a calm status view with no internal notes, AI output or volunteer details beyond a first name.
- **AI categorization and matching.** Requests are categorized, key needs and urgency signals extracted, and urgency is never rated lower than the member chose. Volunteer matching is a deterministic, explainable score: skills 45%, capacity 20%, availability 20%, proximity 15%. Volunteers at capacity are excluded. A relevant community resource is also suggested.
- **Safeguarding.** Language suggesting risk is flagged for a pastor to respond personally. No volunteers are suggested for these requests, and the monitor doesn't nag to assign one.
- **Volunteer assignments.** Offer → accept/decline (with optional reason) → contacted / helping / needs more support / completed. Reassigning withdraws the earlier offer and thanks that volunteer. Volunteers edit their own skills, days, load limit and car.
- **Coordinator tools.** Filters (new, unresolved/aging, high urgency, assigned, unassigned, escalated, resolved), search, category filter and age/idle indicators. Coordinators can approve or dismiss AI suggestions, assign or reassign manually, add notes, log member contact, escalate to the pastor, resolve, close or reopen, and see a full activity timeline.
- **Unresolved request detection** (`server/monitor.js`). Runs every minute and after every change. The rules are:
  - high urgency with no volunteer
  - volunteer hasn't accepted or declined
  - no progress update since accepting
  - volunteer asked for more support
  - member hasn't been contacted
  - waiting too long for a volunteer
  - no activity at all
  - possible safeguarding concern

  Alerts carry a summary and recommended action, can be acknowledged, snoozed or dismissed, and clear automatically once the condition is resolved. Thresholds are editable in Settings.
- **Payments.** USDC on Base from the coordinator's wallet to a member or volunteer, verified on-chain, with a full ledger under *Payments* and a personal *Wallet* page for everyone.
- **Gentle reminders.** Volunteers get at most one reminder per assignment per cooldown window (default 3 days). Coordinators are notified when an alert is raised. Members get one optional check-in after resolution.

## Project layout

```
server/
  index.js      Express app, static hosting of dist/
  config.js     environment configuration (Privy, chain, demo mode)
  privy.js      Privy access-token verification + profile/wallet lookup
  chain.js      Base JSON-RPC: balances and USDC transfer verification
  payments.js   payments ledger and rules
  db.js         SQLite schema + settings (node:sqlite)
  auth.js       HttpOnly session cookie, role guards
  ai.js         Claude analyzer, rule-based fallback, explainable matching
  services.js   care actions (create, assign, respond, update, resolve)
  monitor.js    unresolved-request detection + reminders
  routes.js     REST API (member / volunteer / care)
  seed.js       synthetic demo data
  tests/        node:test suite (npm test)
web/src/        React app (Vite), plain CSS; wallet.jsx is the only file that talks to Privy
```

Data lives in `data/haveask.db` (gitignored). Delete it, or use *Reset demo data*, to start fresh.

## Notes

- Payments move real funds and cannot be reversed. Test with small amounts first, or set `HAVEASK_CHAIN=base-sepolia` to use testnet USDC.
- The public Base RPC is rate-limited. For production, set `BASE_RPC_URL` to a dedicated provider.
- Sessions are server-side HttpOnly cookies issued after verifying a Privy access token. Before handling real money at scale, add HTTPS-only cookies, CSRF protection, rate limiting and an audit export.
