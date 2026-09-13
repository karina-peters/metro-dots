import { tap, switchMap, Subject, takeUntil, of, delay, concatMap, finalize, from, iif, map } from "rxjs";

import { backgroundColor, dotColor } from "../helpers/colors.js";
import { fontData } from "../helpers/dotFont.js";

import DotMatrix from "./dotMatrix.js";

// Timing (ms)
const typeSpeed = 20;
const transitionDelay = 200;

// Sizing (px)
const dotRadius = 4;
const dotGap = 1;

// Board Dimensions (dot count)
const charGap = 1;
const charWidth = fontData[0][0].length;
const charHeight = fontData[0].length;
const paddingX = 0;
const paddingY = 0;
const msgMargin = 2;

// Table Dimensions (dot count)
const colGap = 4;
const rowGap = 4;
const maxMsgLength = 10;

const COLUMN_LAYOUT = ["hug", "hug", "fill", "hug"];

class StationBoard extends DotMatrix {
  /**
   * Create new StationBoard instance
   * @param {Array<string>} tableHead - Array of column headers
   * @param {Array<string>} msgTable - Array of messages to draw
   * @param {string} stationId - Station to track changes
   */
  constructor(parentElt, tableHead, msgTable, stationId, hiddenCol = null) {
    super(0, 0, dotRadius, dotGap);

    // Data
    this.data$ = new Subject({ msgTable, stationId });
    this.tableHead = tableHead;
    this.msgTable = msgTable;

    // Table
    this.numTableRows = 4;
    this.numTableCols = this.tableHead.length;
    this.columnToHide = hiddenCol;
    this.columnHidden = false;

    // Board State
    this.isInTransition = true;
    this.transitionPhase = null;
    this.typewriterState = {
      rowIndex: 0,
      colIndex: 0,
      currentChar: 0,
      isActive: true,
    };

    // Sizing
    this.parentElt = parentElt;
    this.numCols = Math.max(this.calcMinBoardWidth(), Math.floor(this.parentElt.clientWidth / this.dotUnit));
    this.numRows = this.numTableRows * (charHeight + rowGap) - rowGap + 2 * (msgMargin + paddingY);
    this.breakpointHide = 1375;
    this.breakpointScale = this.calcMinBoardWidth() * this.dotUnit - this.dotGap - /* body padding */ 64;
    this.scale = 1;

    this.setCanvasSize();
  }

  setCanvasSize = () => {
    // Handle responsiveness
    const baseWidth = this.numCols * this.dotUnit - this.dotGap;
    this.columnHidden = window.innerWidth < this.breakpointHide;
    if (window.innerWidth < this.breakpointScale) {
      this.scale = (window.innerWidth - /* body padding */ 32) / baseWidth;
    } else {
      this.scale = 1;
      this.numCols = Math.max(this.calcMinBoardWidth(), Math.floor(this.parentElt.clientWidth / this.dotUnit));
    }

    this.textField = {
      top: paddingY + msgMargin,
      right: (this.numCols - paddingX - msgMargin) * this.dotUnit - this.dotGap,
      bottom: (this.numRows - paddingY - msgMargin) * this.dotUnit - this.dotGap,
      left: (paddingX + msgMargin) * this.dotUnit,
    };

    const width = this.scale * this.numCols * this.dotUnit - this.dotGap;
    const height = this.scale * this.numRows * this.dotUnit - this.dotGap;

    this.canvasSize = { width, height };
  };

  sketch = async (p) => {
    // Preserve context
    const self = this;

    // Call p5.js functions
    p.setup = () => {
      p.createCanvas(self.canvasSize.width, self.canvasSize.height);
      p.noLoop();

      p.windowResized = () => {
        self.setCanvasSize();

        p.resizeCanvas(self.canvasSize.width, self.canvasSize.height);
        p.redraw();
      };

      // Handle data updates
      self.data$
        .pipe(
          takeUntil(self.destroy$),
          switchMap(({ stationId, msgTable }) =>
            iif(
              () => this.stationId === stationId,
              of(null).pipe(
                tap(() => {
                  console.log("updating message table");
                  self.msgTable = msgTable;
                }),
              ),
              this.doTransition$(p, msgTable, stationId),
            ).pipe(tap(() => p.redraw())),
          ),
        )
        .subscribe();

      // Handle component destruction
      self.destroy$.subscribe(() => {
        console.log("destroying...");
      });
    };

    p.draw = () => {
      p.scale(self.scale);
      p.background(backgroundColor);
      p.noFill();

      // Draw the current state
      this.drawBoard(p);

      if (!this.isInTransition || this.transitionPhase === "in") {
        this.drawTable(p);
      }
    };
  };

  /**
   * Starts transition animation for newly selected station
   * @param {Object} p - p5.js instance
   * @param {string} newStationId - station code of the newly selected station
   * @returns an Observable of the transition animation
   */
  doTransition$ = (p, newMsgTable, newStationId) => {
    console.log("starting transition");
    this.isInTransition = true;
    this.clearSubscriptions();

    return of(null).pipe(
      takeUntil(this.destroy$),
      delay(transitionDelay),
      map(() => {
        this.transitionPhase = "change";
        console.log(`changing from station ${this.stationId} to ${newStationId}`);

        const enterHeading = !this.stationId;
        this.stationId = newStationId;
        this.msgTable = newMsgTable;

        return enterHeading;
      }),
      switchMap((enterHeading) => {
        this.transitionPhase = "in";

        console.log("enter heading", enterHeading);
        // Skip exit animation if no new station selected
        return newStationId === null ? of(null) : this.typeContent$(p, enterHeading);
      }),
      finalize(() => {
        this.isInTransition = false;
      }),
    );
  };

  typeContent$ = (p, enterHeading) => {
    console.log("typing message in...");
    this.typewriterState.isActive = true;
    this.clearSubscriptions();

    // TODO: make this less gross
    const table = enterHeading ? [this.tableHead, ...this.msgTable] : this.msgTable;
    const offset = enterHeading ? 0 : 1;

    return from(table).pipe(
      concatMap((row, rowIndex) => this.typeRow$(p, row, rowIndex + offset)),
      finalize(() => (this.typewriterState.isActive = false)),
    );
  };

  typeRow$ = (p, row, rowIndex) => {
    this.typewriterState.rowIndex = rowIndex;

    return of(row).pipe(
      concatMap((cols) => from(cols)),
      concatMap((col, colIndex) => this.typeCell$(p, col, colIndex)),
    );
  };

  typeCell$ = (p, text, colIndex) => {
    this.typewriterState.colIndex = colIndex;
    this.typewriterState.currentChar = 0;

    const chars = Array.from(text || "");
    return from(chars).pipe(
      concatMap((char) =>
        of(char).pipe(
          delay(typeSpeed),
          tap(() => {
            this.typewriterState.currentChar += 1;
            p.redraw();
          }),
        ),
      ),
    );
  };

  /**
   * Draw the current message table on the dot matrix board
   * @param {object} p - p5.js instance
   */
  drawTable = (p) => {
    // Draw table headings
    this.renderRow(p, this.tableHead, 0, dotColor.heading);

    // Draw table data rows
    this.msgTable?.entries()?.forEach(([index, row]) => this.renderRow(p, row, index + 1, dotColor.on));
  };

  /**
   *
   * @param {*} p
   * @param {*} row
   * @param {*} rowIndex
   * @param {*} color
   */
  renderRow = (p, row, rowIndex, color) => {
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

      // Skip rendering the hidden column or null strings
      if (str === null || (this.columnHidden && colIndex === this.columnToHide)) {
        continue;
      }

      let { startX, startY } = this.calcStartPos(rowIndex, adjustedColIndex);
      let charStartX = startX;

      const isTyping = typewriter.isActive && typewriter.rowIndex === rowIndex && typewriter.colIndex === colIndex;
      const charLimit = isTyping ? typewriter.currentChar : maxMsgLength;

      for (const char of str.slice(0, charLimit)) {
        const charColor = colIndex === 1 && char === "8" ? dotColor.highlight : color;
        this.renderChar(p, char, charStartX, startY, charColor);
        charStartX += (charWidth + charGap) * this.dotUnit;
      }

      adjustedColIndex++;
    }
  };

  /**
   * Calculate the starting position for drawing the message based on provided row and column
   * Modified from ChatGPT
   * @returns {Object} Object containing startX and startY coordinates in pixels
   */
  calcStartPos = (row, adjustedCol) => {
    let startX = dotRadius + (paddingX + msgMargin) * this.dotUnit;
    let startY = dotRadius + (paddingY + msgMargin + row * (charHeight + rowGap)) * this.dotUnit;

    // Create adjusted layout and headings without the hidden column
    const adjustedLayout = [...COLUMN_LAYOUT].filter((_, i) => !this.columnHidden || this.columnToHide !== i);
    const adjustedHeadings = [...this.tableHead].filter((_, i) => !this.columnHidden || this.columnToHide !== i);

    // Calculate hug widths based on adjusted columns
    const hugWidths = adjustedHeadings.map((text, i) =>
      adjustedLayout[i] === "hug" ? (this.getMsgLength(text) + colGap) * this.dotUnit : 0,
    );
    const totalHugWidth = hugWidths.reduce((sum, w) => sum + w, 0);

    // Count fill columns
    const fillCols = adjustedLayout.filter((type) => type === "fill").length;
    const fillWidth = fillCols > 0 ? (this.numCols * this.dotUnit - totalHugWidth) / fillCols : 0;

    // Compute x offset by summing widths of previous columns
    for (let i = 0; i < adjustedCol; i++) {
      startX += adjustedLayout[i] === "hug" ? hugWidths[i] : fillWidth;
    }

    return { startX, startY };
  };

  calcMinBoardWidth = () => {
    let tableLength = 0;

    // Create adjusted layout and headings without the hidden column
    const adjustedLayout = [...COLUMN_LAYOUT].filter((_, i) => !this.columnHidden || this.columnToHide !== i);
    const adjustedHeadings = [...this.tableHead].filter((_, i) => !this.columnHidden || this.columnToHide !== i);

    const visibleColCount = adjustedHeadings.length;

    for (let i = 0; i < visibleColCount; i++) {
      const message = adjustedLayout[i] === "hug" ? adjustedHeadings[i] : "0".repeat(maxMsgLength);

      tableLength += this.getMsgLength(message);

      if (i < visibleColCount - 1) {
        tableLength += colGap;
      }
    }

    return tableLength + 2 * (paddingX + msgMargin);
  };

  /**
   * Clean up all active subscriptions
   * Should be called when component unmounts or before starting new animations
   */
  clearSubscriptions = () => {
    if (this.timer$) {
      this.timer$.unsubscribe();
      this.timer$ = null;
    }
  };
}

export default StationBoard;
