import { renderHost } from "./host";
import { renderRemote } from "./remote";
import { capabilities, isAndroidChrome } from "./util";

const app = document.querySelector("#app")!;

function renderHome() {
  const caps = capabilities();
  app.innerHTML = `
    <div class="top">
      <div>
        <div class="brand">ps5-vibe</div>
        <h1>Remote DualSense rumble</h1>
        <p class="sub">Android Chrome holds the Bluetooth gamepad. Any other browser with the room code can fire vibration.</p>
      </div>
    </div>
    <section class="panel">
      <h2>This device</h2>
      <div class="row">
        <span class="pill"><span class="dot ${caps.secure ? "ok" : "bad"}"></span>Secure context ${caps.secure ? "yes" : "no"}</span>
        <span class="pill"><span class="dot ${caps.gamepadApi ? "ok" : "bad"}"></span>Gamepad API</span>
        <span class="pill"><span class="dot ${caps.peerApi ? "ok" : "bad"}"></span>WebRTC</span>
        <span class="pill"><span class="dot ${isAndroidChrome() ? "ok" : "warn"}"></span>${isAndroidChrome() ? "Android Chrome" : "Not Android Chrome"}</span>
      </div>
      <p class="hint" style="margin-top:12px">
        Pair the PS5 controller in the phone’s Bluetooth settings first. The site uses the Gamepad API (not a hidden BLE hack), which is what Android Chrome actually supports for DualSense rumble.
      </p>
    </section>
    <section class="panel choice">
      <h2>Choose a role</h2>
      <button id="host">
        Host on this phone
        <small>Connect the DualSense here. Keep this tab open.</small>
      </button>
      <button class="secondary" id="remote">
        Remote control
        <small>Laptop or another phone. Enter the host’s room code.</small>
      </button>
    </section>
  `;
  app.querySelector("#host")!.addEventListener("click", () => {
    location.hash = "#/host";
  });
  app.querySelector("#remote")!.addEventListener("click", () => {
    location.hash = "#/remote";
  });
}

function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "host") {
    renderHost(app as HTMLElement);
    return;
  }
  if (parts[0] === "remote") {
    renderRemote(app as HTMLElement, parts[1] ?? "");
    return;
  }
  renderHome();
}

window.addEventListener("hashchange", route);
route();
