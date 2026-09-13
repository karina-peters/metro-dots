import { merge, Subject, takeUntil, timer } from "rxjs";
import p5 from "p5";

import { REFRESH_RATE } from "../helpers/system.js";
import { metroSystem } from "../helpers/system.js";
import { getOrInitializeMapValue } from "../helpers/helpers.js";

import StationBoard from "../components/stationBoard.js";

const headingText = "Stations";
const errorMsg = [":(", "", "Error", ""];
const emptyMsg = [":)", "", "No trains!", ""];

const manualRefresh$ = new Subject();
const pauseRefresh$ = new Subject();
const timer$ = timer(0, REFRESH_RATE).pipe(takeUntil(pauseRefresh$));

// Store board instances in a map by group ID
const header = ["LINE", "CAR", "DEST", "MIN"];
let stationBoard = null;
let selectedId = "E09"; // All
let selectedCodes = ["E09"];
let selectedTrack = 1;
let selectedPlatform = 0;
let stations = [];
let arrivals = new Map();

const template = () => {
  return `
  <div class="station-label"></div>
  <div class="board-target"></div>
  <div class="switch-target">
    <button class="btn-tracks">Switch Tracks</button>
    <button class="btn-platforms" hidden>Switch Platforms</button>
  </div>
  <div class="list-target"></div>
`;
};

export const render = async () => {
  // Render heading
  const textElement = document.querySelector(".header-target .heading-text");
  textElement.textContent = headingText;

  // Render main template
  const container = document.querySelector(".content-target");
  container.innerHTML = template();

  // Draw async content
  await drawStationBoard(selectedTrack);
  await drawStationList();

  attachEventListeners();
};

/**
 * Pauses component updates
 */
export const pause = () => {
  stationBoard.destroy$.next();
  pauseRefresh$.next();
};

/**
 * Attaches all required event listeners
 */
const attachEventListeners = () => {
  const trackButton = document.querySelector(".btn-tracks");
  trackButton.addEventListener("click", () => {
    selectedTrack = selectedTrack === 1 ? 2 : 1; // This is 1-indexed to match the track keys in the data
    manualRefresh$.next();
  });

  const platformButton = document.querySelector(".btn-platforms");
  platformButton.addEventListener("click", () => {
    selectedPlatform = selectedPlatform === 0 ? 1 : 0;
    manualRefresh$.next();
  });
};

/**
 * Draw a station board
 */
const drawStationBoard = async () => {
  try {
    const boardTarget = document.querySelector(`.board-target`);
    let msgTable = [];

    // Draw board with p5.js
    stationBoard = new StationBoard(boardTarget, header, msgTable, selectedId, 1);
    new p5(stationBoard.sketch, boardTarget);

    arrivals = await getUpdatedArrivals();

    // Update table for selected station group
    merge(timer$, manualRefresh$).subscribe(async () => {
      const station = stations.entries().find(([_, value]) => selectedId === getStationId(value));
      const labelTarget = document.querySelector(".station-label");
      labelTarget.textContent = `${station[0]}`;

      arrivals = await getUpdatedArrivals();

      if (arrivals === null || selectedCodes === null || selectedPlatform === null || selectedTrack === null) {
        msgTable = [errorMsg];
      } else if (arrivals.length === 0) {
        msgTable = [emptyMsg];
      } else {
        const platformButton = document.querySelector(".btn-platforms");
        if (station[1].length > 1) {
          platformButton.removeAttribute("hidden");
        } else {
          platformButton.setAttribute("hidden", true);
        }

        msgTable = getCurrentMsgTable(selectedCodes[selectedPlatform], selectedTrack);
      }

      stationBoard.data$.next({ msgTable, stationId: selectedId });
    });
  } catch (error) {
    console.error(`Failed to draw station board ${selectedTrack}:`, error);
    const container = document.querySelector(`.board-target#board-${selectedTrack}`);
    container.innerHTML = `<div class="error">Failed to load position data</div>`;
  }
};

const drawStationList = async () => {
  try {
    const listTarget = document.querySelector(".list-target");

    for (const station of stations) {
      const stationId = getStationId(station[1]);

      const button = document.createElement("button");
      button.id = `ID${stationId}`;
      button.classList.add("btn-dark", "btn-station");
      button.textContent = station[0];
      button.value = stationId;

      button.addEventListener("click", (event) => {
        if (event.currentTarget.value !== selectedId) {
          selectButton(event.currentTarget.value, station[1]);

          manualRefresh$.next();
        }
      });

      listTarget.appendChild(button);
    }

    // Select the button with the default selected id
    const defaultStation = stations.entries().find(([_, value]) => selectedId === getStationId(value));
    selectButton(selectedId, defaultStation[1]);
  } catch (error) {
    console.error("Failed to draw station list:", error);
    const container = document.querySelector(".list-target");
    container.innerHTML = `<div class="error">Failed to load station data</div>`;
  }
};

/**
 * Fetch updated arrivals data
 */
// TODO: we don't really need to recreate this map every time, just update the inner arrays
const getUpdatedArrivals = async () => {
  const arrivalMap = new Map();

  try {
    const arrivalData = await metroSystem.fetchArrivals(selectedCodes);

    for (const arrival of arrivalData) {
      const stnCodeToGroup = getOrInitializeMapValue(arrivalMap, arrival.LocationCode, new Map());
      const arrivals = getOrInitializeMapValue(stnCodeToGroup, arrival.Group, []);

      arrivals.push(arrival);
    }

    return arrivalMap;
  } catch {
    return null;
  }
};

const getStations = async () => {
  try {
    const stationData = await metroSystem.fetchStations();
    const stationMap = new Map();

    for (const station of stationData) {
      const stationCodes = getOrInitializeMapValue(stationMap, station.name, []);
      stationCodes.push(station.code);
    }

    return stationMap;
  } catch {
    return null;
  }
};

/**
 * Constructs a nested array of arrival messages based on data for the provided station id
 * @param {string} groupId - Group to display
 * @returns an Array of message strings
 */
const getCurrentMsgTable = (platformId, groupId) => {
  if (platformId === null || groupId === null || arrivals === null) {
    return [errorMsg];
  }

  const station = arrivals.get(platformId.toString());
  const group = station?.get(groupId.toString());

  return group ? group.map((a) => [a.Line, a.Car, a.Destination, a.Min]) : [[errorMsg]];
};

/**
 * Deselects currently selected station button and selects button for provided station code
 * @param {string} stationId - Station to display
 */
const selectButton = (stationId, stationCodes) => {
  // Unselect currently selected button if exists
  const selectedBtn = document.querySelector(".btn-station.selected");
  if (selectedBtn) {
    selectedBtn.classList.remove("selected");
  }

  // Select button for station <stationCode>
  const button = document.querySelector(`.btn-selected#ID${stationId}`);
  if (button) {
    button.classList.add("selected");
  }

  selectedId = stationId;
  selectedCodes = stationCodes;
};

const getStationId = (stnCodes) => {
  return Array.isArray(stnCodes) ? stnCodes.join("") : null;
};

(async () => {
  // Fetch data
  stations = await getStations();
})();
