import p5 from "p5";

import {
  tap,
  switchMap,
  takeUntil,
  of,
  delay,
  concatMap,
  finalize,
  from,
  map,
  BehaviorSubject,
  EMPTY,
  catchError,
  distinctUntilChanged,
  Subject,
} from "rxjs";

import { BACKGROUND_COLOR, DotColor } from "../models/colors.model.ts";
import { FONT_HEIGHT, FONT_WIDTH } from "../helpers/dotFont.ts";
import { BoardDefault, ColumnType, PAGE_PADDING_PX, TableBoardConfig } from "../config/board.config.ts";
import { TransitionPhase } from "../models/board.model.ts";
import type { CanvasSize, ColumnSpec, DotPosition, TableBoardData } from "../models/board.model.ts";

import DotMatrix, { getMessageLength } from "./dotMatrix.ts";

const COLUMN_LAYOUT: ColumnType[] = [ColumnType.Hug, ColumnType.Hug, ColumnType.Fill, ColumnType.Hug] as const;

type TypewriterState = {
  rowIndex: number;
  colIndex: number;
  currentChar: number;
  isActive: boolean;
};

type LayoutInput = {
  availableWidth: number;
  dotUnit: number;
  dotGap: number;
  minColsFull: number;
  minColsHidden: number | null;
};

type TableLayout = {
  columnHidden: boolean;
  dotColumnCount: number;
  scale: number;
};

function chooseTableLayout(i: LayoutInput): TableLayout {
  if (!(i.availableWidth > 0)) return { columnHidden: false, dotColumnCount: i.minColsFull, scale: 1 }; // e.g. a detached parent

  // n dot columns span n * dotUnit - dotGap px, so this is how many fit at full size
  const fit = Math.floor((i.availableWidth + i.dotGap) / i.dotUnit);

  const scaled = (columnHidden: boolean, cols: number): TableLayout => ({
    columnHidden,
    dotColumnCount: cols,
    scale: i.availableWidth / (cols * i.dotUnit - i.dotGap),
  });

  // 1. Shrink the dot grid while the full table still fits
  if (fit >= i.minColsFull) return { columnHidden: false, dotColumnCount: fit, scale: 1 };

  // 2. Hide the optional column and keep shrinking the grid
  if (i.minColsHidden !== null && fit >= i.minColsHidden) return { columnHidden: true, dotColumnCount: fit, scale: 1 };

  // 3. Nothing left to drop: scale the minimum layout to fit
  return i.minColsHidden === null ? scaled(false, i.minColsFull) : scaled(true, i.minColsHidden);
}

class TableBoard extends DotMatrix {
  public data$: Subject<TableBoardData> = new Subject<TableBoardData>();

  // Data
  private tableHeader: string[];
  private stationId: string | undefined; // TODO - change to dataId
  private messageTable: string[][];

  // Board State
  private columnHidden = false;
  private isInTransition = true;
  private transitionPhase = TransitionPhase.None;
  private typewriterState: TypewriterState = {
    rowIndex: 0,
    colIndex: 0,
    currentChar: 0,
    isActive: true,
  };

  // Layout
  private columnToHide: number | null;
  private columnStartDots: number[] = [];

  // Sizing
  private scale: number = 1;
  private canvasSize: CanvasSize = { width: 0, height: 0 };

  private parentElt: HTMLElement;

  constructor(parentElt: HTMLElement, tableHeader: string[], messageTable: string[][], stationId: string, hiddenCol: number | null = null) {
    super(TableBoardConfig.Height, BoardDefault.Width);

    this.parentElt = parentElt;

    this.tableHeader = tableHeader;
    this.columnToHide = hiddenCol;
    this.columnStartDots = this.calcColumnStartDots();
    this.messageTable = messageTable;

    this.setCanvasSize();
  }

  setCanvasSize() {
    const availableWidth = this.parentElt.clientWidth || window.innerWidth - PAGE_PADDING_PX * 2;

    const layout = chooseTableLayout({
      availableWidth,
      dotUnit: this.dotUnit,
      dotGap: this.dotGap,
      minColsFull: calcMinBoardWidth(this.tableHeader, false, this.columnToHide),
      minColsHidden: this.columnToHide === null ? null : calcMinBoardWidth(this.tableHeader, true, this.columnToHide),
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
      top: BoardDefault.PaddingY,
      right: (this.dotColumnCount - BoardDefault.PaddingX) * this.dotUnit - this.dotGap,
      bottom: (this.dotRowCount - BoardDefault.PaddingY) * this.dotUnit - this.dotGap,
      left: BoardDefault.PaddingX * this.dotUnit,
    };
  }

  sketch = (p: p5) => {
    // Call p5.js functions
    p.setup = () => {
      p.createCanvas(this.canvasSize.width, this.canvasSize.height);
      p.noLoop();

      p.windowResized = () => {
        this.setCanvasSize();
        p.resizeCanvas(this.canvasSize.width, this.canvasSize.height);
        p.redraw();
      };

      this.data$
        .pipe(
          tap(({ messageTable, stationId }) => {
            this.messageTable = messageTable;

            if (stationId === this.stationId && !this.isInTransition) {
              p.redraw();
            }
          }),
          distinctUntilChanged((prev, curr) => prev.stationId === curr.stationId),
          switchMap(({ messageTable, stationId }) =>
            this.doTransition$(p, messageTable, stationId).pipe(
              catchError((err) => {
                console.error("Board transition failed:", err);
                return EMPTY;
              }),
            ),
          ),
          takeUntil(this.destroy$),
        )
        .subscribe();

      this.destroy$.subscribe(() => {
        console.log("destroying...");
      });
    };

    p.draw = () => {
      p.scale(this.scale);
      p.background(BACKGROUND_COLOR);
      p.noFill();

      // Draw the current state
      this.drawBoard(p);

      if (!this.isInTransition || this.transitionPhase === TransitionPhase.In) {
        this.drawMessages(p);
      }
    };
  };

  /**
   * Starts transition animation for newly selected station
   * @param p - p5.js instance
   * @param newStationId - station code of the newly selected station
   * @returns an Observable of the transition animation
   */
  doTransition$ = (p: p5, messageTable: string[][], newStationId: string | undefined) => {
    this.isInTransition = true;

    return of(null).pipe(
      takeUntil(this.destroy$),
      delay(TableBoardConfig.TransitionDelayMs),
      map(() => {
        this.transitionPhase = TransitionPhase.Change;
        console.log(`changing from station ${this.stationId} to ${newStationId}`);

        const enterHeading = !this.stationId;
        this.stationId = newStationId;
        this.messageTable = messageTable;

        return enterHeading;
      }),
      switchMap((enterHeading) => {
        this.transitionPhase = TransitionPhase.In;
        return newStationId ? this.typeContent$(p, enterHeading) : of(null);
      }),
      finalize(() => {
        this.isInTransition = false;
      }),
    );
  };

  typeContent$ = (p: p5, enterHeading: boolean) => {
    console.log("typing message in...");

    this.typewriterState.isActive = true;

    // TODO: make this less gross
    // "disappears if rows carry their own index: build [{ cells, index }] including the header,
    // then slice(1) when the header’s already on screen.""
    const table = enterHeading ? [this.tableHeader, ...this.messageTable] : this.messageTable;
    const offset = enterHeading ? 0 : 1;

    console.log(this.messageTable);

    return from(table).pipe(
      concatMap((row, rowIndex) => this.typeRow$(p, row, rowIndex + offset)),
      finalize(() => (this.typewriterState.isActive = false)),
    );
  };

  typeRow$ = (p: p5, row: string[], rowIndex: number) => {
    this.typewriterState.rowIndex = rowIndex;

    return of(row).pipe(
      concatMap((cols) => from(cols)),
      concatMap((col, colIndex) => this.typeCell$(p, col, colIndex)),
    );
  };

  typeCell$ = (p: p5, text: string, colIndex: number) => {
    this.typewriterState.colIndex = colIndex;
    this.typewriterState.currentChar = 0;

    const chars = Array.from(text || "");
    return from(chars).pipe(
      concatMap((char) =>
        of(char).pipe(
          delay(TableBoardConfig.TypeSpeedMs),
          tap(() => {
            this.typewriterState.currentChar += 1;
            p.redraw();
          }),
        ),
      ),
    );
  };

  drawMessages(p: p5): void {
    this.renderRow(p, this.tableHeader, 0, DotColor.Heading);

    for (let [index, row] of this.messageTable.entries()) {
      this.renderRow(p, row, index + 1, DotColor.On);
    }
  }

  private renderRow(p: p5, row: string[], rowIndex: number, color: DotColor) {
    let adjustedColIndex = 0;
    const typewriter = this.typewriterState;

    // Skip rendering untyped rows
    if (typewriter.isActive && rowIndex > typewriter.rowIndex) {
      return;
    }

    for (const [colIndex, str] of row.entries()) {
      // Skip rendering untyped cells
      if (typewriter.isActive && rowIndex === typewriter.rowIndex && colIndex > typewriter.colIndex) {
        return;
      }

      // Skip rendering the hidden column
      if (this.columnHidden && colIndex === this.columnToHide) {
        continue;
      }

      let { xPos, yPos } = this.calcStartPos(rowIndex, adjustedColIndex);
      let charStartX = xPos;

      const isTyping = typewriter.isActive && typewriter.rowIndex === rowIndex && typewriter.colIndex === colIndex;
      const charLimit = isTyping ? typewriter.currentChar : TableBoardConfig.MaxMessageLength;
      const strSanitized = str || "-";

      for (const char of strSanitized.slice(0, charLimit)) {
        const charColor = colIndex === 1 && char === "8" ? DotColor.Highlight : color;
        this.renderChar(p, char, charStartX, yPos, charColor);
        charStartX += (FONT_WIDTH + BoardDefault.CharGap) * this.dotUnit;
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
    const startX = this.dotRadius + (this.columnStartDots[adjustedCol] + BoardDefault.PaddingX) * this.dotUnit;
    const startY = this.dotRadius + (row * (FONT_HEIGHT + TableBoardConfig.RowGap) + BoardDefault.PaddingY) * this.dotUnit;

    return { xPos: startX, yPos: startY };
  }

  private calcColumnStartDots(): number[] {
    const visibleColumns = getVisibleColumns(this.tableHeader, this.columnHidden, this.columnToHide);

    // Handle hug columns
    const hugWidth = (text: string) => getMessageLength(text) + TableBoardConfig.ColGap;
    const totalHugWidth = visibleColumns.reduce((sum, c) => sum + (c.type === ColumnType.Hug ? hugWidth(c.text) : 0), 0);

    const available = this.dotColumnCount - 2 * BoardDefault.PaddingX - totalHugWidth;

    // Handle fill columns
    const fillCount = visibleColumns.filter((c) => c.type === ColumnType.Fill).length;
    const fillWidth = fillCount > 0 ? Math.max(0, available / fillCount) : 0;

    let startDot = BoardDefault.PaddingX;
    return visibleColumns.map((c) => {
      const colStart = startDot;
      startDot += c.type === ColumnType.Hug ? hugWidth(c.text) : fillWidth;
      return colStart;
    });
  }
}

function calcMinBoardWidth(tableHeader: string[], hidden: boolean, hiddenIndex: number | null = null): number {
  const minFillWidth = getMessageLength("0".repeat(TableBoardConfig.MaxMessageLength)) + TableBoardConfig.ColGap;
  const contentWidth = getVisibleColumns(tableHeader, hidden, hiddenIndex).reduce(
    (sum, c) => sum + (c.type === ColumnType.Hug ? getMessageLength(c.text) + TableBoardConfig.ColGap : minFillWidth),
    0,
  );

  return contentWidth + 2 * BoardDefault.PaddingX - TableBoardConfig.ColGap;
}

function getVisibleColumns(tableHeader: string[], hidden: boolean, hiddenIndex: number | null = null): ColumnSpec[] {
  return tableHeader
    .map((text, index) => ({ text, index, type: COLUMN_LAYOUT[index] }))
    .filter(({ index }) => !(hidden && index === hiddenIndex));
}

export default TableBoard;
