import { navigateTo } from "../helpers/state.js";

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

(() => {
  // Fetch data
  // etc.
})();

export const render = () => {
  // Render heading text
  const textElement = document.querySelector(".header-target .heading-text");
  textElement.textContent = headingText;

  // Render template
  const container = document.querySelector(".content-target");
  container.innerHTML = template();

  attachEventListeners();
};

/**
 * Attaches all required event listeners
 */
const attachEventListeners = () => {
  // Stations
  const stationButton = document.querySelector("#btn-stn");
  stationButton.addEventListener("click", () => {
    navigateTo("station");
  });

  // Trains
  const trainButton = document.querySelector("#btn-train");
  trainButton.addEventListener("click", () => {
    navigateTo("train");
  });

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
