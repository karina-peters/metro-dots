import { ColumnType } from "../config/board.config";

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
  dataId: string | undefined;
};

export type MessageBoardData = {
  messages: string[];
  bumperColor: string | undefined;
  dataId: string | undefined;
};

export type CanvasSize = {
  width: number;
  height: number;
};

export type DotPosition = {
  xPos: number;
  yPos: number;
};

export type TableColumnSpec = {
  index: number;
  text: string;
  type: ColumnType;
};

export type TableLayoutInput = {
  availableSpace: number;
  dotUnit: number;
  dotGap: number;
  minWidthWide: number;
  minWidthNarrow: number;
};

export type TableLayout = {
  columnHidden: boolean;
  dotColumnCount: number;
  scale: number;
};
