import { ORIGIN, VENUES } from "./venues";
import type { LatLng } from "./types";

type CacheEntry = {
  expiresAt: number;
  times: Record<string, number>;
};

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function coordPair(loc: LatLng): string {
  return `${loc.lng},${loc.lat}`;
}

/**
 * Real driving durations (minutes) from YO7 4SQ via public OSRM table API.
 */
export async function getDriveTimesMinutes(): Promise<Record<string, number>> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.times;
  }

  const destinations = VENUES.map((v) => coordPair(v.location)).join(";");
  const origin = coordPair(ORIGIN.location);
  const url = `https://router.project-osrm.org/table/v1/driving/${origin};${destinations}?sources=0&annotations=duration`;

  const res = await fetch(url, {
    headers: { "User-Agent": "thirsk-dog-walk/1.0" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`OSRM drive-time request failed (${res.status})`);
  }

  const data = (await res.json()) as {
    durations?: (number | null)[][];
    code?: string;
  };

  if (data.code !== "Ok" || !data.durations?.[0]) {
    throw new Error("OSRM returned no drive durations");
  }

  const secondsRow = data.durations[0].slice(1);
  const times: Record<string, number> = {};
  VENUES.forEach((venue, i) => {
    const seconds = secondsRow[i];
    if (typeof seconds === "number") {
      times[venue.id] = Math.round(seconds / 60);
    }
  });

  cache = { expiresAt: Date.now() + CACHE_TTL_MS, times };
  return times;
}
