import p5 from "p5";
import {
  tap,
  switchMap,
  takeUntil,
  of,
  delay,
  finalize,
  map,
  EMPTY,
  catchError,
  distinctUntilChanged,
  Subject,
  defer,
  take,
  timer,
  concat,
  Observable,
} from "rxjs";

import { DotColor } from "../models/colors.model.ts";
import { BlinkMode, TransitionPhase, TypeMode } from "../models/animation.model.ts";
import type { TableColumnSpec, DotPosition, TableBoardData, TableLayoutInput, TableLayout, TableCell } from "../models/board.model.ts";

import { DefaultBoardConfig, ColumnType, PAGE_PADDING_PX, TableBoardConfig } from "../config/board.config.ts";
import { FONT_HEIGHT, FONT_WIDTH } from "../helpers/dotFont.ts";

import DotMatrix, { getMessageLength } from "./dotMatrix.ts";
import { Typewriter } from "../helpers/typeAnimation.ts";
import { Blinker } from "../helpers/blinkAnimation.ts";

const COLUMN_LAYOUT: ColumnType[] = [ColumnType.Hug, ColumnType.Hug, ColumnType.Fill, ColumnType.Hug] as const;

class TableBoard extends DotMatrix {
  public data$: Subject<TableBoardData> = new Subject<TableBoardData>();
  public sketch = this.createSketch();

  // Data
  private tableHeader: string[];
  private viewKey: string | undefined;
  private dataId: string | undefined;
  private incomingTable: string[][] = [];
  private messageTable: string[][];

  // Board State
  private columnHidden = false;

  // Animations
  private readonly typewriterOpts = { typeSpeedMs: TableBoardConfig.TypeSpeedMs, eraseSpeedMs: TableBoardConfig.TypeSpeedMs };
  private typewriter = new Typewriter(this.typewriterOpts, () => this.redraw$.next(), this.destroy$);
  private readonly blinkerOpts = {
    intervalMs: TableBoardConfig.BlinkIntervalMs,
    count: TableBoardConfig.BlinkCount,
    greyHoldMs: TableBoardConfig.BlinkIntervalMs,
  };
  private blinker = new Blinker(this.blinkerOpts, () => this.redraw$.next(), this.destroy$);
  private liveUpdate$ = new Subject<string[][] | null>();

  // Layout
  private columnToHide: number | null;
  private columnToUpdate: number | null;
  private columnStartDots: number[] = [];

  private parentElt: HTMLElement;

  constructor(
    parentElt: HTMLElement,
    tableHeader: string[],
    messageTable: string[][],
    updateCol: number | null = null,
    hiddenCol: number | null = null,
  ) {
    super(TableBoardConfig.Height, DefaultBoardConfig.Width);

    this.parentElt = parentElt;

    this.tableHeader = tableHeader;
    this.columnToHide = hiddenCol;
    this.columnToUpdate = updateCol;
    this.columnStartDots = this.calcColumnStartDots();
    this.messageTable = messageTable;

    this.setCanvasSize();
  }

  protected rowKey(row: string[]): string {
    return row.filter((_, i) => i !== this.columnToUpdate).join("|");
  }

  protected override setCanvasSize() {
    const availableSpace = this.parentElt.clientWidth || window.innerWidth - PAGE_PADDING_PX * 2;

    const layout = chooseTableLayout({
      availableSpace,
      dotUnit: this.dotUnit,
      dotGap: this.dotGap,
      minWidthWide: calcMinBoardWidth(this.tableHeader, false, this.columnToHide),
      minWidthNarrow: calcMinBoardWidth(this.tableHeader, true, this.columnToHide),
    });

    this.columnHidden = layout.columnHidden;
    this.dotColumnCount = layout.dotColumnCount;
    this.scale = layout.scale;
    this.columnStartDots = this.calcColumnStartDots();

    this.canvasSize = {
      width: this.scale * this.dotColumnCount * this.dotUnit - this.dotGap,
      height: this.scale * this.dotRowCount * this.dotUnit - this.dotGap,
    };

    this.textField = {
      top: TableBoardConfig.PaddingY * this.dotUnit,
      right: (this.dotColumnCount - TableBoardConfig.PaddingX) * this.dotUnit - this.dotGap,
      bottom: (this.dotRowCount - TableBoardConfig.PaddingY) * this.dotUnit - this.dotGap,
      left: TableBoardConfig.PaddingX * this.dotUnit,
    };
  }

  protected override setupSubscriptions(p: p5): void {
    super.setupSubscriptions(p);

    this.data$
      .pipe(
        tap(({ messageTable, dataId, viewKey }) => {
          // Don't overwrite the message table yet in case we need to wait for a transition out
          this.incomingTable = messageTable;

          // Not transitioning
          if (dataId === this.dataId && !this.isInTransition) {
            if (viewKey !== this.viewKey) {
              // Switching view; no animation
              this.liveUpdate$.next(null);
              this.viewKey = viewKey;
              this.messageTable = messageTable;
              this.redraw$.next();
            } else {
              // Trigger data update animations
              this.liveUpdate$.next(messageTable);
            }
          }
        }),
        distinctUntilChanged((prev, curr) => prev.dataId === curr.dataId),
        switchMap(({ dataId }) =>
          this.doTransition$(dataId).pipe(
            catchError((err) => {
              console.error("Board transition failed:", err);
              return EMPTY;
            }),
          ),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe();

    this.liveUpdate$
      .pipe(
        switchMap((incoming) =>
          incoming
            ? this.doUpdateAnimation$(incoming).pipe(
                catchError((err) => {
                  console.error("Live update animation failed:", err);
                  return EMPTY;
                }),
              )
            : EMPTY,
        ),
        takeUntil(this.destroy$),
      )
      .subscribe();
  }

  protected override drawContent(p: p5): void {
    this.renderRow(p, this.tableHeader, 0, DotColor.Heading);

    for (let [index, row] of this.messageTable.entries()) {
      this.renderRow(p, row, index + 1, DotColor.On);
    }
  }

  /**
   * Starts transition animation for newly selected data
   * @param p - p5.js instance
   * @param newDataId - id of the newly selected data
   * @returns an Observable of the transition animation
   */
  private doTransition$ = (newDataId: string | undefined) => {
    this.liveUpdate$.next(null); // cancel update animations
    this.isInTransition = true;

    return of(null).pipe(
      takeUntil(this.destroy$),
      delay(TableBoardConfig.TransitionDelayMs),
      switchMap(() => {
        this.transitionPhase = TransitionPhase.Out;
        return this.dataId ? this.typeContent$(TypeMode.Out, false) : of(null);
      }),
      map(() => {
        this.transitionPhase = TransitionPhase.Change;
        console.log(`changing from ${this.dataId} to ${newDataId}`);

        const enterHeading = !this.dataId;
        this.dataId = newDataId;
        this.messageTable = this.incomingTable;

        return enterHeading;
      }),
      switchMap((enterHeading) => {
        this.transitionPhase = TransitionPhase.In;
        return newDataId ? this.typeContent$(TypeMode.In, enterHeading) : of(null);
      }),
      finalize(() => {
        this.isInTransition = false;
      }),
    );
  };

  private doUpdateAnimation$(incoming: string[][]) {
    const droppedRow = this.rowDrop(this.messageTable, incoming);
    const blinkUpdates$ = defer(() => {
      const updated = this.rowDataUpdates(this.messageTable, incoming);
      this.messageTable = incoming;
      this.redraw$.next();
      return updated.length ? this.blinker.blink$(BlinkMode.UpdateCol, updated) : EMPTY;
    });

    return (droppedRow ? this.blinker.dropRow$(0) : blinkUpdates$).pipe(
      finalize(() => {
        this.messageTable = incoming;
        this.redraw$.next();
      }),
    );
  }

  private typeContent$ = (mode: TypeMode, includeHeading: boolean) => {
    console.log(`typing message ${mode}...`);

    const rows = [this.tableHeader, ...this.messageTable].map((cells, rowIndex) => ({ cells, rowIndex }));
    return this.typewriter.run$(mode, includeHeading ? rows : rows.slice(1));
  };

  private renderRow(p: p5, row: string[], rowIndex: number, color: DotColor) {
    const dataRowIndex = rowIndex - 1;
    const baseColor = this.blinker.isGreyed(dataRowIndex) ? DotColor.Dim : color;

    let adjustedColIndex = 0;

    for (const [colIndex, str] of row.entries()) {
      // Skip rendering untyped cells
      const limit = this.typewriter.charLimit(rowIndex, colIndex);
      if (limit === 0) {
        return;
      }

      // Skip rendering the hidden column
      if (this.columnHidden && colIndex === this.columnToHide) {
        continue;
      }

      if (!this.blinker.isBlanked(dataRowIndex, colIndex, this.columnToUpdate)) {
        let { xPos, yPos } = this.calcStartPos(rowIndex, adjustedColIndex);
        let charStartX = xPos;

        const strSanitized = str || "-";
        for (const char of strSanitized.slice(0, Math.min(limit, TableBoardConfig.MaxMessageLength))) {
          const charColor = colIndex === 1 && char === "8" ? DotColor.Highlight : baseColor;
          this.renderChar(p, char, charStartX, yPos, charColor);
          charStartX += (FONT_WIDTH + DefaultBoardConfig.CharGap) * this.dotUnit;
        }
      }

      adjustedColIndex++;
    }
  }

  /**
   * Calculate the starting position for drawing the message
   * Adjusts for hidden columns and column widths based on the COLUMN_LAYOUT
   *
   * @returns x and y coordinates in pixels
   */
  private calcStartPos(row: number, adjustedCol: number): DotPosition {
    const startX = this.dotRadius + this.columnStartDots[adjustedCol] * this.dotUnit;
    const startY = this.dotRadius + (row * (FONT_HEIGHT + TableBoardConfig.RowGap) + TableBoardConfig.PaddingY) * this.dotUnit;

    return { xPos: startX, yPos: startY };
  }

  private calcColumnStartDots(): number[] {
    const visibleColumns = getVisibleColumns(this.tableHeader, this.columnHidden, this.columnToHide);

    // Handle hug columns
    const hugWidth = (text: string) => getMessageLength(text) + TableBoardConfig.ColGap;
    const totalHugWidth = visibleColumns.reduce(
      (sum, c) => sum + (c.type === ColumnType.Hug ? hugWidth(c.text) : 0),
      -TableBoardConfig.ColGap,
    );

    const available = this.dotColumnCount - 2 * TableBoardConfig.PaddingX - totalHugWidth;

    // Handle fill columns
    const fillCount = visibleColumns.filter((c) => c.type === ColumnType.Fill).length;
    const fillWidth = fillCount > 0 ? Math.max(0, available / fillCount) : 0;

    let startDot = TableBoardConfig.PaddingX;
    return visibleColumns.map((c) => {
      const colStart = startDot;
      startDot += c.type === ColumnType.Hug ? hugWidth(c.text) : fillWidth;
      return colStart;
    });
  }

  private rowDataUpdates(current: string[][], incoming: string[][]): number[] {
    const changed = [];

    for (const [r_idx, row] of incoming.entries()) {
      const prev = current[r_idx];
      const rowsMatch = prev && this.rowKey(prev) === this.rowKey(row);
      const columnUpdated = prev && this.columnToUpdate !== null && prev[this.columnToUpdate] !== row[this.columnToUpdate];

      if (rowsMatch && columnUpdated) {
        changed.push(r_idx);
      }
    }

    return changed;
  }

  private rowDrop(current: string[][], incoming: string[][]): boolean {
    return this.rowKey(current[0]) !== this.rowKey(incoming[0]);
  }
}

function chooseTableLayout({ availableSpace, dotGap, dotUnit, minWidthWide, minWidthNarrow }: TableLayoutInput): TableLayout {
  if (availableSpace <= 0) {
    return { columnHidden: false, dotColumnCount: minWidthWide, scale: 1 };
  }

  const totalWidth = Math.floor((availableSpace + dotGap) / dotUnit);

  const spaceForFull = () => totalWidth >= minWidthWide;
  const spaceForReduced = () => minWidthNarrow !== null && totalWidth >= minWidthNarrow;

  let layout;
  if (spaceForFull()) {
    layout = { columnHidden: false, dotColumnCount: totalWidth, scale: 1 };
  } else if (spaceForReduced()) {
    layout = { columnHidden: true, dotColumnCount: totalWidth, scale: 1 };
  } else {
    layout = {
      columnHidden: true,
      dotColumnCount: minWidthNarrow,
      scale: availableSpace / (minWidthNarrow * dotUnit - dotGap),
    };
  }

  return layout;
}

function calcMinBoardWidth(tableHeader: string[], hidden: boolean, hiddenIndex: number | null = null): number {
  const minFillWidth = getMessageLength("0".repeat(TableBoardConfig.MaxMessageLength)) + TableBoardConfig.ColGap;
  const contentWidth = getVisibleColumns(tableHeader, hidden, hiddenIndex).reduce(
    (sum, c) => sum + (c.type === ColumnType.Hug ? getMessageLength(c.text) + TableBoardConfig.ColGap : minFillWidth),
    0,
  );

  return contentWidth + 2 * TableBoardConfig.PaddingX - TableBoardConfig.ColGap;
}

function getVisibleColumns(tableHeader: string[], hidden: boolean, hiddenIndex: number | null = null): TableColumnSpec[] {
  return tableHeader
    .map((text, index) => ({ text, index, type: COLUMN_LAYOUT[index] }))
    .filter(({ index }) => !(hidden && index === hiddenIndex));
}

export default TableBoard;
