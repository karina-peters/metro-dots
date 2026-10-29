import "./styles/map.css";
import "./styles/trains.css";
import "./styles/stations.css";
import "./styles/home.css";
import "./styles.css";

import { state$ } from "./helpers/state.ts";
import { metroSystem } from "./services/system.ts";

import { render as renderHome } from "./views/home.ts";
import { pause as pauseStations, render as renderStations } from "./views/stations.ts";
import { pause as pauseTrains, render as renderTrains } from "./views/trains.ts";
import { getElement } from "./helpers/utils.ts";

import type { State } from "./models/state.model.ts";
import type { View } from "./models/app.model.ts";
// import { pause as pauseMap, render as renderMap } from "./views/map.js";
// import { render as renderLines } from "./views/lines.js";

const views = new Map<string, View>([
  ["home", { render: renderHome, route: "/" }],
  ["station", { render: renderStations, pause: pauseStations, route: "/stations" }],
  ["train", { render: renderTrains, pause: pauseTrains, route: "/trains" }],
  // ["map", { render: renderMap, pause: pauseMap, route: "/map" }],
  // ["line", { render: renderLines, route: "/lines" }],
]);

let currentViewId = "";

function renderFatalError(message: string): void {
  const el = document.createElement("p");
  el.className = "fatal-error";
  el.textContent = message;
  document.body.replaceChildren(el);
}

async function main() {
  try {
    await metroSystem.init();
  } catch (err) {
    console.error(err);
    renderFatalError("Couldn't load station data. Please refresh.");
    return;
  }

  // Handle back button
  getElement(".btn-back").addEventListener("click", () => window.history.back());
  window.addEventListener("popstate", (event) => {
    if (event.state) {
      state$.next(event.state as State);
    }
  });

  // Render new view on state change
  state$.subscribe(async (state: State) => {
    const newView = views.get(state.viewId);
    if (newView && state.viewId !== currentViewId) {
      // Pause current view, if needed
      const currentView = views.get(currentViewId);
      if (currentView && currentView.pause?.()) {
        currentView.pause();
      }

      // Show/hide header
      const header = getElement(".header-target");
      header.toggleAttribute("hidden", state.viewId === "home");

      // Render new view
      newView.render();
      currentViewId = state.viewId;

      // Update browser history
      if ((history.state as State)?.viewId !== state.viewId) {
        const historyMethod = history.state ? "pushState" : "replaceState";
        history[historyMethod](state, "", newView.route);
      }
    }
  });

  // Set default view
  state$.next({ viewId: "home" });
}

document.addEventListener("DOMContentLoaded", main);
