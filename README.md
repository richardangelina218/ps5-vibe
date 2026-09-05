# ps5-vibe

Control DualSense (PS5) rumble remotely with full admin controls. The **phone** stays connected to the controller over Bluetooth as a secure bridge. The **Admin** connects from any phone or desktop via a WebRTC session code with passcode protection. Zero paid backend — static files deployed for free on GitHub Pages, Vercel, or Netlify.

## How it works

1. Pair the DualSense in **Android Bluetooth settings** (hold the PS + Create buttons until the light bar flashes).
2. Open this site in **Android Chrome** (HTTPS required).
3. Tap **Host Bridge**, set a session ID and an **Admin Passcode**, then press any button on the controller.
4. Open the **Admin Panel** on your other device (or via the direct link), enter your passcode, and control all vibration parameters.

The host tab must stay open (Screen Wake Lock keeps the display and Bluetooth active).

## Features

- **Admin Login & Passcode Protection**: Only the person with the passcode can trigger vibrations. Guests are locked or read-only.
- **Customizable Session IDs**: Pick persistent room names (e.g. `room-101`) or generate random ones.
- **Live 2D XY Touch Surface**: Drag your thumb across the screen to dynamically blend weak (high-pitch) and strong (low-bass) rumble in real time on mobile.
- **Master Intensity Multiplier**: Scale total vibration power from 0.1x to 2.0x on the fly.
- **Dynamic Waveforms & Loops**: Preset loops for Heartbeat, Crescendo ramp, Sine wave, Butterfly flutter, Earthquake, and Machine Staccato.
- **Custom Step Sequencer**: Program custom pulse rhythms (`weak,strong,duration | ...`).
- **Emergency Panic Stop**: Always-accessible floating stop button.
- **Live Latency & Button Telemetry**: Live ping in milliseconds and real-time buttons held indicator.

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
