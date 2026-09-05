import { renderHost } from "./host";
import { renderRemote } from "./remote";

const app = document.querySelector("#app")!;

function renderHome() {
  app.innerHTML = `
    <div class="top">
      <div>
        <div class="brand">touch · pulse · connect</div>
        <h1>Intimate Touch</h1>
        <p class="sub">A private space to share touch, rhythm, and gentle sensations from anywhere.</p>
      </div>
    </div>
    <section class="panel">
      <h2>How It Works</h2>
      <p class="hint" style="line-height:1.6">
        One partner connects their controller over Bluetooth and keeps this screen nearby. The other partner controls the sensations, rhythms, and sends sweet messages directly to their screen.
      </p>
    </section>
    <section class="panel choice">
      <h2>Select Your Role</h2>
      <button id="host">
        🌸 Holding The Controller
        <small>Pair your controller, relax, and keep this screen open to receive touch.</small>
      </button>
      <button class="secondary" id="remote">
        ✨ The Touch Controller
        <small>Connect with your private passcode to send sensations, vibrations & sweet messages.</small>
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
