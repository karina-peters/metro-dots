import { BehaviorSubject, Subscription, timer, combineLatest, switchMap, from, catchError, of, distinctUntilChanged } from "rxjs";
import p5 from "p5";

import { metroSystem, REFRESH_RATE } from "../helpers/system.ts";
import { getElement } from "../helpers/utils.ts";
import type { Train } from "../models/system.model.ts";

import MessageBoard from "../components/messageBoard.ts";

const HEADING_TEXT = "Trains";
const EMPTY_MSG = "No trains running!";
const ERROR_MSG = "Data fetch error :(";

const selectedId$ = new BehaviorSubject<string>("");

let trainBoard: MessageBoard | null = null;
let subscription = new Subscription();

const template = () => {
  return `
    <div class="train-label"></div>
    <div class="board-target"></div>
    <div class="list-target"></div>
  `;
};

/**
 * Renders the train view, initializes the board, and starts updates.
 */
export function render(): void {
  getElement(".header-target .heading-text").textContent = HEADING_TEXT;
  getElement(".content-target").innerHTML = template();

  attachEventListeners();

  // Construct board
  const boardTarget: HTMLElement = getElement(".board-target");
  const board = new MessageBoard(boardTarget, [], "", "");
  new p5(board.sketch, boardTarget);
  trainBoard = board;

  // Handle selection changes and data updates
  subscription.unsubscribe();
  subscription = subscribeToSelectionChanges();
  subscription.add(subscribeToDataUpdates(board));
}

/**
 * Stops reactive updates and destroys the current train board.
 */
export function pause(): void {
  subscription.unsubscribe();
  trainBoard?.destroy$.next();
  trainBoard = null;
}

function attachEventListeners() {
  getElement(".list-target").addEventListener("click", (event) => {
    const trainButton = (event.target as Element).closest<HTMLElement>(".btn-train");
    const trainId = trainButton?.dataset.trainId;

    if (trainId && trainId !== selectedId$.value) {
      selectedId$.next(trainId);
    }
  });
}

/**
 * Polls the API for the latest train positions.
 * Converts fetch failures to null so polling can continue.
 */
function pollTrains() {
  return timer(0, REFRESH_RATE).pipe(
    switchMap(() =>
      from(metroSystem.fetchTrains()).pipe(
        catchError(() => {
          return of(null);
        }),
      ),
    ),
  );
}

/**
 * Updates the train label and selected train button whenever the selected train changes.
 *
 * @returns The subscription that manages these UI updates.
 */
function subscribeToSelectionChanges() {
  return selectedId$.pipe(distinctUntilChanged()).subscribe((id) => {
    getElement(".train-label").textContent = id ? `Train ${id}` : "";
    getElement(".btn-train.selected").classList.remove("selected");
    getElement(`.btn-train[data-train-id="${CSS.escape(id)}"]`).classList.add("selected");
  });
}

/**
 * Combines the selected train with the latest train positions,
 * then builds the messages displayed on the board.
 */
function subscribeToDataUpdates(board: MessageBoard): Subscription {
  return combineLatest([selectedId$, pollTrains()])
    .pipe(
      switchMap(async ([selectedId, trains]) => {
        const selected = trains?.find((train) => train.id === selectedId) ?? trains?.[0] ?? null;
        const messages = getMessageList(trains, selected);

        return { trains, selected, messages };
      }),
    )
    .subscribe(({ trains, selected, messages }) => {
      if (trains !== null) {
        renderTrainList(trains, selected?.id ?? null);
      }

      board.data$.next({ messages, lineCode: selected?.lineCode, trainId: selected?.id });
    });
}

/**
 * Builds display messages describing a train's destination and position.
 *
 * @param train - The selected train.
 * @returns The messages to display on the board.
 */
function getMessageList(trainList: Train[] | null, selected: Train | null): string[] {
  if (!trainList || !selected) {
    return [ERROR_MSG];
  } else if (trainList.length === 0) {
    return [EMPTY_MSG];
  }

  const messages: string[] = [];

  // e.g. [DESTINATION, GREENBELT]
  const destination = metroSystem.getStationName(selected.destStnCode);
  if (destination) {
    messages.push("Destination", destination);
  }

  // e.g. [THIS IS, METRO CENTER]
  const nextStationCircuit = metroSystem.getNextStationCircuit(selected.circuitId, selected.lineCode, selected.direction);
  if (nextStationCircuit) {
    const stationName = metroSystem.getStationName(nextStationCircuit.stnCode ?? "");
    const positionPhrase = nextStationCircuit.id === selected.circuitId ? "This is" : "Next stop is";

    messages.push(positionPhrase, stationName);
  } else {
    messages.push("Position unknown");
  }

  return messages;
}

/**
 * Renders the train buttons and marks the selected train.
 */
function renderTrainList(trains: Train[], selectedId: string | null): void {
  const list: HTMLElement = getElement(".list-target");

  const key = trains.map((t) => t.id).join(",");
  if (list.dataset.key === key) {
    return;
  } else {
    list.dataset.key = key;
  }

  list.replaceChildren(
    ...trains.map((train) => {
      const button = document.createElement("button");
      button.classList.add("btn-dark", "btn-train", `line-${train.lineCode}`);
      button.dataset.trainId = train.id;
      button.textContent = train.id;

      if (train.id === selectedId) {
        button.classList.add("selected");
        getElement(".train-label").textContent = `Train ${selectedId}`;
      }

      return button;
    }),
  );
}
