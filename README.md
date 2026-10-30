# Shoal

An always-open, room-code-free multiplayer fish game. Swim through a large bounded sea, eat smaller fish to grow, avoid larger players, and respawn small if you get eaten. The visible ocean area is roughly twice its previous size. AI fish continuously replenish.

## Run locally

Requires Node.js 20 or newer.

```sh
npm start
```

Open http://localhost:3000. Each ocean holds up to 10 players; new players are automatically routed to the least-full ocean. The leaderboard is live and there is no match end.

## Deploy

This app uses a persistent WebSocket connection, so deploy as a Render web service, not a static site. The included render.yaml is a Render Blueprint. On the free plan, each process is a single small instance; the 10-player ocean cap is a cautious starting target and needs load testing before increasing.

## Controls

- Desktop: WASD / arrow keys, or point the mouse in the direction you want to swim.
- Touch: drag the joystick at the lower left.
- Eat fish clearly smaller than you. You can gulp other players only when you are substantially larger.
- Getting eaten resets your growth. You respawn after a short delay with temporary protection.

## Files

- server.js: authoritative movement, collision, fish spawning, matchmaking, and WebSocket updates.
- game.js: canvas rendering, controls, HUD, and reconnect handling.
- index.html / style.css: responsive interface.
- render.yaml: Render deployment Blueprint.
