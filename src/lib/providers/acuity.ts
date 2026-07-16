import { addMinutes, parseISO } from "date-fns";
import type { AvailabilitySlot, Venue } from "../types";
import type { AcuityConfig } from "../types";
import {
  APP_TIMEZONE,
  isWithinWindow,
  londonDateKeys,
  type SearchWindow,
} from "../time-window";
import { isTargetDuration } from "../venues";

type AcuityAppointmentType = {
  id: number;
  name: string;
  active: boolean | string;
  description?: string;
  duration: number;
  price?: string;
  category?: string;
  private?: boolean;
  type?: string;
  calendarIDs: number[];
};

type AcuityCalendar = {
  id: number;
  name: string;
  description?: string;
  location?: string;
};

type AcuityBusiness = {
  id: number;
  ownerKey: string;
  name: string;
  currencyAbbreviation?: string;
  prettyUrl?: string;
  url?: string;
  timezone?: string;
  appointmentTypes: Record<string, AcuityAppointmentType[]>;
  calendars: Record<string, AcuityCalendar[]>;
};

type TimesResponse = Record<
  string,
  Array<{ time: string; slotsAvailable: number }>
>;

const ACUITY_BASE = "https://app.acuityscheduling.com/api/scheduling/v1";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "thirsk-dog-walk/1.0",
    },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Acuity ${res.status} for ${url}`);
  }
  return res.json() as Promise<T>;
}

function flattenTypes(
  appointmentTypes: AcuityBusiness["appointmentTypes"],
): AcuityAppointmentType[] {
  return Object.values(appointmentTypes).flat();
}

function flattenCalendars(
  calendars: AcuityBusiness["calendars"],
): AcuityCalendar[] {
  return Object.values(calendars).flat();
}

function isActive(type: AcuityAppointmentType): boolean {
  return type.active === true || type.active === "true";
}

function categoryExcluded(category: string | undefined, excludes?: string[]): boolean {
  if (!category || !excludes?.length) return false;
  const lower = category.toLowerCase();
  return excludes.some((ex) => lower.includes(ex.toLowerCase()));
}

function calendarAllowed(
  calendar: AcuityCalendar | undefined,
  config: AcuityConfig,
): boolean {
  if (!calendar) return true;
  const name = calendar.name ?? "";
  if (
    config.calendarNameExcludes?.some((ex) =>
      name.toLowerCase().includes(ex.toLowerCase()),
    )
  ) {
    return false;
  }
  if (config.calendarNameIncludes?.length) {
    return config.calendarNameIncludes.some((inc) =>
      name.toLowerCase().includes(inc.toLowerCase()),
    );
  }
  return true;
}

function looksLikePrivateHire(type: AcuityAppointmentType): boolean {
  const blob = `${type.category ?? ""} ${type.name}`.toLowerCase();
  if (
    blob.includes("trade") ||
    blob.includes("package") ||
    blob.includes("gift") ||
    blob.includes("dog walker") ||
    blob.includes("professional") ||
    blob.includes("block booking")
  ) {
    return false;
  }
  return true;
}

function bookingUrl(
  business: AcuityBusiness,
  type: AcuityAppointmentType,
  calendarId: number,
  datetime: string,
): string {
  const base =
    business.prettyUrl?.replace(/\/$/, "") ||
    `https://app.acuityscheduling.com/schedule.php?owner=${business.id}`;
  const params = new URLSearchParams({
    appointmentType: String(type.id),
    calendarID: String(calendarId),
    datetime,
  });
  if (base.includes("schedule.php")) {
    return `${base}&${params.toString()}`;
  }
  return `${base}?${params.toString()}`;
}

export async function fetchAcuitySlots(
  venue: Venue,
  config: AcuityConfig,
  window: SearchWindow,
  driveMinutes: number,
): Promise<AvailabilitySlot[]> {
  const business = await fetchJson<AcuityBusiness>(
    `${ACUITY_BASE}/business?owner=${encodeURIComponent(config.ownerKey)}`,
  );

  const calendars = flattenCalendars(business.calendars);
  const calendarById = new Map(calendars.map((c) => [c.id, c]));

  const hourTypes = flattenTypes(business.appointmentTypes).filter((type) => {
    if (!isActive(type)) return false;
    if (type.private) return false;
    if (type.type && type.type !== "service") return false;
    if (!isTargetDuration(type.duration)) return false;
    if (categoryExcluded(type.category, config.categoryExcludes)) return false;
    if (!looksLikePrivateHire(type)) return false;
    const allowedCalendars = type.calendarIDs.filter((id) =>
      calendarAllowed(calendarById.get(id), config),
    );
    return allowedCalendars.length > 0;
  });

  const dateKeys = londonDateKeys(window);
  const slots: AvailabilitySlot[] = [];
  const seen = new Set<string>();

  for (const type of hourTypes) {
    const calendarIds = type.calendarIDs.filter((id) =>
      calendarAllowed(calendarById.get(id), config),
    );

    for (const calendarId of calendarIds) {
      // One request per type/calendar — Acuity returns nearby days from startDate.
      const params = new URLSearchParams({
        owner: config.ownerKey,
        appointmentTypeId: String(type.id),
        calendarId: String(calendarId),
        startDate: dateKeys[0]!,
        timezone: APP_TIMEZONE,
      });
      const times = await fetchJson<TimesResponse>(
        `${ACUITY_BASE}/availability/times?${params}`,
      );

      for (const [day, daySlots] of Object.entries(times)) {
        if (!dateKeys.includes(day)) continue;
        for (const entry of daySlots) {
          if (!entry.slotsAvailable) continue;
          const start = parseISO(entry.time);
          if (!isWithinWindow(start, window)) continue;
          const calendar = calendarById.get(calendarId);
          const facility =
            type.category?.trim() ||
            calendar?.name?.trim() ||
            venue.name;
          const dedupeKey = `${venue.id}|${facility}|${entry.time}|${type.duration}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          const end = addMinutes(start, type.duration);
          slots.push({
            id: `acuity-${venue.id}-${type.id}-${calendarId}-${entry.time}`,
            venueId: venue.id,
            venueName: venue.name,
            facility,
            serviceName: type.name,
            start: start.toISOString(),
            end: end.toISOString(),
            durationMinutes: type.duration,
            price: type.price ?? null,
            currency: business.currencyAbbreviation ?? "GBP",
            bookingUrl: bookingUrl(business, type, calendarId, entry.time),
            driveMinutes,
            provider: "acuity",
          });
        }
      }

      // If tomorrow wasn't covered, fetch tomorrow explicitly.
      if (dateKeys[1]) {
        const params2 = new URLSearchParams({
          owner: config.ownerKey,
          appointmentTypeId: String(type.id),
          calendarId: String(calendarId),
          startDate: dateKeys[1],
          timezone: APP_TIMEZONE,
        });
        const times2 = await fetchJson<TimesResponse>(
          `${ACUITY_BASE}/availability/times?${params2}`,
        );
        for (const [day, daySlots] of Object.entries(times2)) {
          if (!dateKeys.includes(day)) continue;
          for (const entry of daySlots) {
            if (!entry.slotsAvailable) continue;
            const start = parseISO(entry.time);
            if (!isWithinWindow(start, window)) continue;
            const calendar = calendarById.get(calendarId);
            const facility =
              type.category?.trim() ||
              calendar?.name?.trim() ||
              venue.name;
            const dedupeKey = `${venue.id}|${facility}|${entry.time}|${type.duration}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            const end = addMinutes(start, type.duration);
            slots.push({
              id: `acuity-${venue.id}-${type.id}-${calendarId}-${entry.time}`,
              venueId: venue.id,
              venueName: venue.name,
              facility,
              serviceName: type.name,
              start: start.toISOString(),
              end: end.toISOString(),
              durationMinutes: type.duration,
              price: type.price ?? null,
              currency: business.currencyAbbreviation ?? "GBP",
              bookingUrl: bookingUrl(business, type, calendarId, entry.time),
              driveMinutes,
              provider: "acuity",
            });
          }
        }
      }
    }
  }

  return slots;
}
