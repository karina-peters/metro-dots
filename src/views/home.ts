import { navigateTo } from "../helpers/state.ts";
import { getElement } from "../helpers/utils.ts";

const headingText = "Home";
const template = () => {
  return `
    <div class="hero">
      <div class="wrapper">
        <h1 class="title">Metro Dots</h1>
        <div class="button-wrapper">
          <button id="btn-stn">Stations</button>
          <button id="btn-train">Trains</button>
          <!-- <button id="btn-map" disabled>Map</button>
          <button id="btn-line" disabled>Lines</button> -->
        </div>
      </div>
    </div>
  `;
};

export function render() {
  getElement(".header-target .heading-text").textContent = headingText;
  getElement(".content-target").innerHTML = template();

  attachEventListeners();
}

const attachEventListeners = () => {
  // Stations
  const stationButton = getElement("#btn-stn");
  stationButton.addEventListener("click", () => navigateTo("station"));

  // Trains
  const trainButton = getElement("#btn-train");
  trainButton.addEventListener("click", () => navigateTo("train"));

  // // Lines
  // const lineButton = document.querySelector("#btn-line");
  // lineButton.addEventListener("click", () => {
  //   navigateTo("line");
  // });

  // // Map
  // const mapButton = document.querySelector("#btn-map");
  // mapButton.addEventListener("click", () => {
  //   navigateTo("map");
  // });
};
