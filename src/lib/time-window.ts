import { addDays, addMinutes, endOfDay, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export const APP_TIMEZONE = "Europe/London";

export type SearchWindow = {
  now: Date;
  /** When the user plans to leave the house (YO7 4SQ). */
  leaveAt: Date;
  /**
   * Earliest fetch bound (leaveAt). Per-venue reachability still applies
   * leaveAt + driveMinutes when filtering slots.
   */
  windowStart: Date;
  windowEnd: Date;
  /** If false, UI/API only returns slots on the leave calendar day. */
  includeTomorrow: boolean;
};

function londonEndOfDay(d: Date): Date {
  const london = toZonedTime(d, APP_TIMEZONE);
  return fromZonedTime(endOfDay(london), APP_TIMEZONE);
}

function londonStartOfDay(d: Date): Date {
  const london = toZonedTime(d, APP_TIMEZONE);
  return fromZonedTime(startOfDay(london), APP_TIMEZONE);
}

/**
 * Fetch window from leave-at through end of leave day, or end of the next
 * London day when includeTomorrow is set.
 */
export function getSearchWindow(options?: {
  now?: Date;
  leaveAt?: Date;
  includeTomorrow?: boolean;
}): SearchWindow {
  const now = options?.now ?? new Date();
  const leaveAt = options?.leaveAt ?? now;
  const includeTomorrow = options?.includeTomorrow ?? false;

  const leaveDayEnd = londonEndOfDay(leaveAt);
  const windowEnd = includeTomorrow
    ? londonEndOfDay(addDays(toZonedTime(leaveAt, APP_TIMEZONE), 1))
    : leaveDayEnd;

  return {
    now,
    leaveAt,
    windowStart: leaveAt,
    windowEnd,
    includeTomorrow,
  };
}

/** Slot must start on/after leaveAt + drive time, and within the search window. */
export function isReachableSlot(
  start: Date,
  leaveAt: Date,
  driveMinutes: number,
  window: SearchWindow,
): boolean {
  const earliestArrival = addMinutes(leaveAt, driveMinutes);
  return start >= earliestArrival && start <= window.windowEnd;
}

export function isWithinWindow(start: Date, window: SearchWindow): boolean {
  return start >= window.windowStart && start <= window.windowEnd;
}

export function londonDateKeys(window: SearchWindow): string[] {
  const start = toZonedTime(window.leaveAt, APP_TIMEZONE);
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

export function earliestArrivalIso(leaveAt: Date, driveMinutes: number): string {
  return addMinutes(leaveAt, driveMinutes).toISOString();
}

/** datetime-local value in Europe/London for an Instant. */
export function toDatetimeLocalValue(date: Date): string {
  const london = toZonedTime(date, APP_TIMEZONE);
  const y = london.getFullYear();
  const mo = String(london.getMonth() + 1).padStart(2, "0");
  const d = String(london.getDate()).padStart(2, "0");
  const h = String(london.getHours()).padStart(2, "0");
  const mi = String(london.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${d}T${h}:${mi}`;
}

/** Parse datetime-local as Europe/London wall time. */
export function fromDatetimeLocalValue(value: string): Date {
  return fromZonedTime(value, APP_TIMEZONE);
}

export { londonEndOfDay, londonStartOfDay };
