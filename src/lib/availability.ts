import { getCached, setCached } from "./cache";
import { getDriveTimesMinutes } from "./drive-times";
import { fetchVenueSlots } from "./providers";
import { getSearchWindow } from "./time-window";
import type { AvailabilityResponse, AvailabilitySlot, VenueFetchError } from "./types";
import { MAX_DRIVE_MINUTES, ORIGIN, VENUES } from "./venues";

const CACHE_TTL_MS = 90_000;

export async function getAvailability(): Promise<AvailabilityResponse> {
  const cached = getCached<AvailabilityResponse>("availability:v1");
  if (cached) return cached;

  const window = getSearchWindow();
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

  // Also report venues skipped for drive distance
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

  slots.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  const response: AvailabilityResponse = {
    originPostcode: ORIGIN.postcode,
    generatedAt: new Date().toISOString(),
    windowStart: window.windowStart.toISOString(),
    windowEnd: window.windowEnd.toISOString(),
    maxDriveMinutes: MAX_DRIVE_MINUTES,
    slots,
    errors,
    driveTimes,
  };

  setCached("availability:v1", response, CACHE_TTL_MS);
  return response;
}
