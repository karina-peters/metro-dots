import p5 from "p5";
import { interval, tap, finalize, Subject, takeUntil, take, last } from "rxjs";

import { CanvasSize, TransitionPhase } from "../models/board.model.ts";
import { BACKGROUND_COLOR, DotColor } from "../models/colors.model.ts";

import { BoardDefault, Dot } from "../config/board.config.ts";
import { fontData, FONT_WIDTH } from "../helpers/dotFont.ts";

interface Animation {
  speed: number;
  step: number;
  totalDistance: number;
  onStep: Function;
  onFinalize: Function;
  onStart: Function;
}

abstract class DotMatrix {
  public destroy$: Subject<void> = new Subject<void>();

  protected dotRadius: number = Dot.Radius;
  protected dotGap: number = Dot.Gap;
  protected dotUnit: number = Dot.Unit;
  protected dotColumnCount: number;
  protected dotRowCount: number;
  protected textField: { top: number; right: number; bottom: number; left: number };
  protected scale: number = 1;
  protected canvasSize: CanvasSize = { width: 0, height: 0 };
  protected isInTransition = true;
  protected transitionPhase = TransitionPhase.None;

  /**
   * Construct new instance of DotMatrix
   * @param numRows - Number of dot rows on board
   * @param numCols - Number of dot columns on board
   */
  constructor(numRows: number, numCols: number) {
    this.dotColumnCount = numCols;
    this.dotRowCount = numRows;

    this.textField = {
      top: BoardDefault.PaddingY * this.dotUnit,
      right: (this.dotColumnCount - BoardDefault.PaddingX - BoardDefault.MessageMargin) * this.dotUnit - this.dotGap,
      bottom: (this.dotRowCount - BoardDefault.PaddingY - BoardDefault.MessageMargin) * this.dotUnit - this.dotGap,
      left: (BoardDefault.PaddingX + BoardDefault.MessageMargin) * this.dotUnit,
    };
  }

  protected abstract setCanvasSize(): void;
  protected abstract drawContent(p: p5): void;

  /**
   * Standardized p5 setup wrapper
   */
  protected createSketch() {
    return (p: p5) => {
      p.setup = () => {
        p.createCanvas(this.canvasSize.width, this.canvasSize.height);
        p.noLoop();

        p.windowResized = () => {
          this.setCanvasSize();
          p.resizeCanvas(this.canvasSize.width, this.canvasSize.height);
          p.redraw();
        };

        this.setupSubscriptions(p);
      };

      p.draw = () => {
        p.scale(this.scale);
        p.background(BACKGROUND_COLOR);
        p.noFill();

        this.drawBoard(p);
        this.drawContent(p);
      };
    };
  }

  protected setupSubscriptions(p: p5) {
    this.destroy$.subscribe(() => {
      console.log("destroying...");
    });
  }

  /**
   * Generalized offset animation for scroll or bumper transition
   * @param p - p5.js instance
   * @param a - animation options
   */
  protected createScrollAnimation = (p: p5, a: Animation) => {
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
  protected drawBoard(p: p5) {
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
  protected renderChar(p: p5, char: string, startX: number, startY: number, color: string) {
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
  protected messageOverflow(message: string): boolean {
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
  return message.length * (FONT_WIDTH + BoardDefault.CharGap) - BoardDefault.CharGap;
}

export default DotMatrix;
