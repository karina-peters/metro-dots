import { Observable, defer, interval, of, take, tap, takeUntil, count, finalize } from "rxjs";
import { TypeMode } from "../models/animation.model.ts";

export interface TypewriterOptions {
  typeSpeedMs: number;
  eraseSpeedMs: number;
}

export type TypedRow = { cells: string[]; rowIndex: number };
type Step = { row: number; col: number; chars: number };

export class Typewriter {
  private row = 0;
  private col = 0;
  private chars = 0;
  private _active = true;

  constructor(
    private readonly opts: TypewriterOptions,
    private readonly onFrame: () => void,
    private readonly until$: Observable<void>,
  ) {}

  get active() {
    return this._active;
  }

  charLimit(row: number, col: number): number {
    if (!this._active) {
      return Infinity;
    }
    if (row !== this.row) {
      return row < this.row ? Infinity : 0;
    }
    if (col !== this.col) {
      return col < this.col ? Infinity : 0;
    }

    return this.chars;
  }

  run$(mode: TypeMode, rows: TypedRow[]): Observable<number> {
    return defer(() => {
      const steps = this.buildStepList(mode, rows);
      if (steps.length === 0) {
        return of(0);
      }

      const first = steps[0];
      this.row = first.row;
      this.col = first.col;
      this.chars = mode === TypeMode.In ? first.chars - 1 : first.chars + 1;
      this._active = true;

      return interval(mode === TypeMode.In ? this.opts.typeSpeedMs : this.opts.eraseSpeedMs).pipe(
        take(steps.length),
        tap((i) => {
          ({ row: this.row, col: this.col, chars: this.chars } = steps[i]);
          this.onFrame();
        }),
        takeUntil(this.until$),
        count(),
        finalize(() => {
          if (mode === TypeMode.In) this._active = false;
          this.onFrame();
        }),
      );
    });
  }

  /**
   * Build list of cursor positions: e.g. { row: 1, col: 0, chars: 0 },
   * @returns list of steps
   */
  private buildStepList(mode: TypeMode, rows: TypedRow[]): Step[] {
    const forwardSteps = rows.flatMap(({ cells, rowIndex }) =>
      cells.flatMap((text, col) => Array.from(text || "-", (_, k) => ({ row: rowIndex, col, chars: k + 1 }))),
    );
    const hiddenStep = { ...forwardSteps[0], chars: 0 };
    const steps = [hiddenStep, ...forwardSteps];

    return mode === TypeMode.In ? steps : steps.reverse();
  }
}
