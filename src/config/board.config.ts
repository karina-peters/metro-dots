import { FONT_HEIGHT } from "../helpers/dotFont.ts";

const DOT_RADIUS_PX = 4;
const DOT_GAP_PX = 1;

export const PAGE_PADDING_PX = 32;

export enum Dot {
  Radius = DOT_RADIUS_PX,
  Gap = DOT_GAP_PX,
  Unit = DOT_RADIUS_PX * 2 + DOT_GAP_PX,
}

export enum BoardDefault {
  Width = 120,
  PaddingX = 2,
  PaddingY = 2,
  CharGap = 1,
}

export enum ColumnType {
  Hug = "hug",
  Fill = "fill",
}

export enum TableBoardConfig {
  Rows = 4,
  RowGap = 4,
  ColGap = 4,
  Height = Rows * (FONT_HEIGHT + RowGap) - RowGap + 2 * BoardDefault.PaddingY,
  MaxMessageLength = 10,
  TypeSpeedMs = 50,
  TransitionDelayMs = 200,
}

export enum MessageBoardConfig {
  MessageMargin = 2,
  Height = FONT_HEIGHT + 2 * (BoardDefault.PaddingY + MessageMargin),
  BreakpointScale = 800,
  BumperWidth = 4,
  PauseMs = 2500,
  ScrollPauseMs = 1500,
  ScrollSpeedMs = 40,
  ScrollStep = 1,
  TransitionDelayMs = 200,
}
