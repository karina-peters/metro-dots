import { ColumnType } from "../config/board.config";

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

export type BoardLayout = {
  numCols: number;
  scale: number;
  canvasSize: CanvasSize;
  textField: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

export type TableBoardData = {
  messageTable: string[][];
  stationId: string | undefined;
};

export type MessageBoardData = {
  messages: string[];
  lineCode: string | undefined;
  trainId: string | undefined;
};

export type CanvasSize = {
  width: number;
  height: number;
};

export type DotPosition = {
  xPos: number;
  yPos: number;
};

export type ColumnSpec = {
  index: number;
  text: string;
  type: ColumnType;
};
