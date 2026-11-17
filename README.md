# HaveAsk — AI Church Care Network

A care & community tool that helps a church notice who needs practical help and coordinate support, so **no request quietly disappears**.

> **AI helps surface needs and suggestions. Humans make all care decisions.**
> AI never contacts members and never assigns volunteers. Every match is approved by a care coordinator.

## Quick start

Requires **Node.js 22.13+** (uses the built-in `node:sqlite`; no native build step).

```bash
npm install
npm run build      # build the web app into dist/
npm start          # http://localhost:3001  (seeds demo data on first run)
```

For development with hot reload: `npm run dev` (web on :5173, API on :3001).

### Demo accounts (password `demo1234`)

| Role | Email | Use it to |
|---|---|---|
| Care Coordinator | `care@haveask.demo` | Dashboard, AI matches, alerts. **Start here.** |
| Member | `member@haveask.demo` | Submit a private request, see its status |
| Volunteer | `volunteer@haveask.demo` (or `tom@`, `daniel@`, `ruth@` …) | Accept/decline, post updates |
| Pastor (admin) | `pastor@haveask.demo` | Receives escalations |

The sign-in page has one-click buttons for each. All people, places and organizations are synthetic.

### Optional: Claude for request analysis

Set `ANTHROPIC_API_KEY` before `npm start` and new requests are analyzed by Claude (`claude-opus-5-5` by default, override with `HAVEASK_MODEL`), using structured JSON output. Without a key, or if a call fails, a transparent built-in rule-based analyzer is used, so the demo always works offline. The UI labels which one produced each analysis.

## 5-minute demo script

1. **Coordinator dashboard** (`care@`). There are stat tiles (new, unresolved/aging, high urgency, unassigned, active), a red **Needs attention** panel of unresolved-request alerts, each with a recommended next step, and **AI suggestions to review**.
2. **Member asks for help** (`member@`, in a second browser window). Go to *Ask for help*, pick a type, describe the need, choose urgency and contact method, then *Send request privately*. A confirmation appears and the status page shows Received → In progress → Resolved.
3. **AI categorizes and suggests.** Back as the coordinator, open the new request (also in the bell notifications). The **AI analysis** panel shows categories, key needs, urgency signals and suggested urgency. **Suggested matches** shows 2–3 volunteers plus a community resource, each with a confidence score and the reasons (skills, availability, current load, distance).
4. **Human approval.** Click *Approve & send*. You can edit exactly what the volunteer will see (need-to-know only) before notifying them.
5. **Volunteer receives it** (`tom@` or whoever you chose; works well at phone width). Before accepting they see only the brief. After *Accept* they see the member's words and contact details. They can post updates such as *Contacted*, *Helping*, *Needs more support* or *Completed*.
6. **The system flags it.** As the coordinator, open *Settings & demo* and click *Fast-forward 3 days*. The monitor raises **"No progress update from volunteer"** (and **"Member hasn't heard from anyone"** if no contact was logged) with a recommendation like *Check in with Tom*. The volunteer gets one gentle reminder.
7. **Close the loop.** Log contact or have the volunteer post an update, and the alerts clear automatically. *Mark resolved*, and the member gets one optional "Was the help useful?" check-in.

*Reset demo data* in Settings restores everything.

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
- **Gentle reminders.** Volunteers get at most one reminder per assignment per cooldown window (default 3 days). Coordinators are notified when an alert is raised. Members get one optional check-in after resolution.

## Project layout

```
server/
  index.js      Express app, static hosting of dist/
  db.js         SQLite schema + settings (node:sqlite)
  auth.js       scrypt passwords, HttpOnly session cookie, role guards
  ai.js         Claude analyzer, rule-based fallback, explainable matching
  services.js   care actions (create, assign, respond, update, resolve)
  monitor.js    unresolved-request detection + reminders
  routes.js     REST API (member / volunteer / care)
  seed.js       synthetic demo data
  tests/        node:test suite (npm test)
web/src/        React app (Vite), plain CSS
```

Data lives in `data/haveask.db` (gitignored). Delete it, or use *Reset demo data*, to start fresh.

## Prototype notes

- Uses synthetic data only. Don't enter real personal information.
- Authentication is email/password with server-side sessions, which is fine for a demo. Production would need HTTPS, CSRF protection, rate limiting and audit logging.
- The demo clock (fast-forward) shifts "now" for the whole app and is meant for demos only.
