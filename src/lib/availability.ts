import { getCached, setCached } from "./cache";
import { getDriveTimesMinutes } from "./drive-times";
import { fetchVenueSlots } from "./providers";
import { getSearchWindow } from "./time-window";
import type { AvailabilityResponse, AvailabilitySlot, VenueFetchError } from "./types";
import { MAX_DRIVE_MINUTES, ORIGIN, VENUES } from "./venues";

const CACHE_TTL_MS = 90_000;

export type AvailabilityQuery = {
  leaveAt?: Date;
  includeTomorrow?: boolean;
};

function cacheKey(leaveAt: Date, includeTomorrow: boolean): string {
  // Round leaveAt to the minute so refreshes within the same minute hit cache.
  const rounded = new Date(leaveAt);
  rounded.setSeconds(0, 0);
  return `availability:v3:${rounded.toISOString()}:t${includeTomorrow ? 1 : 0}`;
}

export async function getAvailability(
  query: AvailabilityQuery = {},
): Promise<AvailabilityResponse> {
  const window = getSearchWindow({
    leaveAt: query.leaveAt,
    includeTomorrow: query.includeTomorrow,
  });
  const key = cacheKey(window.leaveAt, window.includeTomorrow);
  const cached = getCached<AvailabilityResponse>(key);
  if (cached) return cached;

  const driveTimes = await getDriveTimesMinutes();

  const inRange = VENUES.filter((venue) => {
    const mins = driveTimes[venue.id];
    return typeof mins === "number" && mins <= MAX_DRIVE_MINUTES;
  });

  const errors: VenueFetchError[] = [];
  const settled = await Promise.allSettled(
    inRange.map(async (venue) => {
      const driveMinutes = driveTimes[venue.id]!;
      return fetchVenueSlots(venue, window, driveMinutes);
    }),
  );

  const slots: AvailabilitySlot[] = [];
  settled.forEach((result, index) => {
    const venue = inRange[index]!;
    if (result.status === "fulfilled") {
      slots.push(...result.value);
    } else {
      const message =
        result.reason instanceof Error
          ? result.reason.message
          : "Failed to fetch availability";
      errors.push({
        venueId: venue.id,
        venueName: venue.name,
        message,
      });
    }
  });

  for (const venue of VENUES) {
    const mins = driveTimes[venue.id];
    if (typeof mins === "number" && mins > MAX_DRIVE_MINUTES) {
      errors.push({
        venueId: venue.id,
        venueName: venue.name,
        message: `${mins} min drive (over ${MAX_DRIVE_MINUTES} min limit)`,
      });
    }
  }

  const deduped = new Map<string, AvailabilitySlot>();
  for (const slot of slots) {
    const key = `${slot.venueId}|${slot.facility}|${slot.start}|${slot.durationMinutes}`;
    if (!deduped.has(key)) deduped.set(key, slot);
  }
  const uniqueSlots = [...deduped.values()].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  const filterSummary = window.includeTomorrow
    ? "Slots that start after you can arrive (leave time + drive), through end of tomorrow"
    : "Slots that start after you can arrive (leave time + drive), through end of your leave day";

  const response: AvailabilityResponse = {
    originPostcode: ORIGIN.postcode,
    generatedAt: new Date().toISOString(),
    leaveAt: window.leaveAt.toISOString(),
    includeTomorrow: window.includeTomorrow,
    windowStart: window.windowStart.toISOString(),
    windowEnd: window.windowEnd.toISOString(),
    maxDriveMinutes: MAX_DRIVE_MINUTES,
    filterSummary,
    slots: uniqueSlots,
    errors,
    driveTimes,
  };

  setCached(key, response, CACHE_TTL_MS);
  return response;
}
