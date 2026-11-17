/** Every movie, series and actor in the game comes from this period (inclusive). */
export const PERIOD_FROM = 2000;
export const PERIOD_TO = 2010;

export const inPeriod = (year?: number | null): year is number => !!year && year >= PERIOD_FROM && year <= PERIOD_TO;
