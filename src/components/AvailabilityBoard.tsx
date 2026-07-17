"use client";

import { useEffect, useState, useTransition } from "react";
import type { AvailabilityResponse, AvailabilitySlot } from "@/lib/types";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/time-window";
import { isFavouriteFacility } from "@/lib/venues";

function formatWhen(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return { day, time };
}

function formatPrice(slot: AvailabilitySlot): string | null {
  if (!slot.price) return null;
  const n = Number(slot.price);
  if (Number.isNaN(n)) return `£${slot.price}`;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: slot.currency || "GBP",
  }).format(n);
}

function roundToMinute(date: Date): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  return d;
}

type ParkRow = {
  next: AvailabilitySlot;
  totalSlots: number;
  favouriteAvailable: boolean;
};

function slotTime(slot: AvailabilitySlot): number {
  return new Date(slot.start).getTime();
}

function preferSlot(current: AvailabilitySlot, candidate: AvailabilitySlot): AvailabilitySlot {
  const currentFav = isFavouriteFacility(current.venueId, current.facility);
  const candidateFav = isFavouriteFacility(candidate.venueId, candidate.facility);
  if (candidateFav && !currentFav) return candidate;
  if (currentFav && !candidateFav) return current;
  return slotTime(candidate) < slotTime(current) ? candidate : current;
}

/** One row per park: prefer soonest favourite field when one is open. */
function parksFromSlots(slots: AvailabilitySlot[]): ParkRow[] {
  const byVenue = new Map<string, ParkRow>();
  for (const slot of slots) {
    const favourite = isFavouriteFacility(slot.venueId, slot.facility);
    const existing = byVenue.get(slot.venueId);
    if (!existing) {
      byVenue.set(slot.venueId, {
        next: slot,
        totalSlots: 1,
        favouriteAvailable: favourite,
      });
      continue;
    }
    existing.totalSlots += 1;
    existing.favouriteAvailable = existing.favouriteAvailable || favourite;
    existing.next = preferSlot(existing.next, slot);
  }
  return [...byVenue.values()].sort((a, b) => {
    if (a.favouriteAvailable !== b.favouriteAvailable) {
      return a.favouriteAvailable ? -1 : 1;
    }
    return slotTime(a.next) - slotTime(b.next);
  });
}

export function AvailabilityBoard() {
  const [leaveLocal, setLeaveLocal] = useState(() =>
    toDatetimeLocalValue(roundToMinute(new Date())),
  );
  const [includeTomorrow, setIncludeTomorrow] = useState(false);
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load(nextLeave = leaveLocal, nextTomorrow = includeTomorrow) {
    startTransition(async () => {
      setError(null);
      try {
        const leaveAt = fromDatetimeLocalValue(nextLeave);
        const params = new URLSearchParams({
          leaveAt: leaveAt.toISOString(),
          includeTomorrow: nextTomorrow ? "1" : "0",
        });
        const res = await fetch(`/api/availability?${params}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        const json = (await res.json()) as AvailabilityResponse;
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  const parks = data ? parksFromSlots(data.slots) : [];

  return (
    <div className="board">
      <header className="hero">
        <p className="brand">Thirsk Dog Walk</p>
        <h1>Open 1-hour fields near YO7 4SQ</h1>
        <p className="lede">
          Set when you&apos;re leaving the house. We only show slots that start
          after you can arrive (leave time + drive).
        </p>

        <form
          className="leave-form"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <label className="leave-field">
            <span>Leaving home</span>
            <input
              type="datetime-local"
              value={leaveLocal}
              onChange={(e) => setLeaveLocal(e.target.value)}
            />
          </label>
          <label className="tomorrow-field">
            <input
              type="checkbox"
              checked={includeTomorrow}
              onChange={(e) => setIncludeTomorrow(e.target.checked)}
            />
            <span>Include tomorrow</span>
          </label>
          <button type="submit" className="refresh" disabled={isPending}>
            {isPending ? "Checking parks…" : "Show slots"}
          </button>
        </form>

        {data ? <p className="meta">{data.filterSummary}</p> : null}
      </header>

      {error ? <p className="banner error">{error}</p> : null}

      {!data && !error ? (
        <p className="banner">Fetching live slots from local parks…</p>
      ) : null}

      {data ? (
        <>
          <section className="slot-section" aria-live="polite">
            <h2>
              {parks.length
                ? `${parks.length} park${parks.length === 1 ? "" : "s"} with a reachable slot`
                : "No reachable 1-hour slots for that leave time"}
            </h2>
            <ul className="slot-list">
              {parks.map(({ next: slot, totalSlots, favouriteAvailable }) => {
                const when = formatWhen(slot.start);
                const price = formatPrice(slot);
                const more =
                  totalSlots > 1
                    ? ` · ${totalSlots - 1} more time${totalSlots - 1 === 1 ? "" : "s"}`
                    : "";
                const nextIsFavourite = isFavouriteFacility(
                  slot.venueId,
                  slot.facility,
                );
                return (
                  <li
                    key={slot.venueId}
                    className={
                      favouriteAvailable ? "slot-row slot-row-favourite" : "slot-row"
                    }
                  >
                    <div className="when">
                      <span className="day">{when.day}</span>
                      <span className="time">{when.time}</span>
                    </div>
                    <div className="details">
                      <p className="venue">
                        {favouriteAvailable ? (
                          <span
                            className="favourite-star"
                            title="Favourite field available"
                            aria-label="Favourite"
                          >
                            ★
                          </span>
                        ) : null}
                        {slot.venueName}
                      </p>
                      <p className="facility">
                        Next: {slot.facility}
                        {slot.facility !== slot.serviceName
                          ? ` · ${slot.serviceName}`
                          : ""}
                        {favouriteAvailable && !nextIsFavourite
                          ? " · favourite field also open"
                          : nextIsFavourite
                            ? " · favourite"
                            : ""}
                      </p>
                      <p className="sub">
                        {slot.driveMinutes} min drive
                        {price ? ` · ${price}` : ""}
                        {` · ${slot.durationMinutes} min`}
                        {more}
                        {!slot.timePreselected
                          ? " · confirm time on their site"
                          : ""}
                      </p>
                    </div>
                    <a
                      className="book"
                      href={slot.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Book
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>

          {data.errors.length ? (
            <section className="errors">
              <h2>Park notes</h2>
              <ul>
                {data.errors.map((err) => (
                  <li key={`${err.venueId}-${err.message}`}>
                    <strong>{err.venueName}</strong> — {err.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
