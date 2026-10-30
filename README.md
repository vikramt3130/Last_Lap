# Last Lap

A fast room-code party runner for 2–8 players. Runs in a browser on desktop and mobile; the Node server serves the game and relays live player positions over WebSockets.

## Run locally

Requires Node.js 20 or newer.

```sh
npm start
```

The server prints the URL it chose. If port 3000 is busy, it automatically tries 3001 through 3010. Open the printed URL in Chrome. To play across devices on the same network, open the computer's LAN address on each phone or laptop and allow inbound traffic on the printed port.

## Deploy publicly

This app needs a Node host that supports persistent WebSocket connections. It is not a static-site-only app.

The included `render.yaml` can be used as a Render Blueprint. Push this folder to a GitHub repository, then create a new Blueprint in Render from that repository. Render will build the Node service and provide a public HTTPS URL; rooms work across devices on that URL. For other hosts, set the start command to `npm start` and provide the assigned `PORT`.

## How to play

Create a room and share its six-character code or invite link. The host starts with at least two players. Run automatically, use left/right to change pace, jump over gaps, grapple to nearby glowing anchors, and slide under low gantries. The camera follows the front runner; falling behind the left screen edge or into a gap eliminates you. Last racer standing scores 5 points, second scores 3, third scores 2, and other finishers score 1. After three rounds, the highest total wins.

Keyboard: A/D or ←/→ move, Space jumps, W or ↑ grapples near an anchor, S or ↓ slides. Touch controls are shown on phones.

## Project files

- `server.js` — HTTP app server, room codes, WebSocket relay, round flow and scoring
- `index.html`, `style.css`, `game.js` — responsive game client
- `render.yaml` — Render deployment blueprint

