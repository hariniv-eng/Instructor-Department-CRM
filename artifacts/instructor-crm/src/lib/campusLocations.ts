// Where each NIAT university sits on the India map (2026-10-09, per request: "an India map with pins at all the
// locations where NIAT universities are"). The university list itself is the City / State / Final University
// Name sheet already encoded in campusRegions.ts -- this file only adds coordinates, so a new campus rule there
// shows up on the map once its city (or the university) is added below.
//
// Pins are per city; universities in the same city share one pin. "NCR - Other" in the sheet is three different
// towns, so those three universities get their own spots (UNIVERSITY_SPOTS) instead of one NCR pin.

import { allRegions, regionForInstitute } from './campusRegions';

// [latitude, longitude] by the sheet's City value.
const CITY_COORDS: Record<string, [number, number]> = {
  'Hyderabad': [17.385, 78.487],
  'Tirupati': [13.628, 79.419],
  'Bangalore': [12.972, 77.594],
  'Mangalore': [12.914, 74.856],
  'Chennai': [13.083, 80.27],
  'Kolhapur': [16.705, 74.243],
  'Nashik': [19.998, 73.789],
  'Pune': [18.52, 73.857],
  'Bhopal': [23.259, 77.413],
  'NCR - Gurugram': [28.459, 77.027],
  'NCR - Noida': [28.535, 77.391],
  'Bhubaneshwar/Cuttack': [20.296, 85.825],
  'Jaipur': [26.912, 75.787],
  'Chengalpattu/Pondicherry': [12.28, 79.65],
  'KanyaKumari': [8.088, 77.541],
  'Coimbatore': [11.017, 76.956],
  'Lucknow/Varanasi': [26.847, 80.947],
  'Agra/ Mathura': [27.492, 77.673],
  'Vizag': [17.687, 83.218],
  'Vijayawada': [16.506, 80.648],
  'Anantapur': [14.681, 77.6],
  'Guntur': [16.307, 80.437],
  'Rajampet/Kadapa': [14.19, 79.16],
};

const UNIVERSITY_SPOTS: Record<string, { name: string; lat: number; lng: number }> = {
  'Subharti University': { name: 'Meerut', lat: 28.98, lng: 77.706 },
  'Geeta University': { name: 'Panipat', lat: 29.391, lng: 76.971 },
  "Lingaya's Vidyapeeth": { name: 'Faridabad', lat: 28.409, lng: 77.313 },
  'Takshashila University': { name: 'Tindivanam', lat: 12.28, lng: 79.65 },
  'T.S Mishra University': { name: 'Lucknow', lat: 26.847, lng: 80.947 },
  'Sanskriti University': { name: 'Mathura', lat: 27.492, lng: 77.673 },
  'Sri Sri University': { name: 'Cuttack', lat: 20.463, lng: 85.883 },
};

// The sheet rows that aren't universities (set to Hyderabad separately) are not pinned.
// St. Mary's Rehabilitation is a rehab centre, not a NIAT university (2026-10-09, per request) -- left off the map.
const NOT_UNIVERSITIES = new Set(['Training Institute', 'Nxtwave Institute of Advanced Technologies', "St. Mary's Rehabilitation University"]);

export type MapPin = {
  id: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
  universities: { name: string; instructors: number; mentors: number }[];
  instructors: number;
  mentors: number;
};

// Pins for every university on the sheet, with how many instructors and how many mentors (each person's TeachOS
// institute names) work at each (2026-10-09, per request: pins show instructors + mentors).
export function niatMapPins(instructorInstitutes: (string[] | null | undefined)[], mentorInstitutes: (string[] | null | undefined)[] = []): MapPin[] {
  const countBy = (lists: (string[] | null | undefined)[]) => {
    const counts = new Map<string, number>();
    for (const institutes of lists) {
      const seen = new Set<string>();
      for (const institute of institutes ?? []) {
        const region = regionForInstitute(institute);
        if (region && !seen.has(region.university)) { seen.add(region.university); counts.set(region.university, (counts.get(region.university) ?? 0) + 1); }
      }
    }
    return counts;
  };
  const counts = countBy(instructorInstitutes);
  const mentorCounts = countBy(mentorInstitutes);
  const pins = new Map<string, MapPin>();
  for (const region of allRegions()) {
    if (NOT_UNIVERSITIES.has(region.university)) continue;
    const spot = UNIVERSITY_SPOTS[region.university];
    const coords = spot ? [spot.lat, spot.lng] : CITY_COORDS[region.city];
    if (!coords) continue;
    const name = spot?.name ?? region.city;
    const id = `${name}|${region.state}`;
    const pin = pins.get(id) ?? { id, name, state: region.state, lat: coords[0], lng: coords[1], universities: [], instructors: 0, mentors: 0 };
    const instructors = counts.get(region.university) ?? 0;
    const mentors = mentorCounts.get(region.university) ?? 0;
    pin.universities.push({ name: region.university, instructors, mentors });
    pin.instructors += instructors;
    pin.mentors += mentors;
    pins.set(id, pin);
  }
  return [...pins.values()].sort((a, b) => b.universities.length - a.universities.length || b.instructors - a.instructors || a.name.localeCompare(b.name));
}
