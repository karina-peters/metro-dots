import { Observable, defer, interval, take, tap, takeUntil, count, finalize } from "rxjs";
import { FONT_HEIGHT } from "./dotFont.ts";
import { BoardDefault } from "../config/board.config.ts";
import { OffsetAnimationOptions, SlideDirection } from "../models/animation.model.ts";

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
      return FONT_HEIGHT + BoardDefault.PaddingY + BoardDefault.MessageMargin;
    case SlideDirection.Left:
    case SlideDirection.Right:
      return board.columns;
  }
}

export function slideDisplacement(direction: SlideDirection, remaining: number) {
  const vector = DIRECTION_VECTOR[direction];
  return { x: -vector.x * remaining, y: -vector.y * remaining };
}

export class OffsetAnimation {
  private _active = false;
  private _progress = 0;
  private _distance = 0;

  constructor(
    private readonly opts: OffsetAnimationOptions,
    private readonly onFrame: () => void,
    private readonly until$: Observable<unknown>,
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
