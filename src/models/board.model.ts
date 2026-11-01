import { ColumnAlign, ColumnType } from "@config/board.config";
import { DotColor } from "./colors.model";

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
  messageTable: TableRow[];
  dataId: string | undefined;
  viewKey: string | undefined;
};

export interface ColumnLayout {
  type: ColumnType;
  align: ColumnAlign;
}

export interface TableBoardOptions {
  header: string[];
  rows: TableRow[];
  layout: readonly ColumnLayout[];
  updateCol?: number | null;
  hiddenCol?: number | null;
  bumper?: {
    col: number;
    colorFor: (value: string) => string | undefined;
  };
  charColor?: (col: number, char: string) => DotColor | undefined;
}

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
  align: ColumnAlign;
};

export interface ColumnGeometry {
  start: number;
  width: number;
  align: ColumnAlign;
}

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

export interface TableRow {
  id: number;
  cells: string[];
}

export type TableCell = {
  row: number;
  col: number;
};
