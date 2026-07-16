import { addDays, addMinutes, endOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export const APP_TIMEZONE = "Europe/London";

export type SearchWindow = {
  now: Date;
  windowStart: Date;
  windowEnd: Date;
};

/** Slots must start at least 30 minutes from now, through end of tomorrow (London). */
export function getSearchWindow(now = new Date()): SearchWindow {
  const windowStart = addMinutes(now, 30);
  const londonNow = toZonedTime(now, APP_TIMEZONE);
  const tomorrowLondon = addDays(londonNow, 1);
  const endOfTomorrowLondon = endOfDay(tomorrowLondon);
  const windowEnd = fromZonedTime(endOfTomorrowLondon, APP_TIMEZONE);

  return { now, windowStart, windowEnd };
}

export function isWithinWindow(
  start: Date,
  window: SearchWindow,
): boolean {
  return start >= window.windowStart && start <= window.windowEnd;
}

export function londonDateKeys(window: SearchWindow): string[] {
  const start = toZonedTime(window.windowStart, APP_TIMEZONE);
  const end = toZonedTime(window.windowEnd, APP_TIMEZONE);
  const keys: string[] = [];
  let cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (cursor <= endDay) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    keys.push(`${y}-${m}-${d}`);
    cursor = addDays(cursor, 1);
  }
  return keys;
}
