import { concat, defer, finalize, Observable, take, takeUntil, tap, timer } from "rxjs";
import { BlinkMode } from "../models/animation.model.ts";

export class Blinker {
  private mode: BlinkMode | null = null;
  private rows = new Set<number>();
  private off = false;
  private greyedRow: number | null = null;

  constructor(
    private opts: { intervalMs: number; count: number; greyHoldMs: number },
    private onFrame: () => void,
    private readonly until$: Observable<void>,
  ) {}

  isGreyed(row: number) {
    return this.greyedRow === row;
  }

  isBlanked(row: number, col: number, updateCol: number | null) {
    if (!this.off || !this.rows.has(row)) return false;
    return this.mode === BlinkMode.Row || col === updateCol;
  }

  blink$(mode: BlinkMode, rows: number[]): Observable<number> {
    return defer(() => {
      this.mode = mode;
      this.rows = new Set(rows);
      return timer(0, this.opts.intervalMs).pipe(
        take(this.opts.count * 2),
        tap((i) => {
          this.off = i % 2 === 0;
          this.onFrame();
        }),
        takeUntil(this.until$),
        finalize(() => {
          this.mode = null;
          this.rows.clear();
          this.off = false;
          this.onFrame();
        }),
      );
    });
  }

  dropRow$(row: number): Observable<number> {
    return concat(
      defer(() => {
        this.greyedRow = row;
        this.onFrame();
        return timer(this.opts.greyHoldMs);
      }),
      this.blink$(BlinkMode.Row, [row]),
    ).pipe(finalize(() => (this.greyedRow = null)));
  }
}
