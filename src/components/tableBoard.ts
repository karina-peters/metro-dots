import p5 from "p5";
import { tap, switchMap, takeUntil, of, finalize, map, EMPTY, catchError, distinctUntilChanged, Subject, defer, forkJoin } from "rxjs";

import { DotColor } from "@models/colors.model.ts";
import { BlinkMode, TransitionPhase, TypeMode } from "@models/animation.model.ts";
import type {
  TableColumnSpec,
  DotPosition,
  TableBoardData,
  TableLayoutInput,
  TableLayout,
  ColumnGeometry,
  TableBoardOptions,
} from "@models/board.model.ts";

import { DefaultBoardConfig, ColumnType, PAGE_PADDING_PX, TableBoardConfig, ColumnAlign } from "@config/board.config.ts";

import { FONT_HEIGHT, FONT_WIDTH } from "@helpers/dotFont.ts";
import { Typewriter } from "@helpers/animation/typeAnimation.ts";
import { Blinker } from "@helpers/animation/blinkAnimation.ts";
import { OffsetAnimation } from "@helpers/animation/offsetAnimation.ts";

import DotMatrix, { getMessageLength } from "./dotMatrix.ts";

const ELLIPSE_CHAR = "⃨";

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
  private readonly blinkerOpts = { intervalMs: TableBoardConfig.BlinkIntervalMs, count: TableBoardConfig.BlinkCount };
  private blinker = new Blinker(this.blinkerOpts, () => this.redraw$.next(), this.destroy$);
  private liveUpdate$ = new Subject<string[][] | null>();
  private readonly scrollOpts = { intervalMs: TableBoardConfig.ScrollSpeedMs, step: 1 };
  private bumper = new OffsetAnimation(this.scrollOpts, () => this.redraw$.next(), this.destroy$);

  // Layout
  private columns = new Map<number, ColumnGeometry>();
  private bumperBand: number[] = [];

  private parentElt: HTMLElement;
  private readonly opts: TableBoardOptions;

  constructor(parentElt: HTMLElement, opts: TableBoardOptions) {
    super(TableBoardConfig.Height, DefaultBoardConfig.Width);

    this.parentElt = parentElt;
    this.opts = opts;

    this.tableHeader = opts.header;
    this.messageTable = opts.rows;

    this.setCanvasSize();
  }

  protected override setCanvasSize() {
    const availableSpace = this.parentElt.clientWidth || window.innerWidth - PAGE_PADDING_PX * 2;

    const layout = chooseTableLayout({
      availableSpace,
      dotUnit: this.dotUnit,
      dotGap: this.dotGap,
      minWidthWide: calcMinBoardWidth(this.opts, false),
      minWidthNarrow: calcMinBoardWidth(this.opts, true),
    });

    this.columnHidden = layout.columnHidden;
    this.dotColumnCount = layout.dotColumnCount;
    this.scale = layout.scale;
    this.columns = this.calcColumns();
    this.bumperBand = this.calcBumperBands();

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

  protected override backgroundDotColor(row: number, col: number): string {
    const bumper = this.opts.bumper;
    if (!bumper || !this.columns.has(bumper.col)) {
      return DotColor.Off; // Column hidden
    }

    const dataRow = this.bumperBand[row];
    const cells = dataRow >= 0 ? this.messageTable[dataRow] : undefined;
    if (!cells) {
      return DotColor.Off; // Not within bumper bounds
    }

    const visible = this.getBumperVisible(dataRow);
    if (col >= Math.min(TableBoardConfig.BumperWidth, visible)) {
      return DotColor.Off; // Not scrolled in yet
    }

    if (this.blinker.isBlanked(dataRow, bumper.col, this.opts.updateCol || null)) {
      return DotColor.Off;
    }

    if (this.blinker.isGreyed(dataRow)) {
      return DotColor.Dim;
    }

    return bumper.colorFor(cells[bumper.col]) || DotColor.Off;
  }

  private doTransition$ = (newDataId: string | undefined) => {
    this.liveUpdate$.next(null); // cancel update animations
    this.isInTransition = true;

    return of(null).pipe(
      takeUntil(this.destroy$),
      switchMap(() => {
        this.transitionPhase = TransitionPhase.Out;
        return this.dataId ? forkJoin([this.animateBumpers$(false), this.typeContent$(TypeMode.Out, false)]) : of(null);
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
        return newDataId ? forkJoin([this.typeContent$(TypeMode.In, enterHeading), this.animateBumpers$(enterHeading)]) : of(null);
      }),
      finalize(() => {
        this.transitionPhase = TransitionPhase.None;
        this.isInTransition = false;
      }),
    );
  };

  private doUpdateAnimation$(incoming: string[][]) {
    const isDroppingRow = this.isRowDrop(this.messageTable, incoming);
    const blinkUpdates$ = defer(() => {
      const updated = this.getUpdatedRows(this.messageTable, incoming);
      this.messageTable = incoming;
      this.redraw$.next();
      return updated.length ? this.blinker.blink$(BlinkMode.UpdateCol, updated) : EMPTY;
    });

    return (isDroppingRow ? this.blinker.dropRow$(0) : blinkUpdates$).pipe(
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

  private animateBumpers$ = (typingHeading: boolean) => {
    console.log(`animating bumpers ${this.transitionPhase}...`);

    return this.bumper.run$(this.bumperScrollDistance, typingHeading ? this.headerTypingMs : 0);
  };

  private renderRow(p: p5, row: string[], rowIndex: number, color: DotColor) {
    const dataRowIndex = rowIndex - 1;
    const greyed = this.blinker.isGreyed(dataRowIndex);
    const rowColor = greyed ? DotColor.Dim : color;
    const advance = (FONT_WIDTH + DefaultBoardConfig.CharGap) * this.dotUnit;

    for (const [colIndex] of row.entries()) {
      const limit = this.typewriter.charLimit(rowIndex, colIndex);
      if (limit === 0) {
        return; // Untyped cells
      }

      if (!this.columns.has(colIndex)) {
        continue; // Hidden column
      }

      if (this.blinker.isBlanked(dataRowIndex, colIndex, this.opts.updateCol || null)) {
        continue; // Blinking
      }

      const text = row[colIndex] || "-";
      const colWidth = this.columns.get(colIndex)?.width;
      const charFit = colWidth ? Math.ceil(colWidth / (FONT_WIDTH + DefaultBoardConfig.CharGap)) : TableBoardConfig.MinFillChars;
      const truncText = getTrunctatedText(text, charFit);
      const count = Math.min(limit, charFit, text.length);
      const { xPos, yPos } = this.calcStartPos(rowIndex, colIndex);
      const colorOverride = this.opts.charColor;

      let x = xPos + this.getAlignmentOffset(colIndex, truncText) * this.dotUnit;
      for (let i = 0; i < count; i++) {
        const char = truncText[i];
        const color = greyed ? rowColor : colorOverride?.(colIndex, char) || rowColor;
        this.renderChar(p, char, x, yPos, color);
        x += advance;
      }
    }
  }

  private getBumperVisible(dataRow: number): number {
    switch (this.transitionPhase) {
      case TransitionPhase.In:
        return this.bumper.active ? this.getBumperProgress(dataRow, TableBoardConfig.BumperWidth) : TableBoardConfig.BumperWidth;
      case TransitionPhase.Change:
        return 0;
      case TransitionPhase.Out:
        return this.bumper.active ? TableBoardConfig.BumperWidth - this.getBumperProgress(dataRow, TableBoardConfig.BumperWidth) : 0;
      default:
        return TableBoardConfig.BumperWidth;
    }
  }

  private getBumperProgress(dataRow: number, width: number): number {
    const slot = this.transitionPhase === TransitionPhase.Out ? this.messageTable.length - 1 - dataRow : dataRow;
    return Math.min(width, Math.max(0, this.bumper.progress - slot * width));
  }

  private getUpdatedRows(current: string[][], incoming: string[][]): number[] {
    const changed = [];

    for (const [r_idx, row] of incoming.entries()) {
      const prev = current[r_idx];
      const rowsMatch = prev && this.getRowKey(prev) === this.getRowKey(row);
      const columnUpdated = prev && this.opts.updateCol && prev[this.opts.updateCol] !== row[this.opts.updateCol];

      if (rowsMatch && columnUpdated) {
        changed.push(r_idx);
      }
    }

    return changed;
  }

  private getRowKey(row: string[]): string {
    return row.filter((_, i) => i !== this.opts.updateCol).join("|");
  }

  private getAlignmentOffset(colIndex: number, text: string): number {
    const col = this.columns.get(colIndex);
    if (!col) {
      return 0;
    }

    const free = Math.max(0, col.width - getMessageLength(text));
    switch (col.align) {
      case ColumnAlign.Center:
        return Math.floor(free / 2);
      case ColumnAlign.Right:
        return free;
      case ColumnAlign.Left:
      default:
        return 0;
    }
  }

  private isRowDrop(current: string[][], incoming: string[][]): boolean {
    return this.getRowKey(current[0]) !== this.getRowKey(incoming[0]);
  }

  /**
   * Calculate the starting position for drawing the message
   * Adjusts for hidden columns and column widths based on the COLUMN_LAYOUT
   *
   * @returns x and y coordinates in pixels
   */
  private calcStartPos(row: number, colIndex: number): DotPosition {
    const startX = this.dotRadius + this.columns.get(colIndex)!.start * this.dotUnit;
    const startY = this.dotRadius + (row * (FONT_HEIGHT + TableBoardConfig.RowGap) + TableBoardConfig.PaddingY) * this.dotUnit;

    return { xPos: startX, yPos: startY };
  }

  /**
   * Calculates the start position and width (in dots) for each column
   * Adjusts for column type and alignment defined in the COLUMN_LAYOUT
   *
   * @returns a map of column geometry in dots
   */
  private calcColumns(): Map<number, ColumnGeometry> {
    const visibleColumns = getVisibleColumns(this.opts, this.columnHidden);

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
    return new Map(
      visibleColumns.map((c) => {
        const isHug = c.type === ColumnType.Hug;
        const geometry: ColumnGeometry = {
          start: startDot,
          width: isHug ? getMessageLength(c.text) : Math.max(0, fillWidth - TableBoardConfig.ColGap),
          align: c.align,
        };
        startDot += isHug ? hugWidth(c.text) : fillWidth;
        return [c.index, geometry];
      }),
    );
  }

  /**
   * Calculates which dot rows fall within the vertical bounds of a bumper
   *
   * @returns an array indexed by dot row
   */
  private calcBumperBands(): number[] {
    const pitch = FONT_HEIGHT + TableBoardConfig.RowGap;
    const offsetY = Math.floor((FONT_HEIGHT - TableBoardConfig.BumperHeight) / 2);
    const bandTop = (tableRow: number) => TableBoardConfig.PaddingY + tableRow * pitch + offsetY;

    const bumperBand = new Array(this.dotRowCount).fill(-1);
    for (let tableRow = 1; bandTop(tableRow) < this.dotRowCount; tableRow++) {
      const first = Math.max(0, bandTop(tableRow));
      const last = Math.min(this.dotRowCount, bandTop(tableRow) + TableBoardConfig.BumperHeight);

      const dataRow = tableRow - 1;
      for (let dotRow = first; dotRow < last; dotRow++) {
        bumperBand[dotRow] = dataRow;
      }
    }

    return bumperBand;
  }

  private get bumperScrollDistance(): number {
    return TableBoardConfig.BumperWidth * this.messageTable.length;
  }

  private get headerTypingMs(): number {
    const chars = this.tableHeader.reduce((n, text) => n + (text || "-").length, 0);
    return (chars + 1) * this.typewriterOpts.typeSpeedMs;
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

function calcMinBoardWidth(opts: TableBoardOptions, hidden: boolean): number {
  const minFillWidth = getMessageLength("0".repeat(TableBoardConfig.MinFillChars)) + TableBoardConfig.ColGap;
  const contentWidth = getVisibleColumns(opts, hidden).reduce(
    (sum, c) => sum + (c.type === ColumnType.Hug ? getMessageLength(c.text) + TableBoardConfig.ColGap : minFillWidth),
    0,
  );

  return contentWidth + 2 * TableBoardConfig.PaddingX - TableBoardConfig.ColGap;
}

function getVisibleColumns(opts: TableBoardOptions, hidden: boolean): TableColumnSpec[] {
  return opts.header
    .map((text, index) => ({ text, index, ...opts.layout[index] }))
    .filter(({ index }) => !(hidden && index === opts.hiddenCol));
}

function getTrunctatedText(text: string, maxLength: number) {
  return text.length > maxLength ? text.slice(0, maxLength - 1) + ELLIPSE_CHAR : text;
}

export default TableBoard;
