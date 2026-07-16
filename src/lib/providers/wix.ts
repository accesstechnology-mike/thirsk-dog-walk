import { differenceInMinutes } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { AvailabilitySlot, Venue, WixConfig } from "../types";
import {
  APP_TIMEZONE,
  earliestArrivalIso,
  isReachableSlot,
  type SearchWindow,
} from "../time-window";
import { isTargetDuration } from "../venues";

const BOOKINGS_APP_ID = "13d21c63-b5ec-5912-8397-c3a5ddb27a97";

type AccessTokens = {
  apps: Record<string, { instance?: string }>;
};

type WixService = {
  id: string;
  name: string;
  description?: string;
  tagLine?: string;
  payment?: { fixed?: { price?: { value?: string; currency?: string } } };
  schedule?: { availabilityConstraints?: { durations?: Array<{ minutes?: number }> } };
  defaultCapacity?: number;
};

type TimeSlot = {
  serviceId: string;
  localStartDate: string;
  localEndDate: string;
  bookable: boolean;
};

function slugFromPath(path: string): string {
  return path.replace(/^\/booking-calendar\//, "").replace(/^\//, "");
}

async function getBookingsAuth(siteOrigin: string): Promise<string> {
  const res = await fetch(`${siteOrigin}/_api/v1/access-tokens`, {
    headers: {
      Accept: "application/json",
      Referer: `${siteOrigin}/`,
      "User-Agent": "thirsk-dog-walk/1.0",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Wix access-tokens ${res.status}`);
  }
  const tokens = (await res.json()) as AccessTokens;
  const instance = tokens.apps?.[BOOKINGS_APP_ID]?.instance;
  if (!instance) {
    throw new Error("Wix bookings instance token missing");
  }
  return instance;
}

async function wixPost<T>(
  siteOrigin: string,
  path: string,
  body: unknown,
  auth: string,
): Promise<T> {
  const res = await fetch(`${siteOrigin}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: auth,
      Origin: siteOrigin,
      Referer: `${siteOrigin}/`,
      "User-Agent": "thirsk-dog-walk/1.0",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Wix ${res.status} for ${path}`);
  }
  return res.json() as Promise<T>;
}

function serviceDurationMinutes(service: WixService): number | null {
  const fromConstraints =
    service.schedule?.availabilityConstraints?.durations?.[0]?.minutes;
  if (typeof fromConstraints === "number") return fromConstraints;
  // Fall back to name parsing for "55 minute..."
  const match = /(\d+)\s*minute/i.exec(service.name);
  if (match) return Number(match[1]);
  return null;
}

export async function fetchWixSlots(
  venue: Venue,
  config: WixConfig,
  window: SearchWindow,
  driveMinutes: number,
): Promise<AvailabilitySlot[]> {
  const auth = await getBookingsAuth(config.siteOrigin);
  const slots: AvailabilitySlot[] = [];

  const fromLocal = window.windowStart
    .toLocaleString("sv-SE", { timeZone: APP_TIMEZONE })
    .replace(" ", "T");
  const toLocal = window.windowEnd
    .toLocaleString("sv-SE", { timeZone: APP_TIMEZONE })
    .replace(" ", "T");

  for (const path of config.servicePaths) {
    const slug = slugFromPath(path);
    const servicesResp = await wixPost<{ services: WixService[] }>(
      config.siteOrigin,
      "/_api/bookings/v2/services/query",
      {
        conditionalFields: [
          "STAFF_MEMBER_DETAILS",
          "DISCOUNT_INFO_DETAILS",
          "STAFF_WORKING_HOURS_LOCATIONS",
        ],
        query: {
          filter: {
            appId: BOOKINGS_APP_ID,
            "supportedSlugs.name": slug,
            type: { $in: ["CLASS", "APPOINTMENT"] },
            "onlineBooking.enabled": true,
            $or: [{ hidden: false }, { hidden: { $exists: false } }],
          },
        },
      },
      auth,
    );

    const service = servicesResp.services?.[0];
    if (!service) continue;

    const duration = serviceDurationMinutes(service) ?? 55;
    if (!isTargetDuration(duration)) continue;

    const times = await wixPost<{ timeSlots: TimeSlot[] }>(
      config.siteOrigin,
      "/_api/service-availability/v2/time-slots",
      {
        serviceId: service.id,
        fromLocalDate: fromLocal,
        toLocalDate: toLocal,
        timeZone: APP_TIMEZONE,
        bookable: true,
        includeNonBookable: false,
        shouldReturnAllResources: true,
      },
      auth,
    );

    const price =
      service.payment?.fixed?.price?.value != null
        ? String(Number(service.payment.fixed.price.value) / 100)
        : null;
    const currency = service.payment?.fixed?.price?.currency ?? "GBP";

    for (const slot of times.timeSlots ?? []) {
      if (!slot.bookable) continue;
      const start = fromZonedTime(slot.localStartDate, APP_TIMEZONE);
      const end = fromZonedTime(slot.localEndDate, APP_TIMEZONE);
      if (!isReachableSlot(start, window.leaveAt, driveMinutes, window)) {
        continue;
      }
      const mins = differenceInMinutes(end, start);
      if (!isTargetDuration(mins)) continue;

      const date = slot.localStartDate.slice(0, 10);
      const time = slot.localStartDate.slice(11, 16);
      const bookingUrl =
        `${config.siteOrigin}${path.startsWith("/") ? path : `/${path}`}` +
        `?date=${date}&time=${encodeURIComponent(time)}`;

      slots.push({
        id: `wix-${venue.id}-${service.id}-${slot.localStartDate}`,
        venueId: venue.id,
        venueName: venue.name,
        facility: venue.name,
        serviceName: service.name,
        start: start.toISOString(),
        end: end.toISOString(),
        durationMinutes: mins,
        price,
        currency,
        bookingUrl,
        driveMinutes,
        earliestArrival: earliestArrivalIso(window.leaveAt, driveMinutes),
        // Wix calendar deep-links are best-effort; user may still tap the slot.
        timePreselected: false,
        provider: "wix",
      });
    }
  }

  return slots;
}
