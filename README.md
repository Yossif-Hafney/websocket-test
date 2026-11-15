# WebSocket Practice — Wallet Simulator

A minimal, working sandbox to practice the WebSocket patterns you'll need
in the real wallet frontend, before touching that codebase.

## Download and run

### Requirements

- Git
- Node.js 20.19+ or 22.12+ (npm is included)

### Get the project

Clone this repository from its GitHub page. Replace `OWNER` and `REPOSITORY`
with the values from the repository URL:

```bash
git clone https://github.com/OWNER/REPOSITORY.git
cd REPOSITORY
```

### Install and start

Open two terminals in the project folder. Install dependencies and start the
backend in the first terminal:

```bash
cd server
npm install
node server.js
# -> "WS practice server running on ws://localhost:8080"
```

In the second terminal, install the frontend dependencies and start the dev
server:

```bash
cd client
npm install
npm run dev
# -> open the localhost URL printed by Vite
```

Click Deposit / Withdraw / Stake. You'll see the status line change and
events stream into the log — each with a ~0.4–1.2s simulated delay,
same as a real chain confirmation would have.

## What to actually practice

1. **Kill the server** while the page is open (Ctrl+C in terminal 1).
   Watch the status badge go `closed` → `reconnecting`. Restart the
   server and watch it recover to `open` on its own — that's the
   exponential-backoff reconnect in `WebSocketClient.js`.
2. **Click Deposit right after killing the server.** The message gets
   queued (`outgoingQueue`) instead of failing, and fires the moment
   the reconnect succeeds. Open the browser console to see it happen.
3. **Open the app in two tabs.** Each tab is a separate client with its
   own balance on the server (in-memory, per-connection) — notice
   events from one tab don't leak into the other, because subscriptions
   are per-socket.
4. **Read `hooks/useWebSocket.js` before `App.jsx`.** `useChannel` is
   the piece you'll reuse most: subscribe on mount, auto-unsubscribe on
   unmount, one call per feature (deposit/withdraw/stake/logs).

## File map

```
server/
  server.js              fake wallet backend: channels, actions, heartbeat

client/src/
  lib/WebSocketClient.js  framework-agnostic connection manager
                          (reconnect, queueing, pub/sub) — this is the
                          class you'll port into the real project
  hooks/useWebSocket.js   React wrapper: useWebSocket() + useChannel()
  App.jsx                 demo wiring: status badge, actions, live log
```

Once this feels natural, ask for the real-project version — same
`WebSocketClient` core, plus a state-management layer (store per
domain: balances, deposits, withdrawals, stakes, logs) that the
channels write into instead of local `useState`.
