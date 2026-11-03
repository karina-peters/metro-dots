export const DEBUG: boolean = process.env.NODE_ENV === "development" || process.env.DEBUG_LOGS === "true";

export const debug = (...args: unknown[]): void => {
  if (DEBUG) {
    console.log(...args);
  }
};
