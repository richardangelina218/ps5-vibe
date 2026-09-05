# ps5-vibe

Control DualSense (PS5) rumble from a web page. The **phone** stays connected to the controller over Bluetooth. A **second device** sends vibration commands through a peer-to-peer room code. No paid backend — static files on GitHub Pages, Vercel, or similar.

## How it works

1. Pair the DualSense in **Android Bluetooth settings** (hold the PS + Create buttons until the light bar flashes).
2. Open this site in **Android Chrome** (HTTPS required).
3. Choose **Host**, then press a button on the controller so Chrome notices the gamepad.
4. Copy the remote link / room code to a laptop or another phone and send rumble from there.

The host tab must stay open. That phone is the Bluetooth bridge.

## Limits (worth knowing)

- **Android Chrome** is the target. iOS Safari cannot talk to DualSense from a website.
- Rumble uses the [Gamepad Haptics](https://w3c.github.io/gamepad/#dom-gamepad-vibrationactuator) `dual-rumble` effect. That is the two classic motors, not DualSense’s full haptic/adaptive-trigger hardware (that needs WebHID, which Android Chrome does not expose).
- Remote signaling uses [PeerJS](https://peerjs.com/) (public broker + WebRTC). Fine for personal use; the free broker can be flaky. You can point `Peer` at your own PeerServer later if you want.
- Battery level is not available through the Gamepad API.

## Dev

```bash
npm install
npm run dev
```

Use the machine’s LAN URL (`http://192.168.x.x:5173`) on the phone. Some APIs want a secure context — if gamepad/rumble is blocked on HTTP, deploy to HTTPS (below) or use a tunnel.

## Deploy (free)

**Vercel**

```bash
npm i -g vercel
vercel
```

Or push to GitHub and import the repo in the Vercel dashboard. Build command: `npm run build`. Output: `dist`.

**GitHub Pages**

```bash
npm run build
```

Publish the `dist` folder (Actions or `gh-pages`). The Vite config uses `base: "./"` so relative paths work.

## Local test without a second phone

Open two browser tabs: Host in one, Remote in the other. On desktop Chrome, a USB DualSense also works as host.
