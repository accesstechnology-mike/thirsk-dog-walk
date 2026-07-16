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
  windowStart: string;
  windowEnd: string;
  maxDriveMinutes: number;
  slots: AvailabilitySlot[];
  errors: VenueFetchError[];
  driveTimes: Record<string, number>;
};
