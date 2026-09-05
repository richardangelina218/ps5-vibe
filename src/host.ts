import Peer, { DataConnection } from "peerjs";
import { emptyPad, playRumble, readPad, stopRumble, type PadSnapshot } from "./gamepad";
import { parseMsg, type WireMsg } from "./protocol";
import { capabilities, keepAwake, peerIdFor, randomCode, sanitizeSessionId } from "./util";

const SESSION_KEY = "ps5-vibe-session-id";
const PASS_KEY = "ps5-vibe-admin-pass";

function pill(ok: boolean | null, label: string, detail: string) {
  const cls = ok === true ? "ok" : ok === false ? "bad" : "warn";
  return `<span class="pill"><span class="dot ${cls}"></span>${label}: ${detail}</span>`;
}

export function renderHost(root: HTMLElement) {
  let sessionId = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || randomCode(6).toLowerCase();
  let adminPass = localStorage.getItem(PASS_KEY) || "1234";

  // Connections and auth state
  const remotes = new Map<DataConnection, { auth: boolean; name: string }>();
  let pad: PadSnapshot = emptyPad();
  let lastRumble = "none";
  let peerState = "starting";
  let awake = false;
  const logs: string[] = [];

  root.innerHTML = `
    <div class="top">
      <div>
        <div class="brand">ps5-vibe · host bridge</div>
        <h1>Phone + DualSense</h1>
        <p class="sub">Keeps Bluetooth link alive. Only authorized admins with your passcode can rumble.</p>
      </div>
      <button class="ghost" id="home">Home</button>
    </div>

    <section class="panel">
      <h2>Status & Health</h2>
      <div class="row" id="caps"></div>
      <div class="grid" style="margin-top:12px" id="stats"></div>
    </section>

    <section class="panel">
      <h2>DualSense Controller</h2>
      <div class="buttons" id="btns"></div>
      <p class="hint" id="pad-hint" style="margin-top:8px"></p>
      <div class="row" style="margin-top:12px">
        <button id="buzz">Test rumble</button>
        <button class="secondary" id="stop">Stop</button>
      </div>
    </section>

    <section class="panel">
      <h2>Session & Admin Passcode</h2>
      <div class="stack">
        <label class="field">Session Name / ID (Share this with admin)
          <div style="display:flex;gap:8px">
            <input id="session-input" type="text" value="${sessionId}" maxlength="24" style="text-transform:none;letter-spacing:0.05em" />
            <button class="secondary" id="save-session" style="white-space:nowrap">Apply</button>
          </div>
        </label>
        <label class="field">Admin Passcode (Required for anyone to send rumble)
          <div style="display:flex;gap:8px">
            <input id="pass-input" type="text" value="${adminPass}" maxlength="32" style="text-transform:none;letter-spacing:0.05em" />
            <button class="secondary" id="save-pass" style="white-space:nowrap">Update</button>
          </div>
        </label>
        <div class="code" id="code-display" style="font-size:22px;letter-spacing:0.12em;word-break:break-all"></div>
        <p class="hint">Keep this tab open and in foreground. Wake Lock keeps screen active so Bluetooth remains uninterrupted.</p>
        <div class="stack" style="margin-top:8px">
          <button class="secondary" id="copy">Copy Admin Remote Link</button>
          <button class="ghost" id="rand-session">Generate New Session ID</button>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>Connected Remotes (<span id="remotes-count">0</span>)</h2>
      <div id="remotes-list" class="stack" style="font-size:13px;color:var(--muted)">No remote connected yet.</div>
    </section>

    <section class="panel">
      <h2>Event Log</h2>
      <div class="log" id="log"></div>
    </section>
  `;

  const logEl = root.querySelector("#log")!;
  const capsEl = root.querySelector("#caps")!;
  const statsEl = root.querySelector("#stats")!;
  const btnsEl = root.querySelector("#btns")!;
  const padHint = root.querySelector("#pad-hint")!;
  const codeEl = root.querySelector("#code-display")!;
  const remotesCountEl = root.querySelector("#remotes-count")!;
  const remotesListEl = root.querySelector("#remotes-list")!;
  const sessionInput = root.querySelector("#session-input") as HTMLInputElement;
  const passInput = root.querySelector("#pass-input") as HTMLInputElement;

  const log = (text: string) => {
    const line = `${new Date().toLocaleTimeString()}  ${text}`;
    logs.unshift(line);
    logEl.textContent = logs.slice(0, 40).join("\n");
  };

  const remoteLink = () => {
    const url = new URL(location.href);
    url.hash = `#/remote/${sessionId}`;
    return url.toString();
  };

  const updateRemotesList = () => {
    remotesCountEl.textContent = String(remotes.size);
    if (remotes.size === 0) {
      remotesListEl.innerHTML = `<div>No remote connected yet.</div>`;
      return;
    }
    const items: string[] = [];
    remotes.forEach((info, conn) => {
      items.push(`
        <div class="stat" style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong>${info.name || "Remote " + conn.peer.slice(-4)}</strong>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">ID: ${conn.peer}</div>
          </div>
          <span class="pill">
            <span class="dot ${info.auth ? "ok" : "warn"}"></span>
            ${info.auth ? "Authorized Admin" : "Guest (Read Only)"}
          </span>
        </div>
      `);
    });
    remotesListEl.innerHTML = items.join("");
  };

  const paint = () => {
    const caps = capabilities();
    const authedCount = [...remotes.values()].filter((r) => r.auth).length;

    capsEl.innerHTML = [
      pill(caps.secure, "HTTPS", caps.secure ? "ok" : "required"),
      pill(caps.gamepadApi, "Gamepad API", caps.gamepadApi ? "ready" : "missing"),
      pill(caps.peerApi, "WebRTC", caps.peerApi ? "ready" : "missing"),
      pill(pad.connected, "Controller", pad.connected ? "connected" : "waiting for button"),
      pill(pad.hasVibration, "Dual-Rumble", pad.hasVibration ? pad.hapticType : "unavailable"),
      pill(peerState === "open", "Room Server", peerState),
      pill(awake, "Screen Wake", awake ? "active" : "off"),
      pill(authedCount > 0, "Admin Link", authedCount > 0 ? `${authedCount} active` : "waiting"),
    ].join("");

    statsEl.innerHTML = `
      <div class="stat"><div class="k">DualSense Model</div><div class="v">${pad.id}</div></div>
      <div class="stat"><div class="k">Mapping & Inputs</div><div class="v">${pad.mapping} · ${pad.buttons} btn · ${pad.axes} axes</div></div>
      <div class="stat"><div class="k">Last Vibration Trigger</div><div class="v">${lastRumble}</div></div>
      <div class="stat"><div class="k">Buttons Held</div><div class="v">${pad.pressed.join(" ") || "—"}</div></div>
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
      ? "DualSense is paired & responding to inputs. Admin can trigger vibration remotely."
      : "No controller detected yet. Pair in Android Bluetooth settings, then press Cross/PS on the controller.";
    codeEl.textContent = `Session: ${sessionId}`;
    updateRemotesList();
  };

  const sendStatus = (target?: DataConnection) => {
    const payload = {
      type: "status" as const,
      pad,
      caps: capabilities(),
      lastRumble,
      sessionId,
    };
    if (target) {
      if (target.open) {
        const client = remotes.get(target);
        target.send({ ...payload, authenticated: Boolean(client?.auth) });
      }
    } else {
      for (const [conn, client] of remotes) {
        if (conn.open) {
          conn.send({ ...payload, authenticated: client.auth });
        }
      }
    }
  };

  const handle = async (msg: WireMsg, from: DataConnection) => {
    const client = remotes.get(from) || { auth: false, name: "Remote" };

    if (msg.type === "ping") {
      from.send({ type: "pong", ts: msg.ts });
      return;
    }

    if (msg.type === "hello") {
      sendStatus(from);
      return;
    }

    if (msg.type === "auth_request") {
      const inputToken = (msg.token || "").trim();
      const expected = (adminPass || "").trim();
      const passMatch = Boolean(expected && inputToken === expected);

      if (passMatch) {
        client.auth = true;
        if (msg.clientName) client.name = msg.clientName;
        remotes.set(from, client);
        from.send({ type: "auth_response", success: true, hostSessionId: sessionId });
        log(`Admin authenticated successfully: ${client.name}`);
      } else {
        from.send({ type: "auth_response", success: false, error: "Incorrect admin passcode" });
        log(`Failed auth attempt from ${from.peer}`);
      }
      paint();
      sendStatus(from);
      return;
    }

    // Require authorization for vibration commands
    if (msg.type === "stop" || msg.type === "rumble") {
      if (!client.auth) {
        from.send({ type: "auth_response", success: false, error: "Unauthorized: Please log in as Admin." });
        log(`Blocked unauthorized rumble command from ${from.peer}`);
        return;
      }
    }

    if (msg.type === "stop") {
      await stopRumble();
      lastRumble = "stopped";
      log(`Remote stop by ${client.name}`);
      sendStatus();
      paint();
      return;
    }

    if (msg.type === "rumble") {
      try {
        const mode = await playRumble(msg.duration, msg.weak, msg.strong);
        lastRumble = `${mode} ${Math.round(msg.weak * 100)}%W / ${Math.round(msg.strong * 100)}%S (${msg.duration}ms)`;
        log(`Rumble (${client.name}): ${lastRumble}`);
      } catch (err) {
        lastRumble = String(err);
        log(`Rumble error: ${err}`);
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
    const cleanId = sanitizeSessionId(sessionId);
    peer = new Peer(peerIdFor(cleanId), { debug: 0 });

    peer.on("open", () => {
      peerState = "open";
      log(`Room ready on session: ${cleanId}`);
      paint();
    });

    peer.on("error", (err) => {
      peerState = "error";
      log(`Peer error: ${err.type ?? err.message}`);
      if (err.type === "unavailable-id") {
        log("Session ID already in use. Generating unique ID...");
        sessionId = randomCode(6).toLowerCase();
        localStorage.setItem(SESSION_KEY, sessionId);
        sessionInput.value = sessionId;
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
      remotes.set(conn, { auth: false, name: "Remote " + conn.peer.slice(-4) });
      log("Remote client connected");
      paint();

      conn.on("data", (raw) => {
        const msg = parseMsg(raw);
        if (msg) void handle(msg, conn);
      });

      conn.on("close", () => {
        remotes.delete(conn);
        log("Remote client left");
        paint();
      });

      conn.on("open", () => {
        sendStatus(conn);
      });
    });
  };

  root.querySelector("#home")!.addEventListener("click", () => {
    peer?.destroy();
    location.hash = "#/";
  });

  root.querySelector("#save-session")!.addEventListener("click", () => {
    const val = sanitizeSessionId(sessionInput.value);
    if (!val) return;
    sessionId = val;
    localStorage.setItem(SESSION_KEY, sessionId);
    log(`Switched session ID to: ${sessionId}`);
    startPeer();
  });

  root.querySelector("#rand-session")!.addEventListener("click", () => {
    sessionId = randomCode(6).toLowerCase();
    sessionInput.value = sessionId;
    localStorage.setItem(SESSION_KEY, sessionId);
    log(`Generated new session ID: ${sessionId}`);
    startPeer();
  });

  root.querySelector("#save-pass")!.addEventListener("click", () => {
    const val = passInput.value.trim();
    if (!val) return;
    adminPass = val;
    localStorage.setItem(PASS_KEY, adminPass);
    log("Admin passcode updated. Existing remotes must re-authenticate.");
    // reset auth on existing remotes
    remotes.forEach((v) => (v.auth = false));
    sendStatus();
    paint();
  });

  root.querySelector("#copy")!.addEventListener("click", async () => {
    await navigator.clipboard.writeText(remoteLink());
    log("Copied remote admin link to clipboard");
  });

  root.querySelector("#buzz")!.addEventListener("click", async () => {
    try {
      const mode = await playRumble(350, 0.4, 1);
      lastRumble = `${mode} local test`;
      log("Local test rumble fired");
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
    log(`DualSense connected: ${e.gamepad.id}`);
    pad = readPad();
    paint();
    sendStatus();
  });

  window.addEventListener("gamepaddisconnected", () => {
    log("DualSense disconnected");
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

