export enum TransitionPhase {
  None = "none",
  Out = "out",
  In = "in",
  Change = "change",
}

export enum SlideDirection {
  Left = "left",
  Right = "right",
  Up = "up",
  Down = "down",
}

export enum AnimationType {
  Slide = "slide",
}

export interface OffsetAnimationOptions {
  intervalMs: number;
  step: number;
}
