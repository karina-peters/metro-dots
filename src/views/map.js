// import { REGIONS, REFRESH_RATE, metroSystem } from "../helpers/system.js";
// import { Subject, takeUntil, timer, merge } from "rxjs";
// // import MapSketch from "../components/mapSketch.js";
// // import p5 from "p5";

// const manualRefresh$ = new Subject();
// const pauseRefresh$ = new Subject();
// const dataWrapperId = "map-wrapper";
// const headingText = "Map";

// const controlStates = {
//   regionId: REGIONS.ALL,
//   showLabels: false,
// };

// // Define component template
// const template = () => `
//   <div class="controls-wrapper">
//     <div class="region-control">
//       <label for="region-select">Map Region: </label>
//       <select name="regions" id="region-select">
//         <option value="${REGIONS.ALL}" ${controlStates.regionId === REGIONS.ALL ? "selected" : ""}>${REGIONS.ALL}</option>
//         <option value="${REGIONS.DC}" ${controlStates.regionId === REGIONS.DC ? "selected" : ""}>${REGIONS.DC}</option>
//       </select>
//     </div>
//     <div class="label-control">
//       <input type="checkbox" id="labels-check" name="labels-check" ${controlStates.showLabels ? "checked" : ""}/>
//       <label for="labels-check">Show station labels</label>
//     </div>
//   </div>
//   <div id=${dataWrapperId}></div>
// `;

// /**
//  * Render component template and setup event listeners
//  */
// export const render = async () => {
//   // Render heading
//   const textElement = document.querySelector(".header-target .heading-text");
//   textElement.textContent = headingText;

//   // Render main template
//   const container = document.querySelector(".content-target");
//   container.innerHTML = template();

//   // Refresh content
//   merge(timer(0, REFRESH_RATE), manualRefresh$)
//     .pipe(takeUntil(pauseRefresh$))
//     .subscribe(async () => {
//       await drawMap();
//     });

//   // Setup event listeners
//   attachEventListeners();
// };

// /**
//  * Pauses component updates
//  */
// export const pause = () => {
//   pauseRefresh$.next();
// };

// /**
//  * Attaches all required event listeners
//  */
// const attachEventListeners = () => {
//   // Region selector
//   const regionSelect = document.querySelector("#region-select");
//   regionSelect.addEventListener("change", () => {
//     controlStates.regionId = regionSelect.value;
//     manualRefresh$.next();
//   });

//   // Labels checkbox
//   const labelsInput = document.querySelector("#labels-check");
//   labelsInput.addEventListener("change", () => {
//     controlStates.showLabels = labelsInput.checked;
//     manualRefresh$.next();
//   });
// };

// /**
//  * Draws map with current train positions
//  */
// const drawMap = async () => {
//   try {
//     const circuits = await metroSystem.getCircuits(controlStates.regionId);
//     const trainPositions = await metroSystem.fetchTrainPositions();
//     const outputList = await formatMetroLines(circuits, trainPositions);
//     const container = document.querySelector(`#${dataWrapperId}`);
//     container.innerHTML = `
//       <ul class="metro-lines">
//         ${outputList.map((line) => `<li>${line}</li>`).join("")}
//       </ul>
//     `;
//   } catch (error) {
//     console.error("Failed to draw map:", error);
//     const container = document.querySelector(`#${dataWrapperId}`);
//     container.innerHTML = `<div class="error">Failed to load map data</div>`;
//   }
// };

// const formatMetroLines = async (cktsByLine, trainPositions) => {
//   return Promise.all(
//     cktsByLine.map(async (line) => {
//       const circuitList = await Promise.all(line.circuits.map(async (ckt) => getMapSymbol(ckt, line.lineId, trainPositions)));

//       return `${line.lineId}: ${circuitList.join("")}`;
//     })
//   );
// };

// const getMapSymbol = async (circuit, lineId, trainPositions) => {
//   const hasTrainInCircuit = trainPositions.some(
//     ({ CircuitId, LineCode, DirectionNum }) => CircuitId === circuit.id && metroSystem.getLineId(LineCode, DirectionNum) === lineId
//   );
//   const circuitIndicator = hasTrainInCircuit ? "|" : "·";

//   let stationIndicator = "";
//   if (circuit.stnCode && controlStates.showLabels) {
//     stationIndicator = ` ${await metroSystem.getStationName(circuit.stnCode)}`;
//   }

//   return `${circuitIndicator}${stationIndicator}`;
// };
