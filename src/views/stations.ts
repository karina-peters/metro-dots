import { BehaviorSubject, timer, Subscription, switchMap, from, map, combineLatest, distinctUntilChanged, catchError, of } from "rxjs";
import p5 from "p5";

import { REFRESH_RATE, metroSystem } from "../helpers/system.ts";
import { getElement } from "../helpers/utils.ts";
import type { Arrival } from "../models/system.model.ts";

import TableBoard from "../components/tableBoard.ts";

const HEADING_TEXT = "Stations";
const ERROR_MSG_ARRAY = [":(", "", "Error", "?"];
const EMPTY_MSG_ARRAY = [":)", " ", "No trains!", " "];
const HEADER_ARRAY = ["LINE", "CAR", "DEST", "MIN"];
const DEFAULT_ID = "college-park-u-of-md";
const DEFAULT_PLATFORM = "E09";
const DEFAULT_TRACK: Track = 1;

enum ActionType {
  ChangeStation,
  SwitchPlatform,
  SwitchTrack,
}

type Action =
  | { type: ActionType.ChangeStation; stationId: string }
  | { type: ActionType.SwitchPlatform }
  | { type: ActionType.SwitchTrack };

type Track = 1 | 2;

type Selection = {
  stationId: string;
  platformCode: string;
  track: Track;
};

const selection$ = new BehaviorSubject<Selection>({
  stationId: DEFAULT_ID,
  platformCode: DEFAULT_PLATFORM,
  track: DEFAULT_TRACK,
});

let stationBoard: TableBoard | null = null;
let subscription = new Subscription();

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

/**
 * Renders the station view and initializes its board and subscriptions.
 */
export function render(): void {
  getElement(".header-target .heading-text").textContent = HEADING_TEXT;
  getElement(".content-target").innerHTML = template();

  renderStationList();
  attachEventListeners();

  // Construct board from the current selection
  const { track } = selection$.value;
  const boardTarget: HTMLElement = getElement(".board-target");
  const board = new TableBoard(boardTarget, HEADER_ARRAY, [], track);
  new p5(board.sketch, boardTarget);
  stationBoard = board;

  // Handle selection changes and data updates
  subscription.unsubscribe();
  subscription = subscribeToSelectionChanges();
  subscription.add(subscribeToDataUpdates(board));
}

/**
 * Stops reactive updates and destroys the current station board.
 */
export function pause(): void {
  subscription.unsubscribe();
  stationBoard?.destroy$.next();
  stationBoard = null;
}

function attachEventListeners(): void {
  const trackButton = getElement(".btn-tracks");
  trackButton.addEventListener("click", () => dispatchAction({ type: ActionType.SwitchTrack }));

  const platformButton = getElement(".btn-platforms");
  platformButton.addEventListener("click", () => dispatchAction({ type: ActionType.SwitchPlatform }));

  const listElement = getElement(".list-target");
  listElement.addEventListener("click", (event) => {
    const stationButton = (event.target as Element).closest<HTMLElement>(".btn-station");
    const stationId = stationButton?.dataset.stationId;
    if (stationId) {
      dispatchAction({ type: ActionType.ChangeStation, stationId });
    }
  });
}

/**
 * Applies an action to the current selection and emits the new state if changed.
 *
 * @param action - The action to apply.
 */
function dispatchAction(action: Action): void {
  const current = selection$.value;
  const next = updateSelection(current, action);

  if (next !== current) {
    selection$.next(next);
  }
}

/**
 * Updates the selection state for the given user action.
 *
 * Switching stations resets the platform to the station's first code (e.g. "E09").
 * Platform switching has no effect when the station has only one code.
 *
 * @param selection - The current selection state.
 * @param action - The user action to apply.
 * @returns The updated selection, or the original object if no change is needed.
 */
function updateSelection(selection: Selection, action: Action): Selection {
  switch (action.type) {
    case ActionType.ChangeStation: {
      if (action.stationId === selection.stationId) {
        return selection;
      }

      const station = metroSystem.getStation(action.stationId);
      return { ...selection, stationId: station.id, platformCode: station.codes[0] };
    }

    case ActionType.SwitchTrack:
      return { ...selection, track: selection.track === 1 ? 2 : 1 };

    case ActionType.SwitchPlatform: {
      const { codes } = metroSystem.getStation(selection.stationId);
      if (codes.length < 2) {
        return selection;
      }

      const next = codes[(codes.indexOf(selection.platformCode) + 1) % codes.length];
      return { ...selection, platformCode: next };
    }
  }
}

/**
 * Polls the API for the latest train positions.
 * Converts fetch failures to null so polling can continue.
 */
function pollArrivals(stationId: string) {
  return timer(0, REFRESH_RATE).pipe(
    switchMap(() =>
      from(metroSystem.fetchArrivals(stationId)).pipe(
        catchError(() => {
          return of(null);
        }),
      ),
    ),
  );
}

/**
 * Updates the station label, selected station button, and platform switch
 * visibility whenever the selected station changes.
 *
 * @returns The subscription that manages these UI updates.
 */
function subscribeToSelectionChanges() {
  return selection$
    .pipe(
      map((s) => s.stationId),
      distinctUntilChanged(),
    )
    .subscribe((id) => {
      const station = metroSystem.getStation(id);

      getElement(".station-label").textContent = station.name;
      getElement(".btn-platforms").toggleAttribute("hidden", station.codes.length < 2);
      getElement(".btn-station.selected").classList.remove("selected");
      getElement(`.btn-station[data-station-id="${CSS.escape(id)}"]`).classList.add("selected");
    });
}

/**
 * Polls arrival data for the selected station and updates the board when
 * arrivals, track selection, or platform selection changes.
 *
 * Switching stations restarts polling for the new station.
 *
 * @param board - The station board to update.
 * @returns The subscription that manages polling and board updates.
 */
function subscribeToDataUpdates(board: TableBoard) {
  return selection$
    .pipe(
      map((selection) => selection.stationId),
      distinctUntilChanged(),
      switchMap((stationId) =>
        combineLatest([selection$, pollArrivals(stationId)]).pipe(
          map(([selection, arrivals]) => ({
            dataId: selection.stationId,
            messageTable: getMessageTable(selection.platformCode, selection.track, arrivals),
          })),
        ),
      ),
    )
    .subscribe((data) => board.data$.next(data));
}

/**
 * Builds the message rows displayed on the station board.
 *
 * Returns an error row when arrival data is unavailable, or an empty-state
 * row when no arrivals match the selected platform and track.
 *
 * @param platformCode - The selected station platform code.
 * @param trackIndex - The selected track number.
 * @param arrivals - Arrival data indexed by platform and track, or null if unavailable.
 * @returns The rows to display on the station board.
 */
function getMessageTable(platformId: string, trackIndex: number, arrivals: Map<string, Map<string, Arrival[]>> | null) {
  const platform = arrivals?.get(platformId);
  if (!platform) {
    return [ERROR_MSG_ARRAY];
  }

  const group = platform.get(String(trackIndex));
  if (!group?.length) {
    return [EMPTY_MSG_ARRAY];
  }

  return group.map(({ line, numCars, destName, min }) => [line, numCars, destName, min]);
}

function renderStationList() {
  try {
    const listTarget = getElement(".list-target");

    for (const station of metroSystem.getStations()) {
      const button = document.createElement("button");
      button.classList.add("btn-dark", "btn-station");
      button.textContent = station.name;
      button.dataset.stationId = station.id;

      listTarget.appendChild(button);

      if (station.id === DEFAULT_ID) {
        button.classList.add("selected");
      }
    }
  } catch (error) {
    console.error("Failed to draw station list:", error);
    const container = getElement(".list-target");
    container.innerHTML = `<div class="error">Failed to load station data</div>`;
  }
}
