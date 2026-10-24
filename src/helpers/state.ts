import { Subject } from "rxjs";
import type { State } from "../models/state.model.ts";

const state: State = { viewId: "" };

export const state$ = new Subject<State>();

export const navigateTo = (viewId: string) => {
  state.viewId = viewId;

  state$.next({ viewId });
};
