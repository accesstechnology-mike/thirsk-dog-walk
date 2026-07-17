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

function formatSlotOption(iso: string): string {
  const { day, time } = formatWhen(iso);
  return `${day} ${time}`;
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

type AreaRow = {
  key: string;
  slots: AvailabilitySlot[];
  favourite: boolean;
};

function slotTime(slot: AvailabilitySlot): number {
  return new Date(slot.start).getTime();
}

function areaKey(slot: AvailabilitySlot): string {
  return `${slot.venueId}\0${slot.facility}`;
}

/** One row per park area/field — all reachable times for that area. */
function areasFromSlots(slots: AvailabilitySlot[]): AreaRow[] {
  const byArea = new Map<string, AreaRow>();
  for (const slot of slots) {
    const key = areaKey(slot);
    const favourite = isFavouriteFacility(slot.venueId, slot.facility);
    const existing = byArea.get(key);
    if (!existing) {
      byArea.set(key, { key, slots: [slot], favourite });
      continue;
    }
    existing.slots.push(slot);
  }
  return [...byArea.values()]
    .map((row) => ({
      ...row,
      slots: [...row.slots].sort((a, b) => slotTime(a) - slotTime(b)),
    }))
    .sort((a, b) => {
      if (a.favourite !== b.favourite) return a.favourite ? -1 : 1;
      return slotTime(a.slots[0]!) - slotTime(b.slots[0]!);
    });
}

function AreaSlotRow({
  slots,
  favourite,
}: {
  slots: AvailabilitySlot[];
  favourite: boolean;
}) {
  const [selectedId, setSelectedId] = useState(slots[0]!.id);
  const selected =
    slots.find((s) => s.id === selectedId) ?? slots[0]!;
  const when = formatWhen(selected.start);
  const price = formatPrice(selected);
  const multi = slots.length > 1;

  return (
    <li className={favourite ? "slot-row slot-row-favourite" : "slot-row"}>
      <div className="when">
        <span className="day">{when.day}</span>
        {multi ? (
          <label className="time-picker">
            <span className="sr-only">
              Choose time for {selected.venueName} {selected.facility}
            </span>
            <select
              className="time-select"
              value={selected.id}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {slots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {formatSlotOption(slot.start)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="time">{when.time}</span>
        )}
      </div>
      <div className="details">
        <p className="venue">
          {favourite ? (
            <span
              className="favourite-star"
              title="Favourite field"
              aria-label="Favourite"
            >
              ★
            </span>
          ) : null}
          {selected.venueName}
        </p>
        <p className="facility">
          {selected.facility}
          {selected.facility !== selected.serviceName
            ? ` · ${selected.serviceName}`
            : ""}
          {favourite ? " · favourite" : ""}
        </p>
        <p className="sub">
          {selected.driveMinutes} min drive
          {price ? ` · ${price}` : ""}
          {` · ${selected.durationMinutes} min`}
          {multi ? ` · ${slots.length} times` : ""}
          {!selected.timePreselected ? " · confirm time on their site" : ""}
        </p>
      </div>
      <a
        className="book"
        href={selected.bookingUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Book
      </a>
    </li>
  );
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

  const areas = data ? areasFromSlots(data.slots) : [];

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
              {areas.length
                ? `${areas.length} field${areas.length === 1 ? "" : "s"} with a reachable slot`
                : "No reachable 1-hour slots for that leave time"}
            </h2>
            <ul className="slot-list">
              {areas.map((area) => (
                <AreaSlotRow
                  key={`${area.key}-${data.generatedAt}`}
                  slots={area.slots}
                  favourite={area.favourite}
                />
              ))}
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
