import type { AvailabilitySlot, Venue } from "../types";
import type { SearchWindow } from "../time-window";
import { fetchAcuitySlots } from "./acuity";
import { fetchAmeliaSlots } from "./amelia";
import { fetchGoDaddyOlaSlots } from "./godaddy-ola";
import { fetchWixSlots } from "./wix";

export async function fetchVenueSlots(
  venue: Venue,
  window: SearchWindow,
  driveMinutes: number,
): Promise<AvailabilitySlot[]> {
  const config = venue.providerConfig;
  switch (config.provider) {
    case "acuity":
      return fetchAcuitySlots(venue, config, window, driveMinutes);
    case "godaddy-ola":
      return fetchGoDaddyOlaSlots(venue, config, window, driveMinutes);
    case "amelia":
      return fetchAmeliaSlots(venue, config, window, driveMinutes);
    case "wix":
      return fetchWixSlots(venue, config, window, driveMinutes);
    default: {
      const _exhaustive: never = config;
      return _exhaustive;
    }
  }
}
