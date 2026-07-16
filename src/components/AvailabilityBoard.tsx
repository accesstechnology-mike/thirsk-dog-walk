"use client";

import { useEffect, useState, useTransition } from "react";
import type { AvailabilityResponse, AvailabilitySlot } from "@/lib/types";

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

function formatWindow(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function AvailabilityBoard() {
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/availability", { cache: "no-store" });
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
  }, []);

  return (
    <div className="board">
      <header className="hero">
        <p className="brand">Thirsk Dog Walk</p>
        <h1>Open 1-hour fields near YO7 4SQ</h1>
        <p className="lede">
          Live slots from now + 30 minutes through end of tomorrow, within about
          30 minutes&apos; drive. Book on the venue&apos;s own site.
        </p>
        <div className="cta-row">
          <button type="button" className="refresh" onClick={load} disabled={isPending}>
            {isPending ? "Checking parks…" : "Refresh availability"}
          </button>
          {data ? (
            <p className="meta">
              Window {formatWindow(data.windowStart)} →{" "}
              {formatWindow(data.windowEnd)}
            </p>
          ) : null}
        </div>
      </header>

      {error ? <p className="banner error">{error}</p> : null}

      {!data && !error ? (
        <p className="banner">Fetching live slots from local parks…</p>
      ) : null}

      {data ? (
        <>
          <section className="slot-section" aria-live="polite">
            <h2>
              {data.slots.length
                ? `${data.slots.length} open slot${data.slots.length === 1 ? "" : "s"}`
                : "No open 1-hour slots in range"}
            </h2>
            <ul className="slot-list">
              {data.slots.map((slot) => {
                const when = formatWhen(slot.start);
                const price = formatPrice(slot);
                return (
                  <li key={slot.id} className="slot-row">
                    <div className="when">
                      <span className="day">{when.day}</span>
                      <span className="time">{when.time}</span>
                    </div>
                    <div className="details">
                      <p className="venue">{slot.venueName}</p>
                      <p className="facility">
                        {slot.facility}
                        {slot.facility !== slot.serviceName
                          ? ` · ${slot.serviceName}`
                          : ""}
                      </p>
                      <p className="sub">
                        {slot.driveMinutes} min drive
                        {price ? ` · ${price}` : ""}
                        {` · ${slot.durationMinutes} min`}
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
