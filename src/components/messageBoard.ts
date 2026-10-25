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
import { SlideDirection, TransitionPhase } from "../models/board.model.ts";
import type { MessageBoardData, DotPosition } from "../models/board.model.ts";

import { Dot, BoardDefault, MessageBoardConfig, PAGE_PADDING_PX } from "../config/board.config.ts";
import { FONT_HEIGHT, FONT_WIDTH } from "../helpers/dotFont.ts";

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
  private scrollOffset = 0;
  private isScrolling = false;
  private slideOffset = 0;
  private isSliding = false;
  private bumperOffset = 0;
  private isBumping = true;

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
    let { xPos, yPos } = this.calcStartPosition();

    if (this.isScrolling) {
      xPos -= this.scrollOffset * this.dotUnit;
    }

    if (this.isSliding) {
      // TODO: handle different directions
      yPos = yPos + (this.slideOffset - FONT_HEIGHT - BoardDefault.MessageMargin - BoardDefault.PaddingY) * this.dotUnit;
    }

    let messageWidth = 0;
    for (const char of this.currentMessage) {
      const charStartX = xPos + messageWidth;
      this.renderChar(p, char, charStartX, yPos, DotColor.On);

      messageWidth += this.dotUnit * (FONT_WIDTH + BoardDefault.CharGap);
    }
  }

  /**
   * Start or restart the message display timer
   * Handles static and scrolling display based on message length
   * @param p - p5.js instance
   */
  private startMessageTimer(p: p5): void {
    this.clearSubscriptions();

    this.scrollOffset = 0;
    this.isScrolling = false;

    p.redraw();

    const needsScroll = this.messageOverflow(this.currentMessage);
    const timerDelay = needsScroll ? MessageBoardConfig.ScrollPauseMs : MessageBoardConfig.PauseMs;

    this.messageTimer$ = timer(timerDelay)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => (needsScroll ? this.scrollMessage$(p) : of(null))),
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
        return this.dataId ? this.animateBumpers$(p) : of(null);
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
        return forkJoin([this.animateBumpers$(p), this.slideMessageIn$(p, SlideDirection.Down)]);
      }),
      finalize(() => {
        this.isInTransition = false;
        this.bumperOffset = 0;
        this.slideOffset = 0;
      }),
    );
  };

  /**
   * Start scrolling animation for a message that doesn't fit on the display
   * @param p - p5.js instance
   */
  private scrollMessage$ = (p: p5) => {
    console.log("scrolling...");

    return this.createScrollAnimation(p, {
      speed: MessageBoardConfig.ScrollSpeedMs,
      step: MessageBoardConfig.ScrollStep,
      totalDistance: getMessageLength(this.currentMessage) + MessageBoardConfig.BumperWidth + 2 * BoardDefault.MessageMargin,
      onStart: () => {
        this.isScrolling = true;
      },
      onStep: () => {
        this.scrollOffset += MessageBoardConfig.ScrollStep;
      },
      onFinalize: () => {
        this.scrollOffset = 0;
        this.isScrolling = false;
      },
    });
  };

  private slideMessageIn$ = (p: p5, /* TODO */ direction: SlideDirection) => {
    console.log("sliding message in...");

    return this.createScrollAnimation(p, {
      speed: MessageBoardConfig.ScrollSpeedMs,
      step: MessageBoardConfig.ScrollStep,
      totalDistance: FONT_HEIGHT + BoardDefault.PaddingY + BoardDefault.MessageMargin,
      onStart: () => {
        this.isSliding = true;
      },
      onStep: () => {
        this.slideOffset += MessageBoardConfig.ScrollStep;
      },
      onFinalize: () => {
        this.isSliding = false;
        this.slideOffset = 0;
      },
    });
  };

  private splitMessageIn$ = () => {
    // TODO - add an animation to make the top half of the message slide in from to top and the bottom from the bottom
  };

  /**
   * Start bumper transition animation
   * @param p - p5.js instance
   * @returns
   */
  private animateBumpers$ = (p: p5) => {
    console.log(`animating bumpers ${this.transitionPhase}...`);

    return this.createScrollAnimation(p, {
      speed: MessageBoardConfig.ScrollSpeedMs,
      step: MessageBoardConfig.ScrollStep,
      totalDistance: MessageBoardConfig.BumperWidth,
      onStart: () => {
        this.isBumping = true;
      },
      onStep: () => {
        this.bumperOffset += MessageBoardConfig.ScrollStep;
      },
      onFinalize: () => {
        this.isBumping = false;
        this.bumperOffset = 0;
      },
    });
  };

  // TODO: handle in base class, pass in spec
  drawBoard(p: p5): void {
    let dotX = this.dotRadius;
    let dotY = this.dotRadius;
    let bumperVisible = MessageBoardConfig.BumperWidth;

    // Handle transition bumper animation
    if (this.isBumping) {
      if (this.transitionPhase === TransitionPhase.In) {
        bumperVisible = this.bumperOffset;
      } else if (this.transitionPhase === TransitionPhase.Out) {
        bumperVisible = MessageBoardConfig.BumperWidth - this.bumperOffset;
      } else {
        bumperVisible = 0;
      }
    }

    for (let i = 0; i < MessageBoardConfig.Height; i++) {
      dotX = this.dotRadius;

      for (let j = 0; j < this.dotColumnCount; j++) {
        const color = j < bumperVisible || j >= this.dotColumnCount - bumperVisible ? this.bumperColor : DotColor.Off;
        p.fill(color);
        p.ellipseMode(p.RADIUS);
        p.ellipse(dotX, dotY, this.dotRadius, this.dotRadius);

        dotX += this.dotUnit;
      }

      dotY += this.dotUnit;
    }
  }

  /**
   * Calculate the starting position for drawing the message
   * Centers short messages and positions overflow messages for scrolling
   *
   * @returns x and y coordinates in pixels
   */
  private calcStartPosition(): DotPosition {
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
