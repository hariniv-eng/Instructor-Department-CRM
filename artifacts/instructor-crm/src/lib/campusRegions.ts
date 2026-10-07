// Campus -> Region lookup for the Instructors tab's "Region" column
// (2026-10-06, per request: "depending on which campus they are working we
// need to mark the region they are working in"), built from the City / State /
// Final University Name sheet supplied for that request.
//
// TeachOS spells campuses differently from the sheet's "Final University
// Name" (e.g. "Chaitanya Deemed-to-be University" is "CDU" there), so each
// rule below matches a normalised TeachOS institute name (lower case, every
// non-alphanumeric run turned into one space) and names the sheet row it maps
// to. "Training Institute" and "Nxtwave Institute of Advanced Technologies"
// aren't on the sheet but are set to Hyderabad / TS (2026-10-07, per request).
// Institutes still with no row ("Intensive Offline DC", "Intensive Offline
// Kukatpally", "IIT kharagpur") deliberately map to nothing and show a dash.
//
// Rules marked CONFIRM are best guesses -- check them against the sheet.

type Region = { city: string; state: string; university: string };
type Rule = { test: (name: string) => boolean; region: Region };

const has = (...words: RegExp[]) => (name: string) => words.every((word) => word.test(name));
const R = (city: string, state: string, university: string): Region => ({ city, state, university });

const RULES: Rule[] = [
  { test: has(/training institute/), region: R('Hyderabad', 'TS', 'Training Institute') },
  { test: has(/nxtwave institute of (advanced )?technolog/), region: R('Hyderabad', 'TS', 'Nxtwave Institute of Advanced Technologies') },
  { test: has(/chevella|\bbits\b/), region: R('Hyderabad', 'TS', 'BITS - NIAT Chevella') },
  { test: has(/aurora/), region: R('Hyderabad', 'TS', 'Aurora') },
  { test: has(/chaitanya|\bcdu\b/), region: R('Hyderabad', 'TS', 'CDU') },
  { test: has(/st mary/), region: R('Hyderabad', 'TS', "St. Mary's Rehabilitation University") },
  // TeachOS has "Malla Reddy University", "Malla Reddy Vishwavidyapeeth",
  // "Malla Reddy Tirupati" and "SMR University": Tirupati is MR University -
  // Tirupati (AP), SMR University is Hyderabad (TS), the others MR University
  // (Hyderabad).
  { test: has(/mr university tirupati|mr tirupati|malla reddy tirupati/), region: R('Tirupati', 'AP', 'MR University - Tirupati') },
  // SMR University is Hyderabad / TS (2026-10-07, per request).
  { test: has(/smr university|\bsmru\b/), region: R('Hyderabad', 'TS', 'SMR University') },
  { test: has(/malla reddy|^mr university$|\bmru\b/), region: R('Hyderabad', 'TS', 'MR University') },
  { test: has(/s vyasa|svyasa/), region: R('Bangalore', 'KA', 'S-Vyasa') },
  { test: has(/spiher|st peter/, /bangalore|banglore|bengaluru|bengalore|\bb$/), region: R('Bangalore', 'KA', 'St. Peter’s Institute of Higher Education and Research - B') },
  { test: has(/spiher|st peter/), region: R('Chennai', 'TN', 'St. Peter’s Institute of Higher Education and Research - C') },
  { test: has(/yenapoya|yenepoya/, /bangalore|banglore/), region: R('Bangalore', 'KA', 'Yenepoya University - Bangalore') },
  { test: has(/yenapoya|yenepoya/), region: R('Mangalore', 'KA', 'Yenepoya University - Manglore') },
  { test: has(/sanjay ghodawat|\bsgu\b/), region: R('Kolhapur', 'MH', 'SGU') },
  { test: has(/sandip/), region: R('Nashik', 'MH', 'Sandip University') },
  { test: has(/dy patil|adypu/), region: R('Pune', 'MH', 'ADYPU University') },
  { test: has(/alard/), region: R('Pune', 'MH', 'Alard University') },
  { test: has(/scope global/), region: R('Bhopal', 'MP', 'Scope Global Skills Univeristy') },
  { test: has(/sushant/), region: R('NCR - Gurugram', 'NCR', 'Sushanth University') },
  { test: has(/noida international/), region: R('NCR - Noida', 'NCR', 'Noida International') },
  { test: has(/subharti/), region: R('NCR - Other', 'NCR', 'Subharti University') },
  { test: has(/geeta/), region: R('NCR - Other', 'NCR', 'Geeta University') },
  { test: has(/lingaya/), region: R('NCR - Other', 'NCR', "Lingaya's Vidyapeeth") },
  { test: has(/sri sri/), region: R('Bhubaneshwar/Cuttack', 'OD', 'Sri Sri University') },
  { test: has(/vivekananda/), region: R('Jaipur', 'RJ', 'Vivekananda Global University') },
  { test: has(/takshasila|takshashila/), region: R('Chengalpattu/Pondicherry', 'TN', 'Takshashila University') },
  { test: has(/\bamet\b/), region: R('Chennai', 'TN', 'AMET') },
  { test: has(/crescent/), region: R('Chennai', 'TN', 'Crescent University') },
  { test: has(/bharath/), region: R('Chennai', 'TN', 'Bharath University - Chennai') },
  { test: has(/joy university/), region: R('KanyaKumari', 'TN', 'JOY University') },
  { test: has(/\bsns\b/), region: R('Coimbatore', 'TN', 'SNS College of Technology') },
  { test: has(/pk das|p k das/), region: R('Coimbatore', 'TN', 'PK Das Deemed to be univeristy') },
  { test: has(/mishra/), region: R('Lucknow/Varanasi', 'UP', 'T.S Mishra University') },
  { test: has(/sanskriti/), region: R('Agra/ Mathura', 'UP', 'Sanskriti University') },
  { test: has(/gmrit|gmr/), region: R('Vizag', 'AP', 'GMRIT UNIVERSITY') },
  { test: has(/nsrit/), region: R('Vizag', 'AP', 'NSRIT') },
  { test: has(/visakha|\bviet\b/), region: R('Vizag', 'AP', 'VISAKHA INSTITUTE OF ENGINEERING & TECHNOLOGY') },
  { test: has(/limat/), region: R('Vijayawada', 'AP', 'LIMAT -Vijayawada') },
  { test: has(/\bnri\b/), region: R('Vijayawada', 'AP', 'NRI Institute of Technology') },
  { test: has(/\bmvr\b|m v r/), region: R('Vijayawada', 'AP', 'M.V.R College Of Engineering And Technology') },
  { test: has(/\bbest\b|bharatiya engineering/), region: R('Anantapur', 'AP', 'Bharatiya Engineering Science and Technology Innovation') },
  { test: has(/chalapathy/), region: R('Guntur', 'AP', 'Chalapathy') },
  { test: has(/annamacharya/), region: R('Rajampet/Kadapa', 'AP', 'Annamacharya University') },
];

function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function regionForInstitute(institute: string): Region | null {
  const name = normalise(institute);
  if (!name) return null;
  return RULES.find((rule) => rule.test(name))?.region ?? null;
}

// One label per distinct region a person's campuses fall in, e.g.
// "Vizag - AP" -- or "Vizag - AP; Hyderabad - TS" for someone on two campuses.
// Empty string when none of their campuses is on the sheet.
export function regionLabelForInstitutes(institutes: string[] | null | undefined): string {
  const labels: string[] = [];
  for (const institute of institutes ?? []) {
    const region = regionForInstitute(institute);
    if (!region) continue;
    const label = `${region.city} - ${region.state}`;
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.join('; ');
}

// Same lookup, split into the two values the Instructors tab shows as separate
// columns (campus_city / campus_state, 2026-10-06, per request). Each is the
// distinct list across the person's campuses, joined with "; ", so a
// two-campus person reads e.g. "Vizag; Hyderabad" / "AP; TS". Empty strings
// when none of their campuses is on the sheet.
export function campusCityAndState(institutes: string[] | null | undefined): { city: string; state: string } {
  const cities: string[] = [];
  const states: string[] = [];
  for (const institute of institutes ?? []) {
    const region = regionForInstitute(institute);
    if (!region) continue;
    if (!cities.includes(region.city)) cities.push(region.city);
    if (!states.includes(region.state)) states.push(region.state);
  }
  return { city: cities.join('; '), state: states.join('; ') };
}
