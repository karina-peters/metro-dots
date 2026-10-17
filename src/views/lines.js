// import { metroSystem } from "../helpers/system.js";

// const headingText = "Lines";
// const template = () => {
//   return `
//       <div class=content-wrapper></div>
//     `;
// };

// (() => {
//   // Fetch data
//   // Handle state/routing
// })();

// export const render = async () => {
//   // Render heading text
//   const textElement = document.querySelector(".header-target .heading-text");
//   textElement.textContent = headingText;

//   // Render main template
//   const container = document.querySelector(".content-target");
//   container.innerHTML = template();

//   await processData();

//   // Draw async content
//   await drawLines();

//   attachEventListeners();
// };

// /**
//  * Attaches all required event listeners
//  */
// const attachEventListeners = () => {};

// // /**
// //  * Print a formatted list of circuit IDs and stations for each line to the provided container
// //  */
// const drawLines = async () => {
//   try {
//     const outputList = await metroSystem.fetchLines();

//     const container = document.querySelector(".content-wrapper");
//     container.innerHTML = `
//       <ul class="metro-lines">
//         ${outputList.map((line) => `<li>${line}</li>`).join("")}
//       </ul>
//     `;
//   } catch (error) {
//     console.error("Failed to draw lines:", error);
//     const container = document.querySelector(".content-wrapper");
//     container.innerHTML = `<div class="error">Failed to load line data</div>`;
//   }
// };

// const processData = async () => {
//   try {
//     const trains = await metroSystem.fetchTrainPositions();
//     const circuits = await metroSystem.fetchCircuits();

//     const lines = circuits.map((line) => {
//       return line.circuits.map((circuit) => {
//         const trainsInCircuit = trains.filter(
//           ({ CircuitId, LineCode, DirectionNum }) =>
//             CircuitId === circuit.id && metroSystem.getLineId(LineCode, DirectionNum) === line.lineId
//         );

//         return { sequenceNum: circuit.seqNum, circuitId: circuit.id, trainCount: trainsInCircuit.length };
//       });
//     });

//     console.log(lines);
//   } catch (error) {
//     console.error("Failed to draw lines:", error);
//     const container = document.querySelector(".content-wrapper");
//     container.innerHTML = `<div class="error">Failed to load line data</div>`;
//   }
// };
