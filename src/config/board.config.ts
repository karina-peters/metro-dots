import { FONT_HEIGHT, FONT_WIDTH } from "@helpers/dotFont.ts";

const DOT_RADIUS_PX = 4;
const DOT_GAP_PX = 1;

export const PAGE_PADDING_PX = 32;

export enum Dot {
  Radius = DOT_RADIUS_PX,
  Gap = DOT_GAP_PX,
  Unit = DOT_RADIUS_PX * 2 + DOT_GAP_PX,
}

export enum DefaultBoardConfig {
  Width = 120,
  CharGap = 1,
  MessageMargin = 2,
}

export enum ColumnType {
  Hug = "hug",
  Fill = "fill",
}

export enum ColumnAlign {
  Left,
  Center,
  Right,
}

export enum TableBoardConfig {
  PaddingX = 2,
  PaddingY = 2,
  Rows = 4,
  RowGap = 4,
  ColGap = 4,
  BumperHeight = FONT_HEIGHT + 2,
  BumperWidth = DefaultBoardConfig.MessageMargin + FONT_WIDTH * 2,
  Height = Rows * (FONT_HEIGHT + RowGap) - RowGap + 2 * PaddingY,
  MinFillChars = 10,
  TypeSpeedMs = 30,
  BlinkIntervalMs = 300,
  BlinkCount = 3,
  ScrollSpeedMs = 30,
}

export enum MessageBoardConfig {
  PaddingX = 0,
  PaddingY = 2,
  Height = FONT_HEIGHT + 2 * (PaddingY + DefaultBoardConfig.MessageMargin),
  BreakpointScale = 800,
  BumperWidth = 9,
  PauseMs = 2500,
  ScrollPauseMs = 1500,
  ScrollSpeedMs = 40,
  ScrollStep = 1,
  TransitionDelayMs = 200,
}
