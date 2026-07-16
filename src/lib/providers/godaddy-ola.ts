import { addMinutes, parseISO } from "date-fns";
import type { AvailabilitySlot, GoDaddyOlaConfig, Venue } from "../types";
import { isWithinWindow, type SearchWindow } from "../time-window";
import { isTargetDuration } from "../venues";

const OLA_ACCOUNT_ID = "25ade4ec-9abb-4f65-8be9-ed60eebb023d";
const OLA_V2 = `https://api.ola.godaddy.com/v2/accounts/${OLA_ACCOUNT_ID}`;
const OLA_V1 = `https://api.ola.godaddy.com/accounts/${OLA_ACCOUNT_ID}`;

type OlaService = {
  id: number;
  name: string;
  slug: string;
  duration: string; // ISO-8601 duration e.g. PT1H
  cost?: string;
  visible?: boolean;
  resource_ids?: number[];
};

function parseIsoDurationMinutes(duration: string): number | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(duration);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  return hours * 60 + minutes;
}

async function olaFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Origin: "https://cundalldogpark.co.uk",
      Referer: "https://cundalldogpark.co.uk/",
      "User-Agent": "thirsk-dog-walk/1.0",
    },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`GoDaddy OLA ${res.status} for ${url}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchGoDaddyOlaSlots(
  venue: Venue,
  config: GoDaddyOlaConfig,
  window: SearchWindow,
  driveMinutes: number,
): Promise<AvailabilitySlot[]> {
  const catalog = await olaFetch<{ results: OlaService[] }>(
    `${OLA_V1}/services?page_size=80`,
  );

  const wantedSlugs = new Set(config.services.map((s) => s.slug));
  const facilityBySlug = new Map(
    config.services.map((s) => [s.slug, s.facility] as const),
  );

  const services = catalog.results.filter((service) => {
    if (!service.visible) return false;
    if (!wantedSlugs.has(service.slug)) return false;
    const mins = parseIsoDurationMinutes(service.duration);
    return mins != null && isTargetDuration(mins);
  });

  const startIso = window.windowStart.toISOString();
  const endIso = window.windowEnd.toISOString();
  const slots: AvailabilitySlot[] = [];

  for (const service of services) {
    const mins = parseIsoDurationMinutes(service.duration) ?? 60;
    const resourceParam =
      service.resource_ids?.length
        ? `&resource_ids=${service.resource_ids.join(",")}`
        : "";
    const timesUrl =
      `${OLA_V2}/services/${service.id}/available_times` +
      `?start_time=${encodeURIComponent(startIso)}` +
      `&end_time=${encodeURIComponent(endIso)}` +
      resourceParam;

    const times = await olaFetch<{
      available_times: Record<string, Array<{ resource_id: number }>>;
    }>(timesUrl);

    for (const [timeKey] of Object.entries(times.available_times ?? {})) {
      const start = parseISO(timeKey);
      if (!isWithinWindow(start, window)) continue;
      const facility = facilityBySlug.get(service.slug) ?? venue.name;
      slots.push({
        id: `ola-${venue.id}-${service.id}-${timeKey}`,
        venueId: venue.id,
        venueName: venue.name,
        facility,
        serviceName: service.name,
        start: start.toISOString(),
        end: addMinutes(start, mins).toISOString(),
        durationMinutes: mins,
        price: service.cost ?? null,
        currency: "GBP",
        bookingUrl: `${config.bookingBaseUrl}/${service.slug}`,
        driveMinutes,
        provider: "godaddy-ola",
      });
    }
  }

  return slots;
}
