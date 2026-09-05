import Peer, { DataConnection } from "peerjs";
import { parseMsg, type WireMsg } from "./protocol";
import { peerIdFor, sanitizeSessionId } from "./util";

export function renderRemote(root: HTMLElement, initialCode = "") {
  let conn: DataConnection | null = null;
  let peer: Peer | null = null;
  let state = "idle";
  let authenticated = false;
  let lastStatus: Record<string, unknown> | null = null;
  let currentSession = sanitizeSessionId(initialCode) || localStorage.getItem("ps5-vibe-last-session") || "";
  let adminPass = localStorage.getItem("ps5-vibe-last-pass") || "1234";

  // Master Control Variables
  let weak = 0.4;
  let strong = 0.85;
  let duration = 350;
  let masterMultiplier = 1.0; // 0.1x to 2.0x
  let activeTab: "touch" | "manual" | "patterns" | "sequencer" = "touch";

  // Pattern engine loop
  let patternLoopTimer: number | null = null;
  let activePatternName: string | null = null;
  let pingMs: number | null = null;
  let pingInterval: number | null = null;

  root.innerHTML = `
    <div class="top">
      <div>
        <div class="brand">ps5-vibe · admin remote</div>
        <h1>Controller Admin Panel</h1>
        <p class="sub">Full remote control over DualSense vibration parameters and patterns.</p>
      </div>
      <button class="ghost" id="home">Home</button>
    </div>

    <!-- Session & Login Panel -->
    <section class="panel">
      <h2>Session Authentication</h2>
      <div class="stack">
        <div class="grid">
          <label class="field">Host Session ID
            <input id="session-code" type="text" maxlength="24" value="${currentSession}" placeholder="e.g. room1" style="text-transform:none;letter-spacing:0.05em" />
          </label>
          <label class="field">Admin Passcode
            <input id="admin-pass" type="password" maxlength="32" value="${adminPass}" placeholder="Passcode" style="letter-spacing:0.05em" />
          </label>
        </div>
        <div style="display:flex;gap:8px">
          <button id="join" style="flex:1">Connect as Admin</button>
          <button class="secondary" id="disconnect-btn" disabled>Disconnect</button>
        </div>
        <div class="row" style="align-items:center;justify-content:space-between;margin-top:4px">
          <span class="hint" id="net">Status: Idle</span>
          <span class="pill" id="auth-pill"><span class="dot warn"></span>Locked</span>
        </div>
      </div>
    </section>

    <!-- Host Health & Telemetry -->
    <section class="panel">
      <h2>Host Telemetry & Status</h2>
      <div class="row" id="pills"></div>
      <div class="grid" style="margin-top:12px" id="stats"></div>
    </section>

    <!-- Master Multiplier -->
    <section class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2>Master Intensity Multiplier</h2>
        <strong id="multiplier-v" style="color:var(--accent-2);font-size:16px">1.0x (100%)</strong>
      </div>
      <label class="field">
        <input id="master-multiplier" type="range" min="10" max="200" step="5" value="100" />
      </label>
    </section>

    <!-- Admin Controls Navigation Tabs -->
    <div class="tab-bar">
      <button class="tab-btn active" data-tab="touch">2D Touch Pad</button>
      <button class="tab-btn" data-tab="manual">Precision Sliders</button>
      <button class="tab-btn" data-tab="patterns">Dynamic Patterns</button>
      <button class="tab-btn" data-tab="sequencer">Custom Sequencer</button>
    </div>

    <!-- TAB 1: 2D Touch Surface -->
    <section class="panel tab-content" id="tab-touch">
      <h2>Real-time XY Haptic Surface</h2>
      <p class="hint">Touch / drag anywhere on the pad. Drag horizontally for Weak (High Freq) and vertically for Strong (Low Freq). Release to stop.</p>
      <div class="xy-pad-container" id="xy-pad">
        <div class="xy-reticle" id="xy-reticle"></div>
        <span class="xy-pad-label xy-top">Max Strong (Low Freq)</span>
        <span class="xy-pad-label xy-bottom">Zero Strong</span>
        <span class="xy-pad-label xy-left">Min Weak</span>
        <span class="xy-pad-label xy-right">Max Weak (High Freq)</span>
        <div id="xy-coords" style="color:var(--muted);font-size:13px;pointer-events:none">Touch or Drag Here</div>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="secondary" id="continuous-toggle" style="flex:1" disabled>Hold-to-Vibrate: ON</button>
      </div>
    </section>

    <!-- TAB 2: Precision Manual Sliders -->
    <section class="panel tab-content" id="tab-manual" style="display:none">
      <h2>Fine-Tuned Dual Motors</h2>
      <div class="stack">
        <label class="field">Weak Motor (High Frequency Crisp Rumble) <span id="weak-v">40%</span>
          <input id="weak" type="range" min="0" max="100" value="40" />
          <div class="motor"><span id="weak-bar"></span></div>
        </label>
        <label class="field">Strong Motor (Heavy Low Bass Rumble) <span id="strong-v">85%</span>
          <input id="strong" type="range" min="0" max="100" value="85" />
          <div class="motor"><span id="strong-bar"></span></div>
        </label>
        <label class="field">Pulse Duration: <span id="dur-v">350ms</span>
          <input id="dur" type="range" min="50" max="3000" step="25" value="350" />
        </label>
        <div style="display:flex;gap:8px;margin-top:6px">
          <button id="fire" style="flex:1" disabled>Trigger Single Pulse</button>
          <button class="danger" id="manual-stop" disabled>Stop</button>
        </div>
      </div>
    </section>

    <!-- TAB 3: Dynamic Patterns -->
    <section class="panel tab-content" id="tab-patterns" style="display:none">
      <h2>Preset Dynamic Waveforms & Loops</h2>
      <p class="hint">Select a pattern below to run live. Patterns repeat seamlessly until stopped.</p>
      <div class="pattern-grid" style="margin-top:12px">
        <button class="pattern-card" data-pat="heartbeat" disabled>
          <strong>Heartbeat</strong>
          <span>Lub-dub rhythmic pulse</span>
        </button>
        <button class="pattern-card" data-pat="escalate" disabled>
          <strong>Crescendo</strong>
          <span>Ramps up from 10% to 100%</span>
        </button>
        <button class="pattern-card" data-pat="wave" disabled>
          <strong>Sine Wave</strong>
          <span>Smooth oscillating wave</span>
        </button>
        <button class="pattern-card" data-pat="flutter" disabled>
          <strong>Butterfly / Flutter</strong>
          <span>Fast rapid high-frequency buzz</span>
        </button>
        <button class="pattern-card" data-pat="earthquake" disabled>
          <strong>Earthquake</strong>
          <span>Heavy erratic low-end rumble</span>
        </button>
        <button class="pattern-card" data-pat="staccato" disabled>
          <strong>Machine Staccato</strong>
          <span>Crisp sharp metronome bursts</span>
        </button>
      </div>
    </section>

    <!-- TAB 4: Custom Sequencer -->
    <section class="panel tab-content" id="tab-sequencer" style="display:none">
      <h2>Custom Step Sequencer</h2>
      <p class="hint">Chain custom pulses into a sequence.</p>
      <div class="stack" style="margin-top:10px">
        <label class="field">Sequence Code (Format: weak,strong,ms | ...)
          <input id="seq-input" type="text" value="30,80,200 | 0,0,100 | 60,100,400" style="text-transform:none;letter-spacing:0.05em" />
        </label>
        <div style="display:flex;gap:8px">
          <button id="play-seq" style="flex:1" disabled>Play Sequence</button>
          <button class="secondary" id="loop-seq" disabled>Loop Sequence</button>
        </div>
      </div>
    </section>

    <!-- Floating Panic Stop Button -->
    <button class="danger floating-stop" id="panic-stop" disabled style="display:none">
      <span>STOP ALL</span>
    </button>
  `;

  // UI Element Selectors
  const net = root.querySelector("#net") as HTMLElement;
  const authPill = root.querySelector("#auth-pill") as HTMLElement;
  const pills = root.querySelector("#pills") as HTMLElement;
  const stats = root.querySelector("#stats") as HTMLElement;
  const joinBtn = root.querySelector("#join") as HTMLButtonElement;
  const disconnectBtn = root.querySelector("#disconnect-btn") as HTMLButtonElement;
  const panicStop = root.querySelector("#panic-stop") as HTMLButtonElement;
  const manualStop = root.querySelector("#manual-stop") as HTMLButtonElement;
  const fire = root.querySelector("#fire") as HTMLButtonElement;
  const weakInput = root.querySelector("#weak") as HTMLInputElement;
  const strongInput = root.querySelector("#strong") as HTMLInputElement;
  const durInput = root.querySelector("#dur") as HTMLInputElement;
  const multiplierInput = root.querySelector("#master-multiplier") as HTMLInputElement;
  const multiplierLabel = root.querySelector("#multiplier-v") as HTMLElement;
  const xyPad = root.querySelector("#xy-pad") as HTMLElement;
  const xyReticle = root.querySelector("#xy-reticle") as HTMLElement;
  const xyCoords = root.querySelector("#xy-coords") as HTMLElement;
  const patternCards = [...root.querySelectorAll<HTMLButtonElement>("[data-pat]")];
  const playSeqBtn = root.querySelector("#play-seq") as HTMLButtonElement;
  const loopSeqBtn = root.querySelector("#loop-seq") as HTMLButtonElement;
  const seqInput = root.querySelector("#seq-input") as HTMLInputElement;

  let continuousTouch = true;
  let touchInterval: number | null = null;

  const getEffectiveWeak = (val: number) => Math.min(1, Math.max(0, val * masterMultiplier));
  const getEffectiveStrong = (val: number) => Math.min(1, Math.max(0, val * masterMultiplier));

  const send = (msg: WireMsg) => {
    if (!conn || !conn.open) return;
    conn.send(msg);
  };

  const sendRumble = (d = duration, w = weak, s = strong) => {
    const effW = getEffectiveWeak(w);
    const effS = getEffectiveStrong(s);
    send({
      type: "rumble",
      duration: Math.round(d),
      weak: Number(effW.toFixed(2)),
      strong: Number(effS.toFixed(2)),
    });
  };

  const stopAll = () => {
    if (patternLoopTimer) {
      clearInterval(patternLoopTimer);
      clearTimeout(patternLoopTimer);
      patternLoopTimer = null;
    }
    if (touchInterval) {
      clearInterval(touchInterval);
      touchInterval = null;
    }
    activePatternName = null;
    patternCards.forEach((c) => c.classList.remove("running"));
    xyReticle.style.display = "none";
    xyPad.classList.remove("active");
    xyCoords.textContent = "Touch or Drag Here";
    send({ type: "stop" });
  };

  const setControlsEnabled = (enabled: boolean) => {
    fire.disabled = !enabled;
    manualStop.disabled = !enabled;
    panicStop.disabled = !enabled;
    playSeqBtn.disabled = !enabled;
    loopSeqBtn.disabled = !enabled;
    patternCards.forEach((b) => (b.disabled = !enabled));
    disconnectBtn.disabled = !conn?.open;
    panicStop.style.display = enabled ? "flex" : "none";
  };

  const paintMotors = () => {
    (root.querySelector("#weak-v") as HTMLElement).textContent = `${Math.round(weak * 100)}% (eff: ${Math.round(getEffectiveWeak(weak) * 100)}%)`;
    (root.querySelector("#strong-v") as HTMLElement).textContent = `${Math.round(strong * 100)}% (eff: ${Math.round(getEffectiveStrong(strong) * 100)}%)`;
    (root.querySelector("#dur-v") as HTMLElement).textContent = `${duration}ms`;
    (root.querySelector("#weak-bar") as HTMLElement).style.width = `${getEffectiveWeak(weak) * 100}%`;
    (root.querySelector("#strong-bar") as HTMLElement).style.width = `${getEffectiveStrong(strong) * 100}%`;
  };

  const paintStatus = () => {
    net.textContent = `Link: ${state} ${pingMs !== null ? `(${pingMs}ms)` : ""}`;
    const pad = (lastStatus?.pad ?? {}) as {
      connected?: boolean;
      id?: string;
      hasVibration?: boolean;
      pressed?: string[];
      mapping?: string;
    };
    const last = String(lastStatus?.lastRumble ?? "—");
    const sessionName = String(lastStatus?.sessionId ?? currentSession);

    if (authenticated) {
      authPill.innerHTML = `<span class="dot ok"></span>Admin Authorized`;
    } else {
      authPill.innerHTML = `<span class="dot warn"></span>Guest / Locked`;
    }

    pills.innerHTML = `
      <span class="pill"><span class="dot ${state === "open" ? "ok" : "warn"}"></span>WebRTC ${state}</span>
      <span class="pill"><span class="dot ${pad.connected ? "ok" : "bad"}"></span>DualSense ${pad.connected ? "connected" : "offline"}</span>
      <span class="pill"><span class="dot ${pad.hasVibration ? "ok" : "bad"}"></span>Haptics ${pad.hasVibration ? "active" : "no"}</span>
      <span class="pill"><span class="dot ok"></span>Session: ${sessionName}</span>
    `;

    stats.innerHTML = `
      <div class="stat"><div class="k">DualSense Model</div><div class="v">${pad.id ?? "Not connected on phone"}</div></div>
      <div class="stat"><div class="k">Held Buttons on Phone</div><div class="v">${pad.pressed?.join(" ") || "None"}</div></div>
      <div class="stat"><div class="k">Host Last Vibration</div><div class="v">${last}</div></div>
      <div class="stat"><div class="k">Active Pattern</div><div class="v" style="color:var(--accent-2)">${activePatternName || "None"}</div></div>
    `;
  };

  // Switch between navigation tabs
  root.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab as typeof activeTab;
      activeTab = tab;
      root.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      root.querySelectorAll<HTMLElement>(".tab-content").forEach((panel) => {
        panel.style.display = panel.id === `tab-${tab}` ? "block" : "none";
      });
    });
  });

  // XY Touch Surface logic
  const handleXYMove = (e: PointerEvent | MouseEvent | Touch) => {
    const rect = xyPad.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    // Horizontal = Weak motor (0 to 1)
    const normX = x / rect.width;
    // Vertical = Strong motor inverted (top is 1.0, bottom is 0.0)
    const normY = 1.0 - y / rect.height;

    weak = normX;
    strong = normY;
    paintMotors();

    xyReticle.style.display = "block";
    xyReticle.style.left = `${x}px`;
    xyReticle.style.top = `${y}px`;
    xyCoords.textContent = `Weak: ${Math.round(getEffectiveWeak(weak) * 100)}% | Strong: ${Math.round(getEffectiveStrong(strong) * 100)}%`;

    if (continuousTouch && authenticated) {
      sendRumble(160, weak, strong);
    }
  };

  xyPad.addEventListener("pointerdown", (e) => {
    xyPad.setPointerCapture(e.pointerId);
    xyPad.classList.add("active");
    handleXYMove(e);

    if (continuousTouch && !touchInterval) {
      touchInterval = window.setInterval(() => {
        if (authenticated) {
          sendRumble(160, weak, strong);
        }
      }, 100);
    }
  });

  xyPad.addEventListener("pointermove", (e) => {
    if (xyPad.classList.contains("active")) {
      handleXYMove(e);
    }
  });

  const releasePointer = () => {
    xyPad.classList.remove("active");
    if (touchInterval) {
      clearInterval(touchInterval);
      touchInterval = null;
    }
    xyReticle.style.display = "none";
    xyCoords.textContent = "Touch or Drag Here";
    if (authenticated) {
      send({ type: "stop" });
    }
  };

  xyPad.addEventListener("pointerup", releasePointer);
  xyPad.addEventListener("pointercancel", releasePointer);

  // Pattern engine
  const startPattern = (patName: string) => {
    stopAll();
    activePatternName = patName;
    const card = root.querySelector(`[data-pat="${patName}"]`);
    if (card) card.classList.add("running");
    paintStatus();

    if (patName === "heartbeat") {
      let step = 0;
      patternLoopTimer = window.setInterval(() => {
        if (step === 0) sendRumble(100, 0.2, 0.9);
        else if (step === 1) sendRumble(140, 0.3, 1.0);
        step = (step + 1) % 5; // 0, 1, then 3 beats silence
      }, 180);
    } else if (patName === "escalate") {
      let power = 0.1;
      patternLoopTimer = window.setInterval(() => {
        sendRumble(150, power * 0.7, power);
        power += 0.15;
        if (power > 1.0) power = 0.1;
      }, 160);
    } else if (patName === "wave") {
      let t = 0;
      patternLoopTimer = window.setInterval(() => {
        const s = (Math.sin(t) + 1) / 2;
        const w = (Math.cos(t) + 1) / 2;
        sendRumble(120, w * 0.8, s);
        t += 0.35;
      }, 100);
    } else if (patName === "flutter") {
      patternLoopTimer = window.setInterval(() => {
        sendRumble(70, 0.95, 0.1);
      }, 90);
    } else if (patName === "earthquake") {
      patternLoopTimer = window.setInterval(() => {
        const randS = 0.6 + Math.random() * 0.4;
        const randW = Math.random() * 0.5;
        sendRumble(130, randW, randS);
      }, 120);
    } else if (patName === "staccato") {
      patternLoopTimer = window.setInterval(() => {
        sendRumble(60, 0.4, 0.8);
      }, 250);
    }
  };

  patternCards.forEach((btn) => {
    btn.addEventListener("click", () => {
      const pat = btn.dataset.pat;
      if (pat === activePatternName) {
        stopAll();
      } else if (pat) {
        startPattern(pat);
      }
    });
  });

  // Custom Step Sequencer
  const runSequence = async (loop: boolean) => {
    stopAll();
    const raw = seqInput.value;
    const steps = raw.split("|").map((chunk) => {
      const parts = chunk.split(",").map((p) => Number(p.trim()));
      return {
        w: (parts[0] ?? 0) / 100,
        s: (parts[1] ?? 0) / 100,
        ms: parts[2] ?? 200,
      };
    });

    activePatternName = loop ? "Custom (Loop)" : "Custom (Single)";
    paintStatus();

    const executeOnce = async () => {
      for (const step of steps) {
        if (!activePatternName) break;
        if (step.w > 0 || step.s > 0) {
          sendRumble(step.ms, step.w, step.s);
        } else {
          send({ type: "stop" });
        }
        await new Promise((r) => setTimeout(r, step.ms));
      }
    };

    if (loop) {
      const loopWrapper = async () => {
        while (activePatternName) {
          await executeOnce();
        }
      };
      void loopWrapper();
    } else {
      await executeOnce();
      activePatternName = null;
      paintStatus();
    }
  };

  playSeqBtn.addEventListener("click", () => runSequence(false));
  loopSeqBtn.addEventListener("click", () => runSequence(true));

  // Connect & Auth Handshake
  const connect = () => {
    const sessionInput = (root.querySelector("#session-code") as HTMLInputElement).value;
    const passInput = (root.querySelector("#admin-pass") as HTMLInputElement).value;

    currentSession = sanitizeSessionId(sessionInput);
    adminPass = passInput.trim();

    if (!currentSession) {
      state = "Enter valid session ID";
      paintStatus();
      return;
    }

    localStorage.setItem("ps5-vibe-last-session", currentSession);
    localStorage.setItem("ps5-vibe-last-pass", adminPass);

    peer?.destroy();
    state = "connecting";
    authenticated = false;
    setControlsEnabled(false);
    paintStatus();

    peer = new Peer({ debug: 0 });

    peer.on("open", () => {
      conn = peer!.connect(peerIdFor(currentSession), { reliable: true });

      conn.on("open", () => {
        state = "open";
        net.textContent = "Connected to host room. Authenticating...";
        // Request Admin Access with Passcode
        send({
          type: "auth_request",
          token: adminPass,
          clientName: "Admin (" + navigator.platform + ")",
        });

        if (pingInterval) clearInterval(pingInterval);
        pingInterval = window.setInterval(() => {
          if (conn?.open) send({ type: "ping", ts: Date.now() });
        }, 3000);
      });

      conn.on("data", (raw) => {
        const msg = parseMsg(raw);
        if (!msg) return;

        if (msg.type === "pong" && msg.ts) {
          pingMs = Date.now() - msg.ts;
          paintStatus();
        }

        if (msg.type === "auth_response") {
          if (msg.success) {
            authenticated = true;
            setControlsEnabled(true);
            net.textContent = "Authorized Admin Connected";
          } else {
            authenticated = false;
            setControlsEnabled(false);
            net.textContent = msg.error || "Authentication failed";
            alert(`Admin Login Failed: ${msg.error}`);
          }
          paintStatus();
        }

        if (msg.type === "status") {
          lastStatus = msg as unknown as Record<string, unknown>;
          if (msg.authenticated !== undefined) {
            authenticated = Boolean(msg.authenticated);
            setControlsEnabled(authenticated);
          }
          paintStatus();
        }
      });

      conn.on("close", () => {
        state = "closed";
        authenticated = false;
        setControlsEnabled(false);
        if (pingInterval) clearInterval(pingInterval);
        stopAll();
        paintStatus();
      });
    });

    peer.on("error", (err) => {
      state = `error: ${err.type ?? err.message}`;
      authenticated = false;
      setControlsEnabled(false);
      paintStatus();
    });
  };

  // Disconnect button
  disconnectBtn.addEventListener("click", () => {
    stopAll();
    conn?.close();
    peer?.destroy();
    state = "disconnected";
    authenticated = false;
    setControlsEnabled(false);
    paintStatus();
  });

  // Inputs
  joinBtn.addEventListener("click", connect);
  panicStop.addEventListener("click", stopAll);
  manualStop.addEventListener("click", stopAll);
  fire.addEventListener("click", () => sendRumble());

  weakInput.addEventListener("input", (e) => {
    weak = Number((e.target as HTMLInputElement).value) / 100;
    paintMotors();
  });

  strongInput.addEventListener("input", (e) => {
    strong = Number((e.target as HTMLInputElement).value) / 100;
    paintMotors();
  });

  durInput.addEventListener("input", (e) => {
    duration = Number((e.target as HTMLInputElement).value);
    paintMotors();
  });

  multiplierInput.addEventListener("input", (e) => {
    const val = Number((e.target as HTMLInputElement).value);
    masterMultiplier = val / 100;
    multiplierLabel.textContent = `${masterMultiplier.toFixed(1)}x (${val}%)`;
    paintMotors();
  });

  root.querySelector("#home")!.addEventListener("click", () => {
    stopAll();
    conn?.close();
    peer?.destroy();
    location.hash = "#/";
  });

  paintMotors();
  paintStatus();

  if (currentSession) {
    connect();
  }
}

