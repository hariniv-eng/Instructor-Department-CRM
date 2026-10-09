// India map of NIAT university locations for the Overview (2026-10-09, per request). Pure SVG, no map library:
// the state outlines are pre-projected in lib/indiaMapData.ts and pins use the same Mercator formula.
// Sits in the right half of the Overview, as tall as the campus bars + manager list beside it; the map fills the
// card and a clicked pin's universities appear in a small panel over the empty corner.

import { useMemo, useState } from 'react';
import { MapPin as MapPinIcon, X } from 'lucide-react';
import { niatMapPins } from '@/lib/campusLocations';
import { INDIA_STATES, MAP_HEIGHT, MAP_LAT1, MAP_LON0, MAP_WIDTH } from '@/lib/indiaMapData';

const LON_SPAN = 31; // degrees of longitude across MAP_WIDTH (67.5 -> 98.5), as used by the generator
const PX_PER_DEG = MAP_WIDTH / LON_SPAN;
const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const projectX = (lng: number) => (lng - MAP_LON0) * PX_PER_DEG;
const projectY = (lat: number) => (mercator(MAP_LAT1) - mercator(lat)) * PX_PER_DEG * (180 / Math.PI);

export function NiatMapCard({ institutesByPerson }: { institutesByPerson: (string[] | null | undefined)[] }) {
  const pins = useMemo(() => niatMapPins(institutesByPerson), [institutesByPerson]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pins.find((pin) => pin.id === selectedId) ?? null;
  const universityCount = pins.reduce((sum, pin) => sum + pin.universities.length, 0);
  return <div data-testid="card-niat-map" className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
    <div className="mb-2 flex items-center gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-secondary text-muted-foreground"><MapPinIcon size={14} /></span>
      <div>
        <h2 className="text-[12px] font-extrabold tracking-[-0.03em]">NIAT university locations</h2>
        <p className="text-[10px] text-muted-foreground">{universityCount} universities across {pins.length} locations — click a pin</p>
      </div>
    </div>
    <div className="relative flex min-h-0 flex-1 items-center justify-center">
      <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="img" aria-label="Map of India with a pin at each NIAT university location" className="h-full max-h-[560px] w-full">
        <g fill="#dfe8f0" stroke="#ffffff" strokeWidth={0.8} strokeLinejoin="round">
          {INDIA_STATES.map((state) => <path key={state.name} d={state.d} />)}
        </g>
        {pins.map((pin) => {
          const active = pin.id === selectedId;
          const radius = 5 + Math.min(5, pin.universities.length * 0.9);
          return <g key={pin.id} transform={`translate(${projectX(pin.lng).toFixed(1)} ${projectY(pin.lat).toFixed(1)})`} onClick={() => setSelectedId(active ? null : pin.id)} style={{ cursor: 'pointer' }} data-testid={`pin-${pin.name}`}>
            <title>{`${pin.name}, ${pin.state} — ${pin.universities.length} ${pin.universities.length === 1 ? 'university' : 'universities'}`}</title>
            <circle r={radius + 3} fill="#c75b3f" opacity={active ? 0.3 : 0.16} />
            <circle r={radius} fill={active ? '#1f3a5f' : '#c75b3f'} stroke="#ffffff" strokeWidth={1.5} />
            {pin.universities.length > 1 && <text textAnchor="middle" dy="0.35em" fontSize={9} fontWeight={800} fill="#ffffff" style={{ pointerEvents: 'none' }}>{pin.universities.length}</text>}
          </g>;
        })}
      </svg>
      {selected && <div data-testid="map-selected" className="absolute bottom-0 left-0 max-h-[60%] w-[210px] overflow-auto rounded-lg border border-border bg-card/95 p-3 shadow-md backdrop-blur-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[12px] font-extrabold">{selected.name}, {selected.state}</div>
          <button type="button" aria-label="Close" onClick={() => setSelectedId(null)} className="text-muted-foreground hover:text-foreground"><X size={13} /></button>
        </div>
        <ul className="mt-1.5 space-y-1">
          {selected.universities.map((university) => <li key={university.name} className="flex items-center justify-between gap-3 text-[11px]">
            <span className="min-w-0 truncate" title={university.name}>{university.name}</span>
            <span className="shrink-0 font-extrabold tabular-nums">{university.instructors.toLocaleString('en-IN')}</span>
          </li>)}
        </ul>
        <p className="mt-1.5 text-[10px] text-muted-foreground">Numbers are instructors on that campus.</p>
      </div>}
    </div>
    <p className="mt-1 text-center text-[9px] text-muted-foreground">Map data © <a href="https://www.amcharts.com/" target="_blank" rel="noreferrer" className="underline">amCharts</a></p>
  </div>;
}
