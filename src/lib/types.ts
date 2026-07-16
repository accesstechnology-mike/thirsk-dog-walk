export type ProviderId = "acuity" | "godaddy-ola" | "amelia" | "wix";

export type LatLng = {
  lat: number;
  lng: number;
};

export type AcuityConfig = {
  provider: "acuity";
  ownerId: string;
  ownerKey: string;
  /** If set, only these calendar IDs (or names matching) are used */
  calendarNameIncludes?: string[];
  calendarNameExcludes?: string[];
  /** Skip appointment type categories matching these (case-insensitive) */
  categoryExcludes?: string[];
};

export type GoDaddyOlaService = {
  slug: string;
  facility: string;
  label: string;
};

export type GoDaddyOlaConfig = {
  provider: "godaddy-ola";
  bookingBaseUrl: string;
  services: GoDaddyOlaService[];
};

export type AmeliaConfig = {
  provider: "amelia";
  bookingUrl: string;
  /** Prefer services whose name/duration match 1hr */
  siteOrigin: string;
};

export type WixConfig = {
  provider: "wix";
  bookingUrl: string;
  siteOrigin: string;
  /** Path slugs for ~1hr private hire services */
  servicePaths: string[];
};

export type VenueProviderConfig =
  | AcuityConfig
  | GoDaddyOlaConfig
  | AmeliaConfig
  | WixConfig;

export type Venue = {
  id: string;
  name: string;
  postcode: string;
  location: LatLng;
  website?: string;
  providerConfig: VenueProviderConfig;
};

export type AvailabilitySlot = {
  id: string;
  venueId: string;
  venueName: string;
  facility: string;
  serviceName: string;
  start: string; // ISO
  end: string; // ISO
  durationMinutes: number;
  price: string | null;
  currency: string | null;
  bookingUrl: string;
  driveMinutes: number;
  /** leaveAt + driveMinutes for this venue */
  earliestArrival: string;
  /**
   * True when the booking URL should open with this slot's time already chosen.
   * False when the park's widget still needs a time confirm (e.g. Acuity add-ons).
   */
  timePreselected: boolean;
  provider: ProviderId;
};

export type VenueFetchError = {
  venueId: string;
  venueName: string;
  message: string;
};

export type AvailabilityResponse = {
  originPostcode: string;
  generatedAt: string;
  leaveAt: string;
  includeTomorrow: boolean;
  /** Same as leaveAt — slots are then filtered per venue by leaveAt + drive. */
  windowStart: string;
  windowEnd: string;
  maxDriveMinutes: number;
  filterSummary: string;
  slots: AvailabilitySlot[];
  errors: VenueFetchError[];
  driveTimes: Record<string, number>;
};
