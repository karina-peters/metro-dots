import { interval, tap, finalize, Subject, takeUntil, take, last } from "rxjs";

import p5 from "p5";

import { DotColor } from "../models/colors.model.ts";
import { fontData, FONT_WIDTH } from "../helpers/dotFont.ts";
import { Dot } from "../config/board.config.ts";

// Dimensions (dot count)
const charGap = 1;
const paddingX = 0;
const paddingY = 2;
const msgMargin = 2;

interface Animation {
  speed: number;
  step: number;
  totalDistance: number;
  onStep: Function;
  onFinalize: Function;
  onStart: Function;
}

class DotMatrix {
  destroy$: Subject<void> = new Subject<void>();
  dotRadius: number;
  dotGap: number;
  dotUnit: number;
  dotColumnCount: number;
  dotRowCount: number;
  textField: { top: number; right: number; bottom: number; left: number };

  /**
   * Construct new instance of DotMatrix
   * @param numRows - Number of dot rows on board
   * @param numCols - Number of dot columns on board
   * @param dotRadius - Dot radius in pixels
   * @param dotGap - Space between dots in pixels
   */
  constructor(numRows: number, numCols: number) {
    // Sizing
    this.dotRadius = Dot.Radius;
    this.dotGap = Dot.Gap;
    this.dotUnit = Dot.Unit;
    this.dotColumnCount = numCols;
    this.dotRowCount = numRows;
    this.textField = {
      top: paddingY * this.dotUnit,
      right: (this.dotColumnCount - paddingX - msgMargin) * this.dotUnit - this.dotGap,
      bottom: (this.dotRowCount - paddingY - msgMargin) * this.dotUnit - this.dotGap,
      left: (paddingX + msgMargin) * this.dotUnit,
    };
  }

  /**
   * Generalized offset animation for scroll or bumper transition
   * (modified from consolidation of previous redundant startScroll and startBumperAnimation functions by ChatGPT)
   * @param p - p5.js instance
   * @param a - animation options
   */
  createScrollAnimation = (p: p5, a: Animation) => {
    a.onStart();

    return interval(a.speed).pipe(
      takeUntil(this.destroy$),
      take(Math.ceil(a.totalDistance / a.step)),
      tap(() => {
        a.onStep();
        p.redraw();
      }),
      last(),
      finalize(() => {
        a.onFinalize();
      }),
    );
  };

  /**
   * Draw the dot matrix board background with highlight color
   * @param p - p5.js instance
   */
  drawBoard(p: p5) {
    let dotX = this.dotRadius;
    let dotY = this.dotRadius;

    for (let i = 0; i < this.dotRowCount; i++) {
      dotX = this.dotRadius;

      for (let j = 0; j < this.dotColumnCount; j++) {
        const color = DotColor.Off;
        p.fill(color);
        p.ellipseMode(p.RADIUS);
        p.ellipse(dotX, dotY, this.dotRadius, this.dotRadius);

        dotX += this.dotUnit;
      }

      dotY += this.dotUnit;
    }
  }

  /**
   * Render a single character on the dot matrix display
   * Only renders dots within the visible display area
   * @param p - p5.js instance
   * @param char - Character to render
   * @param startX - Starting X position in pixels
   * @param startY - Starting Y position in pixels
   * @param color - Color to render the char in
   */
  renderChar(p: p5, char: string, startX: number, startY: number, color: string) {
    const charMatrix = fontData.get(char.toUpperCase()) || fontData.get(" ") || []; // Default to space if character not found
    const { top, right, bottom, left } = this.textField;

    let dotY = startY;

    for (const row of charMatrix) {
      let dotX = startX;

      for (const dotVal of row) {
        if (dotVal === 1 && dotY >= top && dotX <= right && dotY <= bottom && dotX >= left) {
          p.fill(color);
          p.ellipseMode(p.RADIUS);
          p.ellipse(dotX, dotY, this.dotRadius, this.dotRadius);
        }

        dotX += this.dotUnit;
      }

      dotY += this.dotUnit;
    }
  }

  /**
   * Check if a message is too long to fit on the display
   * @param message - The message to check
   * @returns True if the message needs to scroll, false otherwise
   */
  messageOverflow(message: string): boolean {
    const msgWidth = getMessageLength(message);
    const visibleWidth = (this.textField.right - this.textField.left + this.dotGap) / this.dotUnit;

    return msgWidth > visibleWidth;
  }
}

/**
 * Calculate the length of a message in number of dots
 * @param message - The message to measure
 * @returns Length of the message in dot matrix columns
 */
export function getMessageLength(message: string): number {
  return message.length * (FONT_WIDTH + charGap) - charGap;
}

export default DotMatrix;
