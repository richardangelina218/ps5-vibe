import { renderHost } from "./host";
import { renderRemote } from "./remote";

const app = document.querySelector("#app")!;

function renderHome() {
  app.innerHTML = `
    <div class="top">
      <div>
        <div class="brand">✨ spark · vibe · giggle 💖</div>
        <h1>Vibey Touch Room 🎮✨</h1>
        <p class="sub">Your cozy, playful hideaway to share buzzes, sweet tingles & secret notes!</p>
      </div>
    </div>
    <section class="panel">
      <h2>🍓 How The Magic Works</h2>
      <p class="hint" style="line-height:1.7">
        One of you pairs a PS5 DualSense (or any controller) over Bluetooth and relaxes with this screen open. The other takes the magical remote controls to send tickles, waves, custom buzzes, and pop-up love notes! 💕
      </p>
    </section>
    <section class="panel choice">
      <h2>🎀 Pick Your Side</h2>
      <button id="host" class="role-btn-host">
        🧸 Holding The Controller (Receiver)
        <small>Pair your controller, get comfy, and let your partner buzz you with love! 🌸</small>
      </button>
      <button class="secondary role-btn-remote" id="remote">
        🪄 The Touch Wizard (Remote Controller)
        <small>Grab the steering wheel! Send custom rhythms, 2D pad tickles & messages ✨</small>
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
