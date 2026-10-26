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
  EMPTY,
  catchError,
  distinctUntilChanged,
  Subject,
} from "rxjs";

import { DotColor } from "../models/colors.model.ts";
import { TransitionPhase } from "../models/animation.model.ts";
import type { TableColumnSpec, DotPosition, TableBoardData, TableLayoutInput, TableLayout } from "../models/board.model.ts";

import { BoardDefault, ColumnType, PAGE_PADDING_PX, TableBoardConfig } from "../config/board.config.ts";
import { FONT_HEIGHT, FONT_WIDTH } from "../helpers/dotFont.ts";

import DotMatrix, { getMessageLength } from "./dotMatrix.ts";

const COLUMN_LAYOUT: ColumnType[] = [ColumnType.Hug, ColumnType.Hug, ColumnType.Fill, ColumnType.Hug] as const;

type TypewriterState = {
  rowIndex: number;
  colIndex: number;
  currentChar: number;
  isActive: boolean;
};

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

class TableBoard extends DotMatrix {
  public data$: Subject<TableBoardData> = new Subject<TableBoardData>();
  public sketch = this.createSketch();

  // Data
  private tableHeader: string[];
  private dataId: string | undefined;
  private messageTable: string[][];

  // Board State
  private columnHidden = false;
  private typewriterState: TypewriterState = {
    rowIndex: 0,
    colIndex: 0,
    currentChar: 0,
    isActive: true,
  };

  // Layout
  private columnToHide: number | null;
  private columnStartDots: number[] = [];

  private parentElt: HTMLElement;

  constructor(parentElt: HTMLElement, tableHeader: string[], messageTable: string[][], hiddenCol: number | null = null) {
    super(TableBoardConfig.Height, BoardDefault.Width);

    this.parentElt = parentElt;

    this.tableHeader = tableHeader;
    this.columnToHide = hiddenCol;
    this.columnStartDots = this.calcColumnStartDots();
    this.messageTable = messageTable;

    this.setCanvasSize();
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
      top: BoardDefault.PaddingY,
      right: (this.dotColumnCount - BoardDefault.PaddingX) * this.dotUnit - this.dotGap,
      bottom: (this.dotRowCount - BoardDefault.PaddingY) * this.dotUnit - this.dotGap,
      left: BoardDefault.PaddingX * this.dotUnit,
    };
  }

  protected override setupSubscriptions(p: p5): void {
    super.setupSubscriptions(p);

    this.data$
      .pipe(
        tap(({ messageTable, dataId }) => {
          this.messageTable = messageTable;

          if (dataId === this.dataId && !this.isInTransition) {
            p.redraw();
          }
        }),
        distinctUntilChanged((prev, curr) => prev.dataId === curr.dataId),
        switchMap(({ messageTable, dataId }) =>
          this.doTransition$(p, messageTable, dataId).pipe(
            catchError((err) => {
              console.error("Board transition failed:", err);
              return EMPTY;
            }),
          ),
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
  private doTransition$ = (p: p5, messageTable: string[][], newDataId: string | undefined) => {
    this.isInTransition = true;

    return of(null).pipe(
      takeUntil(this.destroy$),
      delay(TableBoardConfig.TransitionDelayMs),
      map(() => {
        this.transitionPhase = TransitionPhase.Change;
        console.log(`changing from ${this.dataId} to ${newDataId}`);

        const enterHeading = !this.dataId;
        this.dataId = newDataId;
        this.messageTable = messageTable;

        return enterHeading;
      }),
      switchMap((enterHeading) => {
        this.transitionPhase = TransitionPhase.In;
        return newDataId ? this.typeContent$(p, enterHeading) : of(null);
      }),
      finalize(() => {
        this.isInTransition = false;
      }),
    );
  };

  private typeContent$ = (p: p5, enterHeading: boolean) => {
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

  private typeRow$ = (p: p5, row: string[], rowIndex: number) => {
    this.typewriterState.rowIndex = rowIndex;

    return of(row).pipe(
      concatMap((cols) => from(cols)),
      concatMap((col, colIndex) => this.typeCell$(p, col, colIndex)),
    );
  };

  private typeCell$ = (p: p5, text: string, colIndex: number) => {
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

function getVisibleColumns(tableHeader: string[], hidden: boolean, hiddenIndex: number | null = null): TableColumnSpec[] {
  return tableHeader
    .map((text, index) => ({ text, index, type: COLUMN_LAYOUT[index] }))
    .filter(({ index }) => !(hidden && index === hiddenIndex));
}

export default TableBoard;
