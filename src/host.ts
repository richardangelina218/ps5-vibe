import Peer, { DataConnection } from "peerjs";
import { emptyPad, playRumble, readPad, stopRumble, type PadSnapshot } from "./gamepad";
import { parseMsg, type WireMsg } from "./protocol";
import { capabilities, keepAwake, peerIdFor, randomCode } from "./util";

const CODE_KEY = "ps5-vibe-host-code";

function pill(ok: boolean | null, label: string, detail: string) {
  const cls = ok === true ? "ok" : ok === false ? "bad" : "warn";
  return `<span class="pill"><span class="dot ${cls}"></span>${label}: ${detail}</span>`;
}

export function renderHost(root: HTMLElement) {
  let code = sessionStorage.getItem(CODE_KEY) ?? randomCode();
  sessionStorage.setItem(CODE_KEY, code);

  const remotes = new Set<DataConnection>();
  let pad: PadSnapshot = emptyPad();
  let lastRumble = "none";
  let peerState = "starting";
  let awake = false;
  const logs: string[] = [];

  root.innerHTML = `
    <div class="top">
      <div>
        <div class="brand">ps5-vibe · host</div>
        <h1>Phone + DualSense</h1>
        <p class="sub">Pair the controller in Android Bluetooth settings, open this page in Chrome, then press any button.</p>
      </div>
      <button class="ghost" id="home">Home</button>
    </div>
    <section class="panel">
      <h2>Status</h2>
      <div class="row" id="caps"></div>
      <div class="grid" style="margin-top:12px" id="stats"></div>
    </section>
    <section class="panel">
      <h2>Controller</h2>
      <div class="buttons" id="btns"></div>
      <p class="hint" id="pad-hint"></p>
      <div class="row" style="margin-top:12px">
        <button id="buzz">Test rumble</button>
        <button class="secondary" id="stop">Stop</button>
      </div>
    </section>
    <section class="panel">
      <h2>Remote access</h2>
      <div class="code" id="code"></div>
      <p class="hint">Share this code or the link. Keep this tab open — the phone is the Bluetooth bridge.</p>
      <div class="stack" style="margin-top:12px">
        <button class="secondary" id="copy">Copy remote link</button>
        <button class="ghost" id="newcode">New code</button>
      </div>
    </section>
    <section class="panel">
      <h2>Log</h2>
      <div class="log" id="log"></div>
    </section>
  `;

  const logEl = root.querySelector("#log")!;
  const capsEl = root.querySelector("#caps")!;
  const statsEl = root.querySelector("#stats")!;
  const btnsEl = root.querySelector("#btns")!;
  const padHint = root.querySelector("#pad-hint")!;
  const codeEl = root.querySelector("#code")!;

  const log = (text: string) => {
    const line = `${new Date().toLocaleTimeString()}  ${text}`;
    logs.unshift(line);
    logEl.textContent = logs.slice(0, 40).join("\n");
  };

  const remoteLink = () => {
    const url = new URL(location.href);
    url.hash = `#/remote/${code}`;
    return url.toString();
  };

  const paint = () => {
    const caps = capabilities();
    capsEl.innerHTML = [
      pill(caps.secure, "HTTPS", caps.secure ? "ok" : "required"),
      pill(caps.gamepadApi, "Gamepad", caps.gamepadApi ? "ok" : "missing"),
      pill(caps.peerApi, "WebRTC", caps.peerApi ? "ok" : "missing"),
      pill(pad.connected, "Controller", pad.connected ? "connected" : "waiting"),
      pill(pad.hasVibration, "Rumble", pad.hasVibration ? pad.hapticType : "unavailable"),
      pill(peerState === "open", "Room", peerState),
      pill(awake, "Wake lock", awake ? "screen on" : "off"),
      pill(remotes.size > 0, "Remotes", String(remotes.size)),
    ].join("");

    statsEl.innerHTML = `
      <div class="stat"><div class="k">Pad id</div><div class="v">${pad.id}</div></div>
      <div class="stat"><div class="k">Mapping / buttons</div><div class="v">${pad.mapping} · ${pad.buttons} btn · ${pad.axes} axes</div></div>
      <div class="stat"><div class="k">Last rumble</div><div class="v">${lastRumble}</div></div>
      <div class="stat"><div class="k">Pressed</div><div class="v">${pad.pressed.join(" ") || "—"}</div></div>
    `;

    const names = ["×", "○", "□", "△", "L1", "R1", "L2", "R2", "Create", "Opt", "L3", "R3", "↑", "↓", "←", "→", "PS", "Pad"];
    btnsEl.innerHTML = names
      .map((n, i) => {
        const label = ["Cross", "Circle", "Square", "Triangle", "L1", "R1", "L2", "R2", "Create", "Options", "L3", "R3", "Up", "Down", "Left", "Right", "PS", "Touch"][i];
        const on = pad.pressed.includes(label);
        return `<span class="btn-chip ${on ? "on" : ""}">${n}</span>`;
      })
      .join("");

    padHint.textContent = pad.connected
      ? "Controller is live. Remote devices can rumble it while this tab stays open."
      : "Waiting for a gamepad event — press Cross on the DualSense.";
    codeEl.textContent = code;
  };

  const broadcast = (msg: WireMsg) => {
    for (const conn of remotes) {
      if (conn.open) conn.send(msg);
    }
  };

  const sendStatus = () => {
    broadcast({
      type: "status",
      pad,
      caps: capabilities(),
      lastRumble,
    });
  };

  const handle = async (msg: WireMsg, from: DataConnection) => {
    if (msg.type === "ping") {
      from.send({ type: "pong" });
      return;
    }
    if (msg.type === "hello") {
      sendStatus();
      return;
    }
    if (msg.type === "stop") {
      await stopRumble();
      lastRumble = "stopped";
      log("Remote stop");
      sendStatus();
      paint();
      return;
    }
    if (msg.type === "rumble") {
      try {
        const mode = await playRumble(msg.duration, msg.weak, msg.strong);
        lastRumble = `${mode} ${Math.round(msg.weak * 100)}/${Math.round(msg.strong * 100)} ${msg.duration}ms`;
        log(`Rumble from remote: ${lastRumble}`);
      } catch (err) {
        lastRumble = String(err);
        log(`Rumble failed: ${err}`);
      }
      sendStatus();
      paint();
    }
  };

  let peer: Peer | null = null;

  const startPeer = () => {
    peer?.destroy();
    remotes.clear();
    peerState = "connecting";
    paint();
    peer = new Peer(peerIdFor(code), { debug: 0 });
    peer.on("open", () => {
      peerState = "open";
      log(`Room ready (${code})`);
      paint();
    });
    peer.on("error", (err) => {
      peerState = "error";
      log(`Peer error: ${err.type ?? err.message}`);
      if (err.type === "unavailable-id") {
        code = randomCode();
        sessionStorage.setItem(CODE_KEY, code);
        startPeer();
      }
      paint();
    });
    peer.on("disconnected", () => {
      peerState = "disconnected";
      paint();
      peer?.reconnect();
    });
    peer.on("connection", (conn) => {
      remotes.add(conn);
      log("Remote connected");
      paint();
      conn.on("data", (raw) => {
        const msg = parseMsg(raw);
        if (msg) void handle(msg, conn);
      });
      conn.on("close", () => {
        remotes.delete(conn);
        log("Remote left");
        paint();
      });
      conn.on("open", () => sendStatus());
    });
  };

  root.querySelector("#home")!.addEventListener("click", () => {
    peer?.destroy();
    location.hash = "#/";
  });
  root.querySelector("#copy")!.addEventListener("click", async () => {
    await navigator.clipboard.writeText(remoteLink());
    log("Copied remote link");
  });
  root.querySelector("#newcode")!.addEventListener("click", () => {
    code = randomCode();
    sessionStorage.setItem(CODE_KEY, code);
    startPeer();
    paint();
  });
  root.querySelector("#buzz")!.addEventListener("click", async () => {
    try {
      const mode = await playRumble(350, 0.4, 1);
      lastRumble = `${mode} test`;
      log("Local test rumble");
    } catch (err) {
      lastRumble = String(err);
      log(`Test failed: ${err}`);
    }
    paint();
    sendStatus();
  });
  root.querySelector("#stop")!.addEventListener("click", async () => {
    await stopRumble();
    lastRumble = "stopped";
    paint();
    sendStatus();
  });

  window.addEventListener("gamepadconnected", (e) => {
    log(`Gamepad connected: ${e.gamepad.id}`);
    pad = readPad();
    paint();
    sendStatus();
  });
  window.addEventListener("gamepaddisconnected", () => {
    log("Gamepad disconnected");
    pad = readPad();
    paint();
    sendStatus();
  });

  let lastPad = "";
  let lastStatusAt = 0;
  const loop = () => {
    pad = readPad();
    const key = JSON.stringify(pad);
    const now = Date.now();
    if (key !== lastPad) {
      lastPad = key;
      paint();
      if (now - lastStatusAt > 80) {
        lastStatusAt = now;
        sendStatus();
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  void keepAwake().then((ok) => {
    awake = ok;
    paint();
  });

  startPeer();
  paint();
}
