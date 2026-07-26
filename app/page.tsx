"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";

type Chamber = "sen" | "rep";
type Member = { id: string; n: string; t: Chamber; s: string; d: number | null; p: string; a: string; z: string };
type Official = { id: string; n: string; t: string; g: string; o: number; a: string; z: string | null };
type MapProperties = {
  name?: string;
  statename?: string;
  district?: number;
  NAME?: string;
  START_N?: number;
  END_N?: number;
  TERR_TYPE?: "State" | "Territory" | "Unorganized Territory" | "District of Columbia" | "Other";
};
type MapFeature = Feature<Geometry, MapProperties>;
type ZoomState = { x: number; y: number; k: number };

const MIN_DATE = "1789-03-04";
const MAX_DATE = "2026-07-26";
const INITIAL_DATE = "2004-08-23";
const DAY = 86_400_000;

const STATE_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO",
  Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA",
  Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH",
  Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA",
  Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};

const PARTY_COLORS: Record<string, string> = {
  Republican: "#b64c44", Democrat: "#416f91", Independent: "#887c70", Federalist: "#b28a43",
  "Democratic-Republican": "#5e806f", Whig: "#b58a64", "Anti-Administration": "#80678c",
  "Pro-Administration": "#b17449", Jackson: "#53778a", "Adams-Clay Federalist": "#a47d47",
  Unionist: "#7d6d59", "Conservative Republican": "#9b574c", Populist: "#807548",
  Progressive: "#59847a", "Free Soil": "#6c8454", "American Labor": "#7b5e72", Unknown: "#aaa398",
};

function colorFor(party?: string) {
  if (!party) return "#d6d0c5";
  return PARTY_COLORS[party] ?? "#766d66";
}

function toDay(date: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${MIN_DATE}T00:00:00Z`)) / DAY);
}

function fromDay(day: number) {
  return new Date(Date.parse(`${MIN_DATE}T00:00:00Z`) + day * DAY).toISOString().slice(0, 10);
}

function congressFor(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (date >= "1935-01-03") {
    let start = year % 2 === 1 && (month > 1 || (month === 1 && day >= 3)) ? year : year - (year % 2 === 0 ? 1 : 2);
    return Math.max(1, Math.min(119, (start - 1787) / 2));
  }
  let start = year % 2 === 1 && (month > 3 || (month === 3 && day >= 4)) ? year : year - (year % 2 === 0 ? 1 : 2);
  return Math.max(1, Math.min(73, (start - 1787) / 2));
}

function longDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}

function termLabel(congress: number) {
  const suffix = congress % 100 >= 11 && congress % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[congress % 10] ?? "th";
  return `${congress}${suffix} Congress`;
}

function groupCounts(items: Member[]) {
  const counts = new Map<string, number>();
  items.forEach((item) => counts.set(item.p, (counts.get(item.p) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function initials(name: string) {
  const parts = name.replace(/“[^”]+”/g, "").split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`;
}

export default function Home() {
  const [date, setDate] = useState(INITIAL_DATE);
  const [chamber, setChamber] = useState<Chamber>("rep");
  const [members, setMembers] = useState<Member[]>([]);
  const [officials, setOfficials] = useState<Official[]>([]);
  const [historicalPolities, setHistoricalPolities] = useState<MapFeature[]>([]);
  const [districts, setDistricts] = useState<MapFeature[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; feature: MapFeature } | null>(null);
  const [zoom, setZoom] = useState<ZoomState>({ x: 0, y: 0, k: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(null);
  const congress = congressFor(date);

  useEffect(() => {
    Promise.all([
      fetch("/data/members.json").then((response) => response.json()),
      fetch("/data/officials.json").then((response) => response.json()),
      fetch("/data/historical-polities.json").then((response) => response.json()),
    ]).then(([memberData, officialData, topology]: [Member[], Official[], Topology]) => {
      setMembers(memberData);
      setOfficials(officialData);
      const object = Object.values(topology.objects)[0] as GeometryCollection<MapProperties>;
      const collection = feature(topology, object) as FeatureCollection<Geometry, MapProperties>;
      setHistoricalPolities(collection.features);
    });
  }, []);

  useEffect(() => {
    if (chamber !== "rep") return;
    let cancelled = false;
    setMapLoading(true);
    fetch(`/data/districts/${String(congress).padStart(3, "0")}.json`)
      .then((response) => response.json())
      .then((topology: Topology) => {
        if (cancelled) return;
        const features = Object.values(topology.objects).flatMap((object) => {
          const converted = feature(topology, object as GeometryCollection<MapProperties>);
          return converted.type === "FeatureCollection" ? converted.features : [converted];
        }) as MapFeature[];
        const latestPlanByDistrict = new Map<string, MapFeature>();
        features.forEach((mapFeature) => {
          const key = `${mapFeature.properties.statename}:${mapFeature.properties.district ?? 0}`;
          latestPlanByDistrict.set(key, mapFeature);
        });
        setDistricts([...latestPlanByDistrict.values()]);
        setMapLoading(false);
      });
    return () => { cancelled = true; };
  }, [chamber, congress]);

  useEffect(() => {
    setZoom({ x: 0, y: 0, k: 1 });
    setTooltip(null);
  }, [chamber, congress]);

  const activeMembers = useMemo(
    () => members.filter((member) => member.t === chamber && member.a <= date && member.z > date),
    [members, chamber, date],
  );
  const activeOfficials = useMemo(
    () => officials.filter((official) => official.a <= date && (!official.z || official.z > date)),
    [officials, date],
  );
  const numericDate = Number(date.replaceAll("-", ""));
  const activePolities = useMemo(
    () => historicalPolities.filter((polity) => {
      const start = polity.properties.START_N ?? 0;
      const end = polity.properties.END_N ?? 20001231;
      return start <= numericDate && (end >= numericDate || (end === 20001231 && numericDate > end));
    }),
    [historicalPolities, numericDate],
  );
  const activeStates = useMemo(
    () => activePolities.filter((polity) => polity.properties.TERR_TYPE === "State"),
    [activePolities],
  );
  const visibleFeatures = chamber === "sen" ? activeStates : districts;
  const projection = useMemo(() => {
    const geographicFrame = activePolities.length ? activePolities : visibleFeatures;
    if (!geographicFrame.length) return null;
    const collection: FeatureCollection<Geometry, GeoJsonProperties> = { type: "FeatureCollection", features: geographicFrame };
    return geoAlbersUsa().fitExtent([[22, 18], [978, 602]], collection);
  }, [activePolities, visibleFeatures]);
  const path = projection ? geoPath(projection) : null;

  const memberForDistrict = (mapFeature: MapFeature) => {
    const state = STATE_ABBR[mapFeature.properties.statename ?? ""];
    const district = mapFeature.properties.district ?? 0;
    const exact = activeMembers.filter((member) => member.s === state && member.d === district);
    if (exact.length) return exact;
    if (district < 0) return activeMembers.filter((member) => member.s === state);
    return [];
  };

  const senatorsForState = (mapFeature: MapFeature) => {
    const state = STATE_ABBR[mapFeature.properties.NAME ?? mapFeature.properties.name ?? ""];
    return activeMembers.filter((member) => member.s === state);
  };

  const fillFor = (mapFeature: MapFeature) => {
    if (chamber === "rep") return colorFor(memberForDistrict(mapFeature)[0]?.p);
    const senators = senatorsForState(mapFeature);
    if (!senators.length) return "#d6d0c5";
    return senators.length > 1 && senators[0].p !== senators[1].p
      ? `url(#split-${STATE_ABBR[mapFeature.properties.NAME ?? mapFeature.properties.name ?? ""]})`
      : colorFor(senators[0].p);
  };

  const zoomBy = (factor: number, point = { x: 500, y: 310 }) => {
    setZoom((current) => {
      const nextK = Math.max(1, Math.min(16, current.k * factor));
      const ratio = nextK / current.k;
      return { k: nextK, x: point.x - (point.x - current.x) * ratio, y: point.y - (point.y - current.y) * ratio };
    });
  };

  const counts = groupCounts(activeMembers);
  const maxDay = toDay(MAX_DATE);
  const groups = ["Executive", "Cabinet", "Supreme Court", "Congressional leadership"];

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="American State home">
          <span className="brand-mark">AS</span>
          <span><strong>American State</strong><small>A day-by-day atlas of U.S. government</small></span>
        </a>
        <nav aria-label="Site links">
          <a href="#atlas">Atlas</a><a href="#method">Method</a><a href="#sources">Sources</a>
        </nav>
        <div className="coverage"><span /> Data through {longDate(MAX_DATE)}</div>
      </header>

      <section className="intro" id="top">
        <p className="eyebrow">THE REPUBLIC, RECONSTRUCTED</p>
        <h1>Who governed America<br />on <em>this day?</em></h1>
        <p className="dek">Travel through every Congress. See the districts, members, presidents, cabinets, courts, and leadership in office on a single date.</p>
      </section>

      <section className="atlas-shell" id="atlas">
        <div className="atlas-main">
          <div className="date-deck">
            <button className="step-button" onClick={() => setDate(fromDay(Math.max(0, toDay(date) - 1)))} aria-label="Previous day">←</button>
            <label className="date-readout">
              <span>DATE IN VIEW</span>
              <input type="date" min={MIN_DATE} max={MAX_DATE} value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <button className="step-button" onClick={() => setDate(fromDay(Math.min(maxDay, toDay(date) + 1)))} aria-label="Next day">→</button>
            <div className="term-card"><span>{termLabel(congress)}</span><strong>{activeMembers.length || "—"}</strong><small>{chamber === "rep" ? "House seats filled" : "Senate seats filled"}</small></div>
          </div>

          <div className="slider-wrap">
            <input aria-label="Historical date" type="range" min={0} max={maxDay} value={toDay(date)} onChange={(event) => setDate(fromDay(Number(event.target.value)))} />
            <div className="era-labels"><span>1789</span><span>1861</span><span>1933</span><span>1965</span><span>2001</span><span>Today</span></div>
          </div>

          <div className="map-toolbar">
            <div className="chamber-tabs" role="tablist" aria-label="Chamber">
              <button className={chamber === "rep" ? "active" : ""} onClick={() => setChamber("rep")} role="tab">House districts</button>
              <button className={chamber === "sen" ? "active" : ""} onClick={() => setChamber("sen")} role="tab">Senate</button>
            </div>
            <p>{chamber === "rep" ? "Hover for members · scroll to zoom · drag to pan" : "Hover for senators · scroll to zoom · drag to pan"}</p>
          </div>

          <div
            className={`map-frame ${isPanning ? "is-panning" : ""}`}
            ref={mapRef}
            onMouseLeave={() => setTooltip(null)}
            onWheel={(event) => {
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              zoomBy(event.deltaY < 0 ? 1.35 : 1 / 1.35, {
                x: ((event.clientX - rect.left) / rect.width) * 1000,
                y: ((event.clientY - rect.top) / rect.height) * 620,
              });
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = { clientX: event.clientX, clientY: event.clientY, x: zoom.x, y: zoom.y };
              setIsPanning(true);
              setTooltip(null);
            }}
            onPointerMove={(event) => {
              if (!dragRef.current) return;
              const rect = event.currentTarget.getBoundingClientRect();
              setZoom((current) => ({
                ...current,
                x: dragRef.current!.x + (event.clientX - dragRef.current!.clientX) * (1000 / rect.width),
                y: dragRef.current!.y + (event.clientY - dragRef.current!.clientY) * (620 / rect.height),
              }));
            }}
            onPointerUp={() => { dragRef.current = null; setIsPanning(false); }}
            onPointerCancel={() => { dragRef.current = null; setIsPanning(false); }}
          >
            {mapLoading && chamber === "rep" && <div className="map-loading"><span /> Loading {termLabel(congress)} boundaries</div>}
            <div className="zoom-controls" aria-label="Map zoom controls" onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
              <button onClick={() => zoomBy(1.5)} aria-label="Zoom in">+</button>
              <button onClick={() => zoomBy(1 / 1.5)} aria-label="Zoom out">−</button>
              <button onClick={() => setZoom({ x: 0, y: 0, k: 1 })} aria-label="Reset map view">Reset</button>
            </div>
            <svg viewBox="0 0 1000 620" role="img" aria-label={`${chamber === "rep" ? "House district" : "Senate"} map on ${longDate(date)}`}>
              <defs>
                {chamber === "sen" && activeStates.map((state) => {
                  const stateMembers = senatorsForState(state);
                  const code = STATE_ABBR[state.properties.NAME ?? state.properties.name ?? ""];
                  if (stateMembers.length < 2 || stateMembers[0].p === stateMembers[1].p) return null;
                  return <linearGradient id={`split-${code}`} key={code} x1="0" x2="1"><stop offset="50%" stopColor={colorFor(stateMembers[0].p)} /><stop offset="50%" stopColor={colorFor(stateMembers[1].p)} /></linearGradient>;
                })}
              </defs>
              <g transform={`translate(${zoom.x} ${zoom.y}) scale(${zoom.k})`}>
                <g className="polity-background">
                  {path && activePolities.map((polity, index) => (
                    <path
                      key={`${polity.properties.NAME}-${polity.properties.START_N}-${index}`}
                      d={path(polity) ?? undefined}
                      className={polity.properties.TERR_TYPE === "State" ? "historical-state" : "historical-territory"}
                    />
                  ))}
                </g>
                <g className="map-paths">
                  {path && visibleFeatures.map((mapFeature, index) => (
                    <path
                      key={`${mapFeature.properties.NAME ?? mapFeature.properties.name ?? mapFeature.properties.statename}-${mapFeature.properties.district ?? index}`}
                      d={path(mapFeature) ?? undefined}
                      fill={fillFor(mapFeature)}
                      onMouseMove={(event) => {
                        if (isPanning) return;
                        const rect = mapRef.current?.getBoundingClientRect();
                        if (rect) setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, feature: mapFeature });
                      }}
                    />
                  ))}
                </g>
              </g>
            </svg>
            {tooltip && (
              <div className="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
                {chamber === "sen" ? (
                  <>
                    <strong>{tooltip.feature.properties.NAME ?? tooltip.feature.properties.name}</strong><span>U.S. Senate</span>
                    <ul>{senatorsForState(tooltip.feature).map((member) => <li key={member.id}><i style={{ background: colorFor(member.p) }} />{member.n}<small>{member.p}</small></li>)}</ul>
                    {!senatorsForState(tooltip.feature).length && <p>No senators seated on this date.</p>}
                  </>
                ) : (
                  <>
                    <strong>{tooltip.feature.properties.statename}{(tooltip.feature.properties.district ?? 0) > 0 ? ` · District ${tooltip.feature.properties.district}` : " · At large"}</strong>
                    <span>U.S. House</span>
                    {memberForDistrict(tooltip.feature).map((member) => <div className="house-member" key={member.id}><i style={{ background: colorFor(member.p) }} /><b>{member.n}</b><small>{member.p}</small></div>)}
                    {!memberForDistrict(tooltip.feature).length && <p>Seat vacant or no member record on this date.</p>}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="legend">
            <span className="legend-title">SEATS FILLED</span>
            {counts.slice(0, 6).map(([party, count]) => <span key={party}><i style={{ background: colorFor(party) }} />{party}<b>{count}</b></span>)}
            <span><i className="territory-swatch" />Territory / other U.S. area</span>
          </div>
        </div>

        <aside className="officials-rail">
          <div className="rail-heading"><p>GOVERNMENT ON</p><h2>{longDate(date)}</h2><span>{termLabel(congress)}</span></div>
          {groups.map((group) => {
            const rows = activeOfficials.filter((official) => official.g === group).sort((a, b) => a.o - b.o || a.a.localeCompare(b.a));
            return (
              <details key={group} open={group !== "Cabinet" || rows.length < 10}>
                <summary><span>{group}</span><b>{rows.length}</b></summary>
                <div className="official-list">
                  {rows.map((official) => <div className="official" key={`${official.id}-${official.t}`}><span className="portrait">{initials(official.n)}</span><p><strong>{official.n}</strong><small>{official.t}</small></p></div>)}
                  {!rows.length && <p className="empty">No dated officeholder in the source record.</p>}
                </div>
              </details>
            );
          })}
          <p className="rail-note">Offices appear only after their creation. Vacancies and acting tenures are shown when they are present in the source record.</p>
        </aside>
      </section>

      <section className="method" id="method">
        <div><p className="eyebrow">HOW TO READ THE ATLAS</p><h2>One date.<br />Four branches of context.</h2></div>
        <div className="method-grid">
          <article><span>01</span><h3>Daily membership</h3><p>Member service dates drive the color and hover state, so resignations, deaths, appointments, and special elections can change the map between Congresses.</p></article>
          <article><span>02</span><h3>Period boundaries</h3><p>House geography follows the district plan in force for the selected Congress, including at-large and multi-member arrangements in the early republic.</p></article>
          <article><span>03</span><h3>Created offices</h3><p>The government rail grows over time. A Cabinet department or leadership post does not appear before the office exists.</p></article>
          <article><span>04</span><h3>Honest gaps</h3><p>Historical records are uneven. The interface labels vacancies and missing dated tenures instead of inventing continuity.</p></article>
        </div>
      </section>

      <footer id="sources">
        <div className="brand footer-brand"><span className="brand-mark">AS</span><span><strong>American State</strong><small>Built for historical inquiry</small></span></div>
        <p>District boundaries: UCLA Congressional District Boundaries project. Historical states and territories: Newberry Library Atlas of Historical County Boundaries. Congressional service: unitedstates/congress-legislators, with documented corrections from the U.S. House Historian. Office tenures: Wikidata.</p>
        <p className="fineprint">A research interface, not an official government record. Source corrections and leadership datasets can be layered into the same date model.</p>
      </footer>
    </main>
  );
}
