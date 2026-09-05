import Peer, { DataConnection } from "peerjs";
import { parseMsg, type WireMsg } from "./protocol";
import { peerIdFor } from "./util";

export function renderRemote(root: HTMLElement, initialCode = "") {
  let conn: DataConnection | null = null;
  let peer: Peer | null = null;
  let state = "idle";
  let lastStatus: Record<string, unknown> | null = null;
  let weak = 0.35;
  let strong = 0.9;
  let duration = 400;

  root.innerHTML = `
    <div class="top">
      <div>
        <div class="brand">ps5-vibe · remote</div>
        <h1>Control rumble</h1>
        <p class="sub">This page talks to the phone that is holding the DualSense connection.</p>
      </div>
      <button class="ghost" id="home">Home</button>
    </div>
    <section class="panel">
      <h2>Room</h2>
      <div class="stack">
        <label class="field">Code
          <input id="code" type="text" maxlength="8" value="${initialCode}" autocomplete="off" />
        </label>
        <button id="join">Connect</button>
        <p class="hint" id="net"></p>
      </div>
    </section>
    <section class="panel">
      <h2>Host status</h2>
      <div class="row" id="pills"></div>
      <div class="grid" style="margin-top:12px" id="stats"></div>
    </section>
    <section class="panel">
      <h2>Vibration</h2>
      <div class="stack">
        <label class="field">Weak motor (high frequency) <span id="weak-v"></span>
          <input id="weak" type="range" min="0" max="100" value="35" />
          <div class="motor"><span id="weak-bar"></span></div>
        </label>
        <label class="field">Strong motor (low frequency) <span id="strong-v"></span>
          <input id="strong" type="range" min="0" max="100" value="90" />
          <div class="motor"><span id="strong-bar"></span></div>
        </label>
        <label class="field">Duration ms <span id="dur-v"></span>
          <input id="dur" type="range" min="50" max="2000" step="50" value="400" />
        </label>
        <button id="fire" disabled>Send rumble</button>
        <button class="danger" id="stop" disabled>Stop</button>
        <div class="row">
          <button class="secondary" data-preset="tap" disabled>Tap</button>
          <button class="secondary" data-preset="thud" disabled>Thud</button>
          <button class="secondary" data-preset="buzz" disabled>Buzz</button>
          <button class="secondary" data-preset="pulse" disabled>Pulse x3</button>
        </div>
      </div>
    </section>
  `;

  const net = root.querySelector("#net") as HTMLElement;
  const pills = root.querySelector("#pills") as HTMLElement;
  const stats = root.querySelector("#stats") as HTMLElement;
  const fire = root.querySelector("#fire") as HTMLButtonElement;
  const stop = root.querySelector("#stop") as HTMLButtonElement;
  const presets = [...root.querySelectorAll<HTMLButtonElement>("[data-preset]")];

  const setConnected = (on: boolean) => {
    fire.disabled = !on;
    stop.disabled = !on;
    presets.forEach((b) => (b.disabled = !on));
  };

  const paintMotors = () => {
    (root.querySelector("#weak-v") as HTMLElement).textContent = `${Math.round(weak * 100)}%`;
    (root.querySelector("#strong-v") as HTMLElement).textContent = `${Math.round(strong * 100)}%`;
    (root.querySelector("#dur-v") as HTMLElement).textContent = `${duration}ms`;
    (root.querySelector("#weak-bar") as HTMLElement).style.width = `${weak * 100}%`;
    (root.querySelector("#strong-bar") as HTMLElement).style.width = `${strong * 100}%`;
  };

  const paintStatus = () => {
    net.textContent = `Link: ${state}`;
    const pad = (lastStatus?.pad ?? {}) as {
      connected?: boolean;
      id?: string;
      hasVibration?: boolean;
      pressed?: string[];
    };
    const last = String(lastStatus?.lastRumble ?? "—");
    pills.innerHTML = `
      <span class="pill"><span class="dot ${state === "open" ? "ok" : "warn"}"></span>Remote ${state}</span>
      <span class="pill"><span class="dot ${pad.connected ? "ok" : "bad"}"></span>Pad ${pad.connected ? "connected" : "missing"}</span>
      <span class="pill"><span class="dot ${pad.hasVibration ? "ok" : "bad"}"></span>Rumble ${pad.hasVibration ? "ready" : "no"}</span>
    `;
    stats.innerHTML = `
      <div class="stat"><div class="k">Host pad</div><div class="v">${pad.id ?? "—"}</div></div>
      <div class="stat"><div class="k">Pressed</div><div class="v">${pad.pressed?.join(" ") || "—"}</div></div>
      <div class="stat"><div class="k">Last rumble</div><div class="v">${last}</div></div>
      <div class="stat"><div class="k">Code</div><div class="v">${(root.querySelector("#code") as HTMLInputElement).value.toUpperCase()}</div></div>
    `;
  };

  const send = (msg: WireMsg) => {
    if (!conn?.open) return;
    conn.send(msg);
  };

  const rumble = (d = duration, w = weak, s = strong) => {
    send({ type: "rumble", duration: d, weak: w, strong: s });
  };

  const connect = () => {
    const code = (root.querySelector("#code") as HTMLInputElement).value
      .trim()
      .toUpperCase();
    if (code.length < 4) {
      state = "need a code";
      paintStatus();
      return;
    }
    peer?.destroy();
    state = "connecting";
    paintStatus();
    peer = new Peer({ debug: 0 });
    peer.on("open", () => {
      conn = peer!.connect(peerIdFor(code), { reliable: true });
      conn.on("open", () => {
        state = "open";
        setConnected(true);
        send({ type: "hello", role: "remote" });
        paintStatus();
      });
      conn.on("data", (raw) => {
        const msg = parseMsg(raw);
        if (msg?.type === "status") {
          lastStatus = msg as unknown as Record<string, unknown>;
          paintStatus();
        }
      });
      conn.on("close", () => {
        state = "closed";
        setConnected(false);
        paintStatus();
      });
    });
    peer.on("error", (err) => {
      state = `error: ${err.type ?? err.message}`;
      setConnected(false);
      paintStatus();
    });
  };

  root.querySelector("#home")!.addEventListener("click", () => {
    peer?.destroy();
    location.hash = "#/";
  });
  root.querySelector("#join")!.addEventListener("click", connect);
  root.querySelector("#weak")!.addEventListener("input", (e) => {
    weak = Number((e.target as HTMLInputElement).value) / 100;
    paintMotors();
  });
  root.querySelector("#strong")!.addEventListener("input", (e) => {
    strong = Number((e.target as HTMLInputElement).value) / 100;
    paintMotors();
  });
  root.querySelector("#dur")!.addEventListener("input", (e) => {
    duration = Number((e.target as HTMLInputElement).value);
    paintMotors();
  });
  fire.addEventListener("click", () => rumble());
  stop.addEventListener("click", () => send({ type: "stop" }));
  root.querySelector('[data-preset="tap"]')!.addEventListener("click", () => rumble(80, 0.2, 0.55));
  root.querySelector('[data-preset="thud"]')!.addEventListener("click", () => rumble(220, 0.05, 1));
  root.querySelector('[data-preset="buzz"]')!.addEventListener("click", () => rumble(900, 1, 0.2));
  root.querySelector('[data-preset="pulse"]')!.addEventListener("click", async () => {
    for (let i = 0; i < 3; i++) {
      rumble(120, 0.4, 0.85);
      await new Promise((r) => setTimeout(r, 220));
    }
  });

  paintMotors();
  paintStatus();
  if (initialCode) connect();
}
