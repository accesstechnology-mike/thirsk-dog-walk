import type { Venue } from "./types";

/** Origin for drive-time calculations */
export const ORIGIN = {
  postcode: "YO7 4SQ",
  location: { lat: 54.196999, lng: -1.433966 },
} as const;

/**
 * Target is ~30 minutes from YO7 4SQ. OSRM postcode-centroid routes can run a few
 * minutes high vs satnav (e.g. Hopewell ~35), so allow a small buffer.
 */
export const MAX_DRIVE_MINUTES = 35;

/**
 * Preferred private-hire length.
 * Brackenfarg sells 55-minute sessions; South Acres Thirsk is 50 minutes — both count.
 */
export const TARGET_DURATION_MINUTES = 60;
export const MIN_DURATION_MINUTES = 50;
export const MAX_DURATION_MINUTES = 70;

export function isTargetDuration(minutes: number): boolean {
  return minutes >= MIN_DURATION_MINUTES && minutes <= MAX_DURATION_MINUTES;
}

export function isFavouriteFacility(
  venueId: string,
  facility: string,
  venues: Venue[] = VENUES,
): boolean {
  const venue = venues.find((v) => v.id === venueId);
  const needles = venue?.favouriteFacilityIncludes;
  if (!needles?.length) return false;
  const hay = facility.toLowerCase();
  return needles.some((n) => hay.includes(n.toLowerCase()));
}

export const VENUES: Venue[] = [
  {
    id: "hopewell",
    name: "Hopewell Dog Park",
    postcode: "HG5 0SN",
    location: { lat: 54.020488, lng: -1.429159 },
    website: "https://www.hopewelldogpark.com/",
    /** Prefer these Hopewell fields when they have a reachable slot. */
    favouriteFacilityIncludes: ["forest walk", "woodland"],
    providerConfig: {
      provider: "acuity",
      ownerId: "23295738",
      ownerKey: "dc92c66a",
      categoryExcludes: ["DOG WALKERS", "DDA Dogs", "Gift", "Package"],
    },
  },
  {
    id: "yolk-farm",
    name: "Yolk Farm Dog Walking Field",
    postcode: "YO51 9HY",
    location: { lat: 54.084136, lng: -1.404516 },
    website: "https://www.yolkfarm.co.uk/blog/dog-walking-field",
    providerConfig: {
      provider: "acuity",
      ownerId: "28996899",
      ownerKey: "6a8eeab0",
    },
  },
  {
    id: "south-acres",
    name: "South Acres Fields (Thirsk)",
    postcode: "YO7 2LY",
    location: { lat: 54.244733, lng: -1.343896 },
    website: "https://southacresfields.co.uk/",
    providerConfig: {
      provider: "acuity",
      ownerId: "24929766",
      ownerKey: "26b08605",
      calendarNameIncludes: ["Thirsk"],
      calendarNameExcludes: ["Darlington"],
    },
  },
  {
    id: "corners-k9",
    name: "Corners K9 Fields",
    postcode: "YO61 3QE",
    location: { lat: 54.137068, lng: -1.201739 },
    website: "https://www.k9fields.co.uk/",
    providerConfig: {
      provider: "acuity",
      ownerId: "18041000",
      ownerKey: "556fb7ef",
    },
  },
  {
    id: "happy-paws",
    name: "Happy Paws Dog Park",
    postcode: "YO51 9QQ",
    location: { lat: 54.059665, lng: -1.386976 },
    website: "https://www.happypawsdogpark.com/",
    providerConfig: {
      provider: "acuity",
      ownerId: "19289749",
      ownerKey: "9ec1a67a",
      categoryExcludes: ["Dog Walkers", "TRADE"],
    },
  },
  {
    id: "cundall",
    name: "Cundall Dog Park",
    postcode: "YO61 2RL",
    location: { lat: 54.146837, lng: -1.351245 },
    website: "https://cundalldogpark.co.uk/",
    providerConfig: {
      provider: "godaddy-ola",
      bookingBaseUrl: "https://cundalldogpark.co.uk/make-a-booking/ola/services",
      services: [
        {
          // Poorly labelled URL — this is Woodland
          slug: "1-hour-dog-walk-sole-use",
          facility: "Woodland Park",
          label: "Woodland 1 hour private session 1-3 Dogs",
        },
        {
          // Poorly labelled URL — this is Adventure
          slug: "1-hr-private-session-1-3-dogs",
          facility: "Adventure Park",
          label: "Adventure 1 hr private session 1-3 Dogs",
        },
      ],
    },
  },
  {
    id: "dogzone",
    name: "Dogzone Ripon",
    postcode: "HG4 3JQ",
    location: { lat: 54.178588, lng: -1.58804 },
    website: "https://dogzoneripon.co.uk/",
    providerConfig: {
      provider: "amelia",
      bookingUrl: "https://dogzoneripon.co.uk/book-online/",
      siteOrigin: "https://dogzoneripon.co.uk",
    },
  },
  {
    id: "brackenfarg",
    name: "Brackenfarg Dog Park",
    postcode: "HG4 4DP",
    location: { lat: 54.208523, lng: -1.617625 },
    website: "https://www.brackenfargkennels.co.uk/",
    providerConfig: {
      provider: "wix",
      bookingUrl:
        "https://www.brackenfargkennels.co.uk/brackenfarg-dog-park-booking",
      siteOrigin: "https://www.brackenfargkennels.co.uk",
      servicePaths: [
        // Nearest "1hr" private hire products (Wix lists 55-minute sessions)
        "/booking-calendar/55-minute-private-hire-1-3-dogs-1",
        "/booking-calendar/55-minute-private-hire-4-7-dogs-1",
      ],
    },
  },
];
