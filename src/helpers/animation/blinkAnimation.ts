import { concat, defer, finalize, Observable, take, takeUntil, tap, timer } from "rxjs";
import { BlinkMode } from "@models/animation.model.ts";

export class Blinker {
  private mode: BlinkMode | null = null;
  private rows = new Set<number>();
  private off = false;
  private greyedRows: number[] = [];

  constructor(
    private opts: { intervalMs: number; count: number },
    private onFrame: () => void,
    private readonly until$: Observable<void>,
  ) {}

  isGreyed(row: number) {
    return this.greyedRows.includes(row);
  }

  isBlanked(row: number, col: number, updateCol: number | null) {
    if (!this.off || !this.rows.has(row)) {
      return false;
    }

    return this.mode === BlinkMode.Row || col === updateCol;
  }

  blink$(mode: BlinkMode, rows: number[]): Observable<number> {
    return defer(() => {
      this.mode = mode;
      this.rows = new Set(rows);
      return timer(0, this.opts.intervalMs).pipe(
        take(this.opts.count * 2),
        tap((i) => {
          // TODO: make this start off
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

  dropRows$(rows: number[]): Observable<number> {
    return defer(() => {
      this.greyedRows = rows;
      this.onFrame();
      return this.blink$(BlinkMode.Row, rows);
    }).pipe(finalize(() => (this.greyedRows = [])));
  }
}
