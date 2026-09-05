import Peer, { DataConnection } from "peerjs";
import { emptyPad, playRumble, readPad, stopRumble, type PadSnapshot } from "./gamepad";
import { parseMsg, type WireMsg } from "./protocol";
import { capabilities, keepAwake, peerIdFor, randomCode, sanitizeSessionId } from "./util";

const SESSION_KEY = "ps5-vibe-session-id";
const PASS_KEY = "ps5-vibe-admin-pass";

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
    <div id="toast-container" class="toast-container"></div>
    <div class="top">
      <div>
        <div class="brand">private sanctuary</div>
        <h1 id="host-title">Your Receiver</h1>
        <p class="sub">Keep this page open and controller nearby. Your partner will take care of the rest.</p>
      </div>
      <button class="ghost" id="home">Leave</button>
    </div>

    <!-- Friendly Tap To Activate Banner (Required by Android Chrome) -->
    <div id="activate-banner" style="background:linear-gradient(135deg, rgba(217, 75, 118, 0.2), rgba(242, 140, 169, 0.15));border:1px solid var(--accent);border-radius:18px;padding:14px 18px;margin-bottom:14px;cursor:pointer">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <strong style="color:var(--accent-2);font-size:14px">✨ Tap screen to enable gentle vibrations</strong>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">Android requires one screen tap to activate gamepad vibrations and keep screen awake.</div>
        </div>
        <button id="activate-btn" style="padding:8px 14px;font-size:12px;min-height:auto">Tap to Activate</button>
      </div>
    </div>

    <section class="panel" style="border-color:var(--accent);background:rgba(217, 75, 118, 0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:11px;text-transform:uppercase;color:var(--accent-2);letter-spacing:0.1em;font-weight:600">Your Private Invitation Link</div>
          <div class="code" id="code-display" style="font-size:22px;letter-spacing:0.08em;word-break:break-all;text-align:left;padding:4px 0"></div>
        </div>
        <button class="secondary" id="copy" style="font-size:13px;padding:10px 18px;border-color:var(--accent)">Share Link</button>
      </div>
      <div class="row" style="margin-top:12px">
        <span class="pill" id="server-badge"><span class="dot warn"></span>Connecting to room...</span>
        <span class="pill" id="pad-badge"><span class="dot bad"></span>Waiting for controller</span>
        <span class="pill" id="awake-badge"><span class="dot warn"></span>Screen Wake: Off</span>
      </div>
    </section>

    <section class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2>Connected Controller (<span id="pad-type-name">Detecting...</span>)</h2>
        <span id="haptic-badge" class="pill" style="font-size:11px">Sensations: checking</span>
      </div>
      <div class="buttons" id="btns" style="margin-top:8px"></div>
      <p class="hint" id="pad-hint" style="margin-top:10px"></p>
      <div class="row" style="margin-top:12px">
        <button id="buzz">Gentle Test Pulse</button>
        <button class="secondary" id="stop">Stop</button>
      </div>
    </section>

    <section class="panel">
      <h2>Private Room Settings</h2>
      <div class="stack">
        <label class="field">Private Room Code / Name
          <div style="display:flex;gap:8px">
            <input id="session-input" type="text" value="${sessionId}" maxlength="24" style="text-transform:none;letter-spacing:0.05em" />
            <button class="secondary" id="save-session" style="white-space:nowrap">Apply</button>
          </div>
        </label>
        <label class="field">Passcode (Your partner enters this to control)
          <div style="display:flex;gap:8px">
            <input id="pass-input" type="text" value="${adminPass}" maxlength="32" style="text-transform:none;letter-spacing:0.05em" />
            <button class="secondary" id="save-pass" style="white-space:nowrap">Update</button>
          </div>
        </label>
      </div>
    </section>

    <section class="panel">
      <h2>Connection Status (<span id="remotes-count">0</span> connected)</h2>
      <div id="remotes-list" class="stack" style="font-size:13px;color:var(--muted)">Waiting for your partner to connect...</div>
    </section>
  `;

  const toastContainer = root.querySelector("#toast-container")!;
  const serverBadge = root.querySelector("#server-badge")!;
  const padBadge = root.querySelector("#pad-badge")!;
  const awakeBadge = root.querySelector("#awake-badge")!;
  const padTypeName = root.querySelector("#pad-type-name")!;
  const hapticBadge = root.querySelector("#haptic-badge")!;
  const btnsEl = root.querySelector("#btns")!;
  const padHint = root.querySelector("#pad-hint")!;
  const codeEl = root.querySelector("#code-display")!;
  const remotesCountEl = root.querySelector("#remotes-count")!;
  const remotesListEl = root.querySelector("#remotes-list")!;
  const sessionInput = root.querySelector("#session-input") as HTMLInputElement;
  const passInput = root.querySelector("#pass-input") as HTMLInputElement;
  const activateBanner = root.querySelector("#activate-banner") as HTMLElement;

  const requestAwakeAndHaptics = async () => {
    awake = await keepAwake();
    paint();
    activateBanner.style.display = "none";
  };

  activateBanner.addEventListener("click", requestAwakeAndHaptics);
  window.addEventListener("pointerdown", () => {
    if (!awake) void requestAwakeAndHaptics();
  }, { once: true });

  const showToast = (text: string, sender = "Partner Note", durationMs = 7000) => {
    const el = document.createElement("div");
    el.className = "toast-msg";
    el.innerHTML = `
      <div class="toast-sender">💌 ${sender}</div>
      <div class="toast-text">${text}</div>
    `;
    toastContainer.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(-10px) scale(0.95)";
      el.style.transition = "all 0.3s ease";
      setTimeout(() => el.remove(), 300);
    }, durationMs);
  };

  const log = (text: string) => {
    const line = `${new Date().toLocaleTimeString()}  ${text}`;
    logs.unshift(line);
  };

  const remoteLink = () => {
    const url = new URL(location.href);
    url.hash = `#/remote/${sessionId}`;
    return url.toString();
  };

  const updateRemotesList = () => {
    remotesCountEl.textContent = String(remotes.size);
    if (remotes.size === 0) {
      remotesListEl.innerHTML = `<div>Waiting for your partner to connect...</div>`;
      return;
    }
    const items: string[] = [];
    remotes.forEach((info, conn) => {
      items.push(`
        <div class="stat" style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong>${info.name || "Partner " + conn.peer.slice(-4)}</strong>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">Session ID: ${conn.peer}</div>
          </div>
          <span class="pill">
            <span class="dot ${info.auth ? "ok" : "warn"}"></span>
            ${info.auth ? "Partner Connected ✨" : "Pending Password"}
          </span>
        </div>
      `);
    });
    remotesListEl.innerHTML = items.join("");
  };

  const paint = () => {
    // Dynamic server status pill
    if (peerState === "open") {
      serverBadge.innerHTML = `<span class="dot ok"></span>Room Connected`;
    } else if (peerState === "error") {
      serverBadge.innerHTML = `<span class="dot bad"></span>Connecting Retried`;
    } else {
      serverBadge.innerHTML = `<span class="dot warn"></span>Connecting (${peerState})...`;
    }

    padTypeName.textContent = pad.connected ? pad.modelLabel : "No Controller";
    hapticBadge.innerHTML = `<span class="dot ${pad.hasVibration ? "ok" : "bad"}"></span>${pad.hasVibration ? "Sensations Ready" : "No Rumble"}`;

    padBadge.innerHTML = `<span class="dot ${pad.connected ? "ok" : "bad"}"></span>${pad.connected ? pad.modelLabel : "Waiting for controller (press any button)"}`;
    awakeBadge.innerHTML = `<span class="dot ${awake ? "ok" : "warn"}"></span>Screen Stay Awake: ${awake ? "Active" : "Off (tap screen)"}`;

    // Controller specific button layout
    const isXbox = pad.controllerType === "xbox";
    const psLabels = ["×", "○", "□", "△", "L1", "R1", "L2", "R2", "Create", "Opt", "L3", "R3", "↑", "↓", "←", "→", "PS", "Pad"];
    const xboxLabels = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "LS", "RS", "↑", "↓", "←", "→", "Xbox", "Share"];
    const labels = isXbox ? xboxLabels : psLabels;

    btnsEl.innerHTML = labels
      .map((chipLabel, i) => {
        const fullLabel = isXbox
          ? ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "LS", "RS", "D-Up", "D-Down", "D-Left", "D-Right", "Xbox", "Share"][i]
          : ["Cross (×)", "Circle (○)", "Square (□)", "Triangle (△)", "L1", "R1", "L2", "R2", "Create", "Options", "L3", "R3", "D-Up", "D-Down", "D-Left", "D-Right", "PS", "Touchpad"][i];
        const on = pad.pressed.includes(fullLabel);
        return `<span class="btn-chip ${on ? "on" : ""}">${chipLabel}</span>`;
      })
      .join("");

    padHint.textContent = pad.connected
      ? `${pad.modelLabel} is ready and responsive. Relax and let your partner guide the sensations.`
      : "Pair your PS5 DualSense or Xbox controller in Android Bluetooth settings, then tap any button.";
    codeEl.textContent = `Room: ${sessionId}`;
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

    if (msg.type === "flash_message") {
      showToast(msg.text, msg.sender || "Admin", msg.duration || 6000);
      log(`Message on screen: "${msg.text}"`);
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
        showToast("Admin successfully connected and authenticated!", "System Notice", 4000);
        log(`Admin authenticated: ${client.name}`);
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
    peer = new Peer(peerIdFor(cleanId), {
      debug: 0,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" },
        ],
      },
    });

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

