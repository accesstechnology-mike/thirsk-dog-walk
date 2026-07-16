import { addMinutes } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { AmeliaConfig, AvailabilitySlot, Venue } from "../types";
import {
  APP_TIMEZONE,
  isWithinWindow,
  londonDateKeys,
  type SearchWindow,
} from "../time-window";
import { isTargetDuration } from "../venues";

type AmeliaService = {
  id: number;
  name: string;
  duration: number; // seconds
  price: number;
  status: string;
  categoryId?: number;
};

type AmeliaCategory = {
  id: number;
  name: string;
  serviceList: AmeliaService[];
};

type AmeliaEmployee = {
  id: number;
  firstName?: string;
  lastName?: string;
  status: string;
};

type EntitiesResponse = {
  data: {
    categories: AmeliaCategory[];
    employees: AmeliaEmployee[];
  };
};

type SlotsResponse = {
  data: {
    slots: Record<string, Record<string, unknown>>;
  };
};

function ameliaUrl(call: string, params: Record<string, string | number>): string {
  const search = new URLSearchParams({
    action: "wpamelia_api",
    call,
  });
  for (const [key, value] of Object.entries(params)) {
    search.set(key, String(value));
  }
  return `https://dogzoneripon.co.uk/wp-admin/admin-ajax.php?${search}`;
}

async function ameliaFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Referer: "https://dogzoneripon.co.uk/book-online/",
      "User-Agent": "thirsk-dog-walk/1.0",
    },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Amelia ${res.status} for ${url}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchAmeliaSlots(
  venue: Venue,
  config: AmeliaConfig,
  window: SearchWindow,
  driveMinutes: number,
): Promise<AvailabilitySlot[]> {
  const entities = await ameliaFetch<EntitiesResponse>(
    ameliaUrl("/entities", {
      lite: "true",
      types: "locations,employees,categories,custom_fields,packages,taxes",
      page: "booking",
    }),
  );

  const employee =
    entities.data.employees.find((e) => e.status === "visible") ??
    entities.data.employees[0];
  if (!employee) {
    throw new Error("No Amelia employees found for Dogzone");
  }

  const categoryById = new Map(
    entities.data.categories.map((c) => [c.id, c.name] as const),
  );

  const hourServices = entities.data.categories
    .flatMap((c) => c.serviceList.map((s) => ({ ...s, categoryId: c.id })))
    .filter(
      (s) =>
        s.status === "visible" &&
        isTargetDuration(Math.round(s.duration / 60)),
    );

  const dateKeys = londonDateKeys(window);
  const slots: AvailabilitySlot[] = [];

  for (const service of hourServices) {
    const params = new URLSearchParams({
      action: "wpamelia_api",
      call: "/slots",
      serviceId: String(service.id),
      persons: "1",
      serviceDuration: String(service.duration),
      startDateTime: `${dateKeys[0]} 00:00`,
      endDateTime: `${dateKeys[dateKeys.length - 1]} 23:59`,
    });
    // Amelia expects providerIds[] query key
    params.append("providerIds[]", String(employee.id));

    const url = `https://dogzoneripon.co.uk/wp-admin/admin-ajax.php?${params}`;
    const payload = await ameliaFetch<SlotsResponse>(url);
    const dayMap = payload.data?.slots ?? {};

    for (const day of dateKeys) {
      const times = dayMap[day];
      if (!times) continue;
      for (const time of Object.keys(times)) {
        const localIso = `${day}T${time}:00`;
        const start = fromZonedTime(localIso, APP_TIMEZONE);
        if (!isWithinWindow(start, window)) continue;
        const durationMinutes = Math.round(service.duration / 60);
        const facility = categoryById.get(service.categoryId ?? -1) ?? venue.name;
        slots.push({
          id: `amelia-${venue.id}-${service.id}-${day}-${time}`,
          venueId: venue.id,
          venueName: venue.name,
          facility,
          serviceName: service.name,
          start: start.toISOString(),
          end: addMinutes(start, durationMinutes).toISOString(),
          durationMinutes,
          price: String(service.price),
          currency: "GBP",
          bookingUrl: config.bookingUrl,
          driveMinutes,
          provider: "amelia",
        });
      }
    }
  }

  return slots;
}
