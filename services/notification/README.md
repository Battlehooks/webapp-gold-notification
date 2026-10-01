# Notification Service

The web app's alerting engine and clock. Node/TypeScript, because it's the one
always-on process that has to keep time and hold open work between requests.

- **Push alerts** — desktop/browser notifications via the standard Web Push protocol,
  delivered even while the web app's tab is closed (Chrome, Edge, Firefox; Safari/iOS
  once the app is added to the home screen). Each browser opts in from the web app's
  **Alerts** dialog and chooses what it wants:
  - **Take-profit / stop-loss** — a holding's P/L crosses +N% / −N%, measured at the
    *buyback* price (what you'd actually get selling) against your average cost.
    Checked every minute; fires once per crossing and re-arms after the P/L comes
    back 1 point inside the threshold, so a price hovering at the line doesn't buzz
    every minute.
  - **Signal changes** — an asset's BUY / SELL / WAIT rule signal flips (checked every
    5 minutes).
  - **Sudden moves** — BTC/ETH/SOL moves ±5% within an hour (checked every 5 minutes,
    60-minute cooldown).
- **Narration schedule** — has Insight write the AI analysis the dashboard shows:
  crypto every 4h, gold daily at 23:30 UTC, plus an extra crypto run on a sudden move.

It has no Telegram integration — the original bot (the root project) is a separate
app with its own users. Owns `push_devices` (one row per browser with alerts on: its
push subscription, holdings, rules and which alerts have fired) and `alert_state`
(sudden-move cooldown, last signal per source).

## Run standalone

```bash
npm install
npx web-push generate-vapid-keys   # once; put both keys in services/.env
npm run dev
```

Requires Market Data and Insight running and reachable at `MARKET_DATA_URL` /
`INSIGHT_URL`. Without `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, push alerts are off
(the `/push` routes answer 503) but the narration schedule still runs. Browsers only
allow push on HTTPS pages or `localhost`.

## REST API (for the frontend)

A browser is identified by a random UUID it generates and keeps; knowing it is what
lets that browser update or delete its own alerts.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness, plus whether push is configured |
| GET | `/push/public-key` | VAPID public key the browser subscribes with |
| PUT | `/push/devices/:id` `{subscription, holdings, rules}` | Turn alerts on / update them. Alert memory is kept if holdings and rules are unchanged, reset if either changed |
| DELETE | `/push/devices/:id` | Turn alerts off and delete the stored holdings |
| POST | `/push/devices/:id/test` | Send a test notification |

Subscription endpoints must be a real browser push service (FCM, Mozilla, WNS,
Apple) — the server POSTs to whatever endpoint is stored, so arbitrary URLs aren't
accepted. Subscriptions the push service reports as gone (404/410) are deleted.
