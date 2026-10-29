import { Observable, defer, interval, take, tap, takeUntil, count, finalize } from "rxjs";
import { FONT_HEIGHT } from "./dotFont.ts";
import { DefaultBoardConfig, MessageBoardConfig } from "../config/board.config.ts";
import { SlideDirection, SlidePhase } from "../models/animation.model.ts";

export interface OffsetAnimationOptions {
  intervalMs: number;
  step: number;
}

const DIRECTION_VECTOR: Record<SlideDirection, { x: number; y: number }> = {
  [SlideDirection.Up]: { x: 0, y: -1 },
  [SlideDirection.Down]: { x: 0, y: 1 },
  [SlideDirection.Left]: { x: -1, y: 0 },
  [SlideDirection.Right]: { x: 1, y: 0 },
};

export function slideDistance(direction: SlideDirection, board: { columns: number }): number {
  switch (direction) {
    case SlideDirection.Up:
    case SlideDirection.Down:
      return FONT_HEIGHT + MessageBoardConfig.PaddingY + DefaultBoardConfig.MessageMargin;
    case SlideDirection.Left:
    case SlideDirection.Right:
      return board.columns;
  }
}

export function slideDisplacement(direction: SlideDirection, mode: SlidePhase, progress: number, remaining: number) {
  const vector = DIRECTION_VECTOR[direction];
  const offset = mode === SlidePhase.In ? -remaining : progress;

  return { x: vector.x * offset, y: vector.y * offset };
}

export class OffsetAnimation {
  private _active = false;
  private _progress = 0;
  private _distance = 0;

  constructor(
    private readonly opts: OffsetAnimationOptions,
    private readonly onFrame: () => void,
    private readonly until$: Observable<void>,
  ) {}

  get active() {
    return this._active;
  }

  get progress() {
    return this._progress;
  }

  get remaining() {
    return Math.max(0, this._distance - this._progress);
  }

  run$(distance: number): Observable<number> {
    return defer(() => {
      this._distance = distance;
      this._progress = 0;
      this._active = true;

      return interval(this.opts.intervalMs).pipe(
        take(Math.ceil(distance / this.opts.step)),
        tap(() => {
          this._progress = Math.min(distance, this._progress + this.opts.step);
          this.onFrame();
        }),
        takeUntil(this.until$),
        count(),
        finalize(() => {
          this._active = false;
          this._progress = 0;
          this.onFrame();
        }),
      );
    });
  }
}
