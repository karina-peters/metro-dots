import p5 from "p5";
import {
  timer,
  takeWhile,
  tap,
  switchMap,
  finalize,
  takeUntil,
  of,
  delay,
  distinctUntilChanged,
  forkJoin,
  Subscription,
  catchError,
  EMPTY,
  Subject,
} from "rxjs";

import { DotColor } from "../models/colors.model.ts";
import { AnimationType, SlideDirection, TransitionPhase } from "../models/animation.model.ts";
import type { MessageBoardData, DotPosition } from "../models/board.model.ts";

import { Dot, BoardDefault, MessageBoardConfig, PAGE_PADDING_PX } from "../config/board.config.ts";
import { OffsetAnimation, slideDisplacement, slideDistance } from "../helpers/offsetAnimation.ts";
import { FONT_WIDTH } from "../helpers/dotFont.ts";

import DotMatrix, { getMessageLength } from "./dotMatrix.ts";

const DEFAULT_MESSAGE_INDEX = 0;

class MessageBoard extends DotMatrix {
  public data$: Subject<MessageBoardData> = new Subject<MessageBoardData>();
  public sketch = this.createSketch();

  // Data
  private messages: string[];
  private currentMsgIndex = 0;
  private currentMessage = "";
  private dataId: string | undefined;
  private bumperColor: string = DotColor.Off;

  // Board State
  private messageTimer$: Subscription | null = null;

  // Animations
  private readonly animationOpts = { intervalMs: MessageBoardConfig.ScrollSpeedMs, step: MessageBoardConfig.ScrollStep };
  private entrance = { kind: AnimationType.Slide, direction: SlideDirection.Down };
  private scroll = new OffsetAnimation(this.animationOpts, () => this.redraw$.next(), this.destroy$);
  private bumper = new OffsetAnimation(this.animationOpts, () => this.redraw$.next(), this.destroy$);
  private slide = new OffsetAnimation(this.animationOpts, () => this.redraw$.next(), this.destroy$);

  private parentElt: HTMLElement;

  constructor(parentElt: HTMLElement, messages: string[]) {
    super(MessageBoardConfig.Height, BoardDefault.Width);

    this.parentElt = parentElt;

    this.currentMsgIndex = DEFAULT_MESSAGE_INDEX;
    this.bumperColor = DotColor.Off;
    this.messages = messages;

    this.setCanvasSize();
  }

  protected override setCanvasSize() {
    if (window.innerWidth < MessageBoardConfig.BreakpointScale) {
      // Scale entire board
      this.dotColumnCount = BoardDefault.Width;
      this.scale = (window.innerWidth - PAGE_PADDING_PX) / (this.dotColumnCount * Dot.Unit - Dot.Gap);
    } else {
      // Reduce number of dot columns
      this.dotColumnCount = Math.floor(this.parentElt.clientWidth / Dot.Unit) || BoardDefault.Width;
      this.scale = 1;
    }

    this.canvasSize = {
      width: this.scale * this.dotColumnCount * this.dotUnit - this.dotGap,
      height: this.scale * this.dotRowCount * this.dotUnit - this.dotGap,
    };

    this.textField = {
      top: BoardDefault.PaddingY + BoardDefault.MessageMargin,
      right: (this.dotColumnCount - MessageBoardConfig.BumperWidth - BoardDefault.MessageMargin) * this.dotUnit - this.dotGap,
      bottom: (this.dotRowCount - BoardDefault.PaddingY - BoardDefault.MessageMargin) * this.dotUnit - this.dotGap,
      left: (MessageBoardConfig.BumperWidth + BoardDefault.MessageMargin) * this.dotUnit,
    };
  }

  protected override setupSubscriptions(p: p5): void {
    super.setupSubscriptions(p);

    this.data$
      .pipe(
        tap(({ messages }) => (this.messages = messages)),
        distinctUntilChanged((prev, curr) => prev.dataId === curr.dataId),
        switchMap(({ dataId, bumperColor }) =>
          this.doTransition$(p, dataId, bumperColor).pipe(
            tap(() => this.startMessageTimer(p)),
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
    let { xPos, yPos } = this.messageStartPos;

    if (this.scroll.active) {
      xPos -= this.scroll.progress * this.dotUnit;
    }

    if (this.slide.active) {
      const d = slideDisplacement(this.entrance.direction, this.slide.remaining);
      xPos += d.x * this.dotUnit;
      yPos += d.y * this.dotUnit;
    }

    let startX = xPos;
    for (const [i, char] of Array.from(this.currentMessage).entries()) {
      this.renderChar(p, char, startX, yPos, DotColor.On);

      startX += this.dotUnit * (FONT_WIDTH + BoardDefault.CharGap);
    }
  }

  /**
   * Start or restart the message display timer
   * Handles static and scrolling display based on message length
   * @param p - p5.js instance
   */
  private startMessageTimer(p: p5): void {
    this.clearSubscriptions();

    p.redraw();

    const needsScroll = this.messageOverflow(this.currentMessage);
    const timerDelay = needsScroll ? MessageBoardConfig.ScrollPauseMs : MessageBoardConfig.PauseMs;

    this.messageTimer$ = timer(timerDelay)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => (needsScroll ? this.scrollMessage$() : of(null))),
        takeWhile(() => !this.isInTransition),
        tap(() => this.nextMessage(p)),
      )
      .subscribe();
  }

  /**
   * Starts transition animation for newly selected data
   * @param p - p5.js instance
   * @param newDataId - id of the newly selected data
   * @param newBumperColor - bumper color for the newly selected data
   * @returns an Observable of the transition animation
   */
  private doTransition$ = (p: p5, newDataId: string | undefined, newBumperColor: string | undefined) => {
    this.isInTransition = true;
    this.clearSubscriptions();

    return of(null).pipe(
      takeUntil(this.destroy$),
      switchMap(() => {
        this.transitionPhase = TransitionPhase.Out;
        return this.dataId ? this.animateBumpers$() : of(null);
      }),
      tap(() => {
        this.transitionPhase = TransitionPhase.Change;
        console.log(`changing from ${this.dataId} to ${newDataId}`);

        this.bumperColor = newBumperColor || DotColor.Off;
        this.dataId = newDataId;
        this.setMessage(DEFAULT_MESSAGE_INDEX);
      }),
      delay(MessageBoardConfig.TransitionDelayMs),
      switchMap(() => {
        this.transitionPhase = TransitionPhase.In;
        return forkJoin([this.animateBumpers$(), this.slideMessageIn$(SlideDirection.Down)]);
      }),
      finalize(() => {
        this.isInTransition = false;
      }),
    );
  };

  protected override backgroundDotColor(_row: number, col: number): string {
    const visible = this.bumperVisible;
    const inBumper = col < visible || col >= this.dotColumnCount - visible;

    return inBumper ? this.bumperColor : DotColor.Off;
  }

  private get bumperVisible(): number {
    switch (this.transitionPhase) {
      case TransitionPhase.Out:
        return this.bumper.active ? MessageBoardConfig.BumperWidth - this.bumper.progress : 0;
      case TransitionPhase.Change:
        return 0;
      case TransitionPhase.In:
        return this.bumper.active ? this.bumper.progress : MessageBoardConfig.BumperWidth;
      default:
        return MessageBoardConfig.BumperWidth;
    }
  }

  /**
   * Start scrolling animation for a message that doesn't fit on the display
   */
  private scrollMessage$ = () => {
    console.log("scrolling...");

    const distance = getMessageLength(this.currentMessage) + MessageBoardConfig.BumperWidth + 2 * BoardDefault.MessageMargin;
    return this.scroll.run$(distance);
  };

  private slideMessageIn$ = (direction: SlideDirection) => {
    console.log("sliding message in...");

    this.entrance.direction = direction;
    const distance = slideDistance(direction, { columns: this.dotColumnCount });
    return this.slide.run$(distance);
  };

  private animateBumpers$ = () => {
    console.log(`animating bumpers ${this.transitionPhase}...`);

    return this.bumper.run$(MessageBoardConfig.BumperWidth);
  };

  /**
   * Calculate the starting position for drawing the message
   * Centers short messages and positions overflow messages for scrolling
   *
   * @returns x and y coordinates in pixels
   */
  private get messageStartPos(): DotPosition {
    let startX = this.dotRadius + MessageBoardConfig.BumperWidth * this.dotUnit;
    let startY = this.dotUnit * (BoardDefault.PaddingY + BoardDefault.MessageMargin) + this.dotRadius;
    let msgLength = getMessageLength(this.currentMessage);

    if (!this.messageOverflow(this.currentMessage)) {
      startX += Math.floor((this.dotColumnCount - MessageBoardConfig.BumperWidth * 2 - msgLength) / 2) * this.dotUnit; // Center align
    } else {
      startX += BoardDefault.MessageMargin * this.dotUnit; // Left align with padding
    }

    return { xPos: startX, yPos: startY };
  }

  private setMessage(index: number): void {
    const count = this.messages.length;
    this.currentMsgIndex = count > 0 ? index % count : 0;
    this.currentMessage = this.messages[this.currentMsgIndex] ?? "";
  }

  private nextMessage(p: p5): void {
    this.setMessage(this.currentMsgIndex + 1);
    this.startMessageTimer(p);
  }

  private clearSubscriptions(): void {
    if (this.messageTimer$) {
      this.messageTimer$.unsubscribe();
      this.messageTimer$ = null;
    }
  }
}

export default MessageBoard;
