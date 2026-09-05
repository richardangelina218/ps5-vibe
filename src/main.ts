import { renderHost } from "./host";
import { renderRemote } from "./remote";

const app = document.querySelector("#app")!;

function renderHome() {
  app.innerHTML = `
    <div class="top" style="justify-content:center;text-align:center">
      <div>
        <h1 style="font-size:28px">🎮 Pick Your Side ✨</h1>
      </div>
    </div>
    <section class="panel choice">
      <button id="host" class="role-btn-host">
        🎮 Controller Side
        <small>Connect your controller to receive vibrations</small>
      </button>
      <button class="secondary role-btn-remote" id="remote">
        ✨ Remote Side
        <small>Control sensations, patterns & send messages</small>
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
