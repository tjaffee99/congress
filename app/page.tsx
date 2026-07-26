"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import { houseBoundaryBelongsToPlan, houseMembersForDistrict } from "./house-members.mjs";

type Chamber = "sen" | "rep";
type Member = { id: string; n: string; t: Chamber; s: string; d: number | null; p: string; c: string | null; w: string | null; a: string; z: string };
type Official = { id: string; n: string; t: string; g: string; o: number; h: Chamber | null; p: string | null; x?: boolean; w?: string | null; a: string; z: string | null };
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
type TooltipState = { x: number; y: number; maxHeight: number; feature: MapFeature };

const MIN_DATE = "1789-03-04";
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
const STATE_CODES = new Set(Object.values(STATE_ABBR));
const TIMELINE_MARKS = [
  [MIN_DATE, "1789"],
  ["1840-01-01", "1840"],
  ["1865-04-09", "1865"],
  ["1913-03-04", "1913"],
  ["1977-01-20", "1977"],
  ["2001-01-20", "2001"],
] as const;

const PARTY_COLORS: Record<string, string> = {
  Republican: "#b64c44", Democrat: "#416f91", Independent: "#887c70", Federalist: "#b28a43",
  "Democratic-Republican": "#5e806f", Whig: "#b58a64", "Anti-Administration": "#80678c",
  "Pro-Administration": "#b17449", Jackson: "#53778a", "Adams-Clay Federalist": "#a47d47",
  Unionist: "#7d6d59", "Conservative Republican": "#9b574c", Populist: "#807548",
  Progressive: "#59847a", "Free Soil": "#6c8454", "American Labor": "#7b5e72", Unknown: "#aaa398",
};
const CAUCUS_COLORS: Record<string, string> = { Democrat: "#91aec2", Republican: "#d99a95" };
const VACANT_COLOR = "#c8c2b8";

function colorFor(party?: string) {
  if (!party) return "#d6d0c5";
  return PARTY_COLORS[party] ?? "#766d66";
}

function colorForMember(member?: Member) {
  if (!member) return VACANT_COLOR;
  if (member.p === "Independent" && member.c && CAUCUS_COLORS[member.c]) return CAUCUS_COLORS[member.c];
  return colorFor(member.p);
}

function partyLabel(member: Member) {
  const caucus = member.c === "Democrat" ? "Democratic" : member.c;
  return member.p === "Independent" && member.c
    ? `Independent · ${caucus} caucus`
    : member.p;
}

function wikipediaHref(person: { n: string; w?: string | null }) {
  return person.w ?? `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(person.n.replaceAll("“", "").replaceAll("”", ""))}`;
}

function currentUsDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isValidDateInRange(value: string, maximum: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < MIN_DATE || value > maximum) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function toDay(date: string) {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed - Date.parse(`${MIN_DATE}T00:00:00Z`)) / DAY);
}

function fromDay(day: number) {
  const safeDay = Number.isFinite(day) ? day : 0;
  return new Date(Date.parse(`${MIN_DATE}T00:00:00Z`) + safeDay * DAY).toISOString().slice(0, 10);
}

function congressFor(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 1;
  const [year, month, day] = date.split("-").map(Number);
  if (date >= "1935-01-03") {
    const start = year % 2 === 1 && (month > 1 || (month === 1 && day >= 3)) ? year : year - (year % 2 === 0 ? 1 : 2);
    return Math.max(1, Math.min(119, (start - 1787) / 2));
  }
  const start = year % 2 === 1 && (month > 3 || (month === 3 && day >= 4)) ? year : year - (year % 2 === 0 ? 1 : 2);
  return Math.max(1, Math.min(73, (start - 1787) / 2));
}

function congressDates(congress: number) {
  const startYear = congress <= 73 ? 1787 + congress * 2 : 1935 + (congress - 74) * 2;
  const monthDay = congress <= 73 ? "03-04" : "01-03";
  return [`${startYear}-${monthDay}`, `${startYear + 2}-${monthDay}`] as const;
}

function longDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}

function termLabel(congress: number) {
  const suffix = congress % 100 >= 11 && congress % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[congress % 10] ?? "th";
  return `${congress}${suffix} Congress`;
}

export default function Home() {
  const [today, setToday] = useState(currentUsDate);
  const [date, setDate] = useState(currentUsDate);
  const [dateDraft, setDateDraft] = useState(currentUsDate);
  const [chamber, setChamber] = useState<Chamber>("rep");
  const [members, setMembers] = useState<Member[]>([]);
  const [officials, setOfficials] = useState<Official[]>([]);
  const [historicalPolities, setHistoricalPolities] = useState<MapFeature[]>([]);
  const [districts, setDistricts] = useState<MapFeature[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [zoom, setZoom] = useState<ZoomState>({ x: 0, y: 0, k: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const zoomLayerRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomState>({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{
    clientX: number;
    clientY: number;
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
  } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const followsTodayRef = useRef(true);
  const congress = congressFor(date);

  useEffect(() => {
    const refreshToday = () => {
      const current = currentUsDate();
      setToday(current);
      if (followsTodayRef.current) {
        setDate(current);
        setDateDraft(current);
      }
    };
    queueMicrotask(refreshToday);
    const timer = window.setInterval(refreshToday, 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
    queueMicrotask(() => { if (!cancelled) setMapLoading(true); });
    fetch(`/data/districts/${String(congress).padStart(3, "0")}.json`)
      .then((response) => response.json())
      .then((topology: Topology) => {
        if (cancelled) return;
        const features = Object.values(topology.objects).flatMap((object) => {
          const converted = feature(topology, object as GeometryCollection<MapProperties>);
          return converted.type === "FeatureCollection" ? converted.features : [converted];
        }) as MapFeature[];
        const latestPlanByDistrict = new Map<string, MapFeature>();
        features.filter((mapFeature) => (mapFeature.properties.district ?? 0) >= 0).forEach((mapFeature) => {
          const key = `${mapFeature.properties.statename}:${mapFeature.properties.district ?? 0}`;
          latestPlanByDistrict.set(key, mapFeature);
        });
        setDistricts([...latestPlanByDistrict.values()]);
        setMapLoading(false);
      });
    return () => { cancelled = true; };
  }, [chamber, congress]);

  useEffect(() => {
    const reset = { x: 0, y: 0, k: 1 };
    let cancelled = false;
    zoomRef.current = reset;
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    queueMicrotask(() => {
      if (cancelled) return;
      setZoom(reset);
      setTooltip(null);
    });
    return () => { cancelled = true; };
  }, [chamber]);

  useEffect(() => () => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
  }, []);

  const activeMembers = useMemo(
    () => members.filter((member) => member.t === chamber && (chamber === "sen" || STATE_CODES.has(member.s)) && member.a <= date && member.z > date),
    [members, chamber, date],
  );
  const activeOfficials = useMemo(
    () => officials.filter((official) => official.a <= date && (!official.z || official.z > date)),
    [officials, date],
  );
  const resolvedActiveOfficials = useMemo(() => {
    const byOffice = Map.groupBy(activeOfficials, (official) => official.t);
    return [...byOffice.entries()].flatMap(([title, rows]) => {
      const unique = [...new Map(rows.map((row) => [`${row.id}-${row.a}`, row])).values()];
      if (title === "Associate Justice") return unique;
      return unique.sort((a, b) => b.a.localeCompare(a.a)).slice(0, 1);
    });
  }, [activeOfficials]);
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
  const houseSeatCapacity = useMemo(() => {
    const [congressStart, congressEnd] = congressDates(congress);
    const terms = members.filter((member) =>
      member.t === "rep" && STATE_CODES.has(member.s) && member.a < congressEnd && member.z > congressStart,
    );
    const observed = Math.max(0, ...[congressStart, ...terms.map((term) => term.a)]
      .map((point) => terms.filter((term) => term.a <= point && term.z > point).length));
    return congress >= 63 ? Math.max(435, observed) : observed;
  }, [congress, members]);
  const chamberSummary = useMemo(() => {
    const seatTotal = chamber === "sen" ? activeStates.length * 2 : houseSeatCapacity;
    const vacancies = Math.max(0, seatTotal - activeMembers.length);
    const controlCounts = new Map<string, number>();
    const visualGroups = new Map<string, { label: string; color: string; count: number }>();
    for (const member of activeMembers) {
      const controlParty = member.c ?? member.p;
      controlCounts.set(controlParty, (controlCounts.get(controlParty) ?? 0) + 1);
      const key = `${member.p}|${member.c ?? ""}`;
      const label = partyLabel(member);
      const group = visualGroups.get(key) ?? { label, color: colorForMember(member), count: 0 };
      group.count += 1;
      visualGroups.set(key, group);
    }
    const majority = Math.floor(seatTotal / 2) + 1;
    const [leadingParty, leadingSeats = 0] = [...controlCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    const vicePresident = resolvedActiveOfficials.find((official) => official.t === "Vice President");
    const tieBreak = chamber === "sen" && leadingSeats === seatTotal / 2 && vicePresident?.p === leadingParty;
    const hasControl = leadingSeats >= majority || tieBreak;
    const partyName = leadingParty === "Democrat" ? "Democratic" : leadingParty;
    const controlLabel = hasControl
      ? `${partyName} control${tieBreak && leadingSeats < majority ? " · VP tie-break" : ""}`
      : "No party majority";
    const segments = [...visualGroups.values()].sort((a, b) => {
      const order = (label: string) => label.startsWith("Democrat") ? 0 : label.startsWith("Independent · Democratic") ? 1 : label.startsWith("Independent") ? 2 : label.startsWith("Republican") ? 4 : 3;
      return order(a.label) - order(b.label);
    });
    if (vacancies) segments.push({ label: "Vacant", color: VACANT_COLOR, count: vacancies });
    return { seatTotal, vacancies, majority, controlLabel, segments };
  }, [activeMembers, activeStates.length, chamber, houseSeatCapacity, resolvedActiveOfficials]);
  const visibleDistricts = useMemo(() => {
    const [congressStart, congressEnd] = congressDates(congress);
    const planMembers = members.filter(
      (member) => member.t === "rep" && member.a < congressEnd && member.z > congressStart,
    );
    const numberedStates = new Set(
      districts
        .filter((mapFeature) => (mapFeature.properties.district ?? 0) > 0)
        .map((mapFeature) => mapFeature.properties.statename),
    );
    return districts.filter((mapFeature) => {
      const stateName = mapFeature.properties.statename;
      return houseBoundaryBelongsToPlan(
        planMembers,
        STATE_ABBR[stateName ?? ""],
        mapFeature.properties.district ?? 0,
        numberedStates.has(stateName),
      );
    });
  }, [congress, districts, members]);
  const visibleFeatures = chamber === "sen" ? activeStates : visibleDistricts;
  const projection = useMemo(() => {
    const geographicFrame = activePolities.length ? activePolities : visibleFeatures;
    if (!geographicFrame.length) return null;
    const collection: FeatureCollection<Geometry, GeoJsonProperties> = { type: "FeatureCollection", features: geographicFrame };
    return geoAlbersUsa().fitExtent([[22, 18], [978, 602]], collection);
  }, [activePolities, visibleFeatures]);
  const path = useMemo(() => projection ? geoPath(projection) : null, [projection]);

  const numberedDistrictStates = useMemo(
    () => new Set(
      visibleDistricts
        .filter((mapFeature) => (mapFeature.properties.district ?? 0) > 0)
        .map((mapFeature) => mapFeature.properties.statename),
    ),
    [visibleDistricts],
  );

  const memberForDistrict = useCallback((mapFeature: MapFeature) => {
    const state = STATE_ABBR[mapFeature.properties.statename ?? ""];
    const district = mapFeature.properties.district ?? 0;
    const hasNumberedDistricts = numberedDistrictStates.has(mapFeature.properties.statename);
    return houseMembersForDistrict(activeMembers, state, district, hasNumberedDistricts);
  }, [activeMembers, numberedDistrictStates]);

  const senatorsForState = useCallback((mapFeature: MapFeature) => {
    const state = STATE_ABBR[mapFeature.properties.NAME ?? mapFeature.properties.name ?? ""];
    return activeMembers.filter((member) => member.s === state);
  }, [activeMembers]);

  const senateSeatColors = useCallback((mapFeature: MapFeature) => {
    const senators = senatorsForState(mapFeature);
    return [colorForMember(senators[0]), colorForMember(senators[1])];
  }, [senatorsForState]);

  const fillFor = useCallback((mapFeature: MapFeature) => {
    if (chamber === "rep") return colorForMember(memberForDistrict(mapFeature)[0]);
    const colors = senateSeatColors(mapFeature);
    return colors[0] === colors[1]
      ? colors[0]
      : `url(#split-${STATE_ABBR[mapFeature.properties.NAME ?? mapFeature.properties.name ?? ""]})`;
  }, [chamber, memberForDistrict, senateSeatColors]);

  const backgroundPathElements = useMemo(
    () => path ? activePolities.map((polity, index) => (
      <path
        key={`${polity.properties.NAME}-${polity.properties.START_N}-${index}`}
        d={path(polity) ?? undefined}
        className={polity.properties.TERR_TYPE === "State" ? "historical-state" : "historical-territory"}
      />
    )) : [],
    [activePolities, path],
  );

  const mapPathElements = useMemo(
    () => path ? visibleFeatures.map((mapFeature, index) => (
      <path
        key={`${mapFeature.properties.NAME ?? mapFeature.properties.name ?? mapFeature.properties.statename}-${mapFeature.properties.district ?? index}`}
        d={path(mapFeature) ?? undefined}
        fill={fillFor(mapFeature)}
        onMouseMove={(event) => {
          if (dragRef.current) return;
          const rect = mapRef.current?.getBoundingClientRect();
          if (rect) {
            const pointerX = event.clientX - rect.left;
            const pointerY = event.clientY - rect.top;
            const cardWidth = Math.min(220, rect.width - 16);
            const preferredHeight = Math.min(190, rect.height - 16);
            const x = pointerX + 12 + cardWidth <= rect.width - 8
              ? pointerX + 12
              : Math.max(8, pointerX - cardWidth - 12);
            const y = pointerY + 12 + preferredHeight <= rect.height - 8
              ? pointerY + 12
              : Math.max(8, pointerY - preferredHeight - 12);
            setTooltip({
              x,
              y,
              maxHeight: Math.max(60, rect.height - y - 8),
              feature: mapFeature,
            });
          }
        }}
      />
    )) : [],
    [fillFor, path, visibleFeatures],
  );

  const applyZoom = useCallback((next: ZoomState) => {
    zoomRef.current = next;
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = requestAnimationFrame(() => {
      const current = zoomRef.current;
      zoomLayerRef.current?.setAttribute("transform", `translate(${current.x} ${current.y}) scale(${current.k})`);
      animationFrameRef.current = null;
    });
  }, []);

  const zoomBy = useCallback((factor: number, point = { x: 500, y: 310 }) => {
    const current = zoomRef.current;
    const nextK = Math.max(1, Math.min(16, current.k * factor));
    const ratio = nextK / current.k;
    const next = { k: nextK, x: point.x - (point.x - current.x) * ratio, y: point.y - (point.y - current.y) * ratio };
    applyZoom(next);
    setZoom(next);
  }, [applyZoom]);

  const resetZoom = useCallback(() => {
    const reset = { x: 0, y: 0, k: 1 };
    applyZoom(reset);
    setZoom(reset);
  }, [applyZoom]);

  const handleMapKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "+" || event.key === "=") zoomBy(1.5);
    else if (event.key === "-" || event.key === "_") zoomBy(1 / 1.5);
    else if (event.key === "0") resetZoom();
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      const current = zoomRef.current;
      const distance = 45;
      const next = {
        ...current,
        x: current.x + (event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0),
        y: current.y + (event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0),
      };
      applyZoom(next);
      setZoom(next);
    } else return;
    event.preventDefault();
  }, [applyZoom, resetZoom, zoomBy]);

  const changeDate = useCallback((next: string) => {
    if (!isValidDateInRange(next, today)) return false;
    followsTodayRef.current = next === today;
    setDate(next);
    setDateDraft(next);
    return true;
  }, [today]);

  const maxDay = toDay(today);
  const timelineMarks = [...TIMELINE_MARKS, [today, "Today"]] as const;
  const groups = ["Executive", "Cabinet", "Cabinet-level", "Supreme Court"];
  const chamberLeadership = resolvedActiveOfficials
    .filter((official) => official.g === "Congressional leadership" && official.h === chamber)
    .sort((a, b) => a.o - b.o);

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#atlas" aria-label="American State home">
          <span className="brand-mark" aria-hidden="true" />
          <span><strong>American State</strong><small>A day-by-day atlas of U.S. government</small></span>
        </a>
        <nav aria-label="Site links">
          <a href="#atlas">Atlas</a><a href="#sources">Sources</a>
        </nav>
        <div className="coverage"><span /> Data through {longDate(today)}</div>
      </header>

      <section className="atlas-shell" id="atlas">
        <div className="atlas-main">
          <div className="date-deck">
            <button className="step-button" onClick={() => changeDate(fromDay(Math.max(0, toDay(date) - 1)))} aria-label="Previous day">←</button>
            <label className="date-readout">
              <span>DATE IN VIEW</span>
              <input
                type="date"
                min={MIN_DATE}
                max={today}
                value={dateDraft}
                onChange={(event) => {
                  const next = event.target.value;
                  setDateDraft(next);
                  changeDate(next);
                }}
                onBlur={() => { if (!isValidDateInRange(dateDraft, today)) setDateDraft(date); }}
              />
            </label>
            <button className="step-button" onClick={() => changeDate(fromDay(Math.min(maxDay, toDay(date) + 1)))} aria-label="Next day">→</button>
            <div className="term-card"><span>{termLabel(congress)}</span><strong>{activeMembers.length || "—"}</strong><small>{chamber === "rep" ? "House seats filled" : "Senate seats filled"}</small></div>
          </div>

          <div className="slider-wrap">
            <input aria-label="Historical date" type="range" min={0} max={maxDay} value={toDay(date)} onChange={(event) => changeDate(fromDay(Number(event.target.value)))} />
            <div className="era-labels" aria-hidden="true">
              {timelineMarks.map(([markDate, label], index) => (
                <span
                  className={index === 0 ? "first" : index === timelineMarks.length - 1 ? "last" : ""}
                  key={markDate}
                  style={{ left: `${(toDay(markDate) / maxDay) * 100}%` }}
                >{label}</span>
              ))}
            </div>
          </div>

          <div className="map-toolbar">
            <div className="chamber-tabs" role="tablist" aria-label="Chamber">
              <button className={chamber === "rep" ? "active" : ""} onClick={() => setChamber("rep")} role="tab">House districts</button>
              <button className={chamber === "sen" ? "active" : ""} onClick={() => setChamber("sen")} role="tab">Senate</button>
            </div>
            <p>{chamber === "rep" ? "Hover for members · drag to pan · +/− to zoom" : "Hover for senators · drag to pan · +/− to zoom"}</p>
          </div>

          <section className="control-board" aria-label={`${chamber === "rep" ? "House" : "Senate"} party control`}>
            <div className="control-heading">
              <span>{chamber === "rep" ? "HOUSE CONTROL" : "SENATE CONTROL"}</span>
              <strong>{chamberSummary.controlLabel}</strong>
              <small>{activeMembers.length} of {chamberSummary.seatTotal} seats filled{chamberSummary.vacancies ? ` · ${chamberSummary.vacancies} vacant` : ""}</small>
            </div>
            <div className="control-meter" aria-label={`Majority threshold: ${chamberSummary.majority} seats`}>
              {chamberSummary.segments.map((segment) => (
                <i
                  key={segment.label}
                  style={{ width: `${(segment.count / Math.max(1, chamberSummary.seatTotal)) * 100}%`, background: segment.color }}
                  title={`${segment.label}: ${segment.count}`}
                />
              ))}
              <span className="majority-marker" style={{ left: `${(chamberSummary.majority / Math.max(1, chamberSummary.seatTotal)) * 100}%` }}><b>MAJORITY {chamberSummary.majority}</b></span>
            </div>
            <div className="control-key">
              {chamberSummary.segments.map((segment) => <span key={segment.label}><i style={{ background: segment.color }} />{segment.label}<b>{segment.count}</b></span>)}
            </div>
            <div className="leadership-strip">
              <span className="leadership-label">LEADERSHIP</span>
              {chamberLeadership.map((official) => (
                <div className="leadership-person" key={`${official.t}-${official.id}`}>
                  <small>{official.t}</small>
                  <strong><a href={wikipediaHref(official)} target="_blank" rel="noreferrer">{official.n}</a></strong>
                  {official.p && <span><i style={{ background: colorFor(official.p) }} />{official.p}</span>}
                </div>
              ))}
              {!chamberLeadership.length && <p>No dated chamber leadership record for this date.</p>}
            </div>
          </section>

          <div
            className={`map-frame ${isPanning ? "is-panning" : ""}`}
            ref={mapRef}
            role="region"
            tabIndex={0}
            aria-label="Interactive map. Drag to pan; use plus and minus to zoom; use arrow keys to pan; press zero to reset."
            onKeyDown={handleMapKeyDown}
            onMouseLeave={() => setTooltip(null)}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              const rect = event.currentTarget.getBoundingClientRect();
              dragRef.current = {
                clientX: event.clientX,
                clientY: event.clientY,
                x: zoomRef.current.x,
                y: zoomRef.current.y,
                scaleX: 1000 / rect.width,
                scaleY: 620 / rect.height,
              };
              setIsPanning(true);
              setTooltip(null);
            }}
            onPointerMove={(event) => {
              if (!dragRef.current) return;
              applyZoom({
                ...zoomRef.current,
                x: dragRef.current.x + (event.clientX - dragRef.current.clientX) * dragRef.current.scaleX,
                y: dragRef.current.y + (event.clientY - dragRef.current.clientY) * dragRef.current.scaleY,
              });
            }}
            onPointerUp={() => { dragRef.current = null; setZoom(zoomRef.current); setIsPanning(false); }}
            onPointerCancel={() => { dragRef.current = null; setZoom(zoomRef.current); setIsPanning(false); }}
          >
            {mapLoading && chamber === "rep" && <div className="map-loading"><span /> Loading {termLabel(congress)} boundaries</div>}
            <div className="zoom-controls" aria-label="Map zoom controls" onPointerDown={(event) => event.stopPropagation()}>
              <button onClick={() => zoomBy(1.5)} aria-label="Zoom in">+</button>
              <button onClick={() => zoomBy(1 / 1.5)} aria-label="Zoom out">−</button>
              <button onClick={resetZoom} aria-label="Reset map view">Reset</button>
            </div>
            <svg viewBox="0 0 1000 620" role="img" aria-label={`${chamber === "rep" ? "House district" : "Senate"} map on ${longDate(date)}`}>
              <defs>
                {chamber === "sen" && activeStates.map((state) => {
                  const code = STATE_ABBR[state.properties.NAME ?? state.properties.name ?? ""];
                  const colors = senateSeatColors(state);
                  if (colors[0] === colors[1]) return null;
                  return <linearGradient id={`split-${code}`} key={code} x1="0" x2="1"><stop offset="50%" stopColor={colors[0]} /><stop offset="50%" stopColor={colors[1]} /></linearGradient>;
                })}
              </defs>
              <g ref={zoomLayerRef} transform={`translate(${zoom.x} ${zoom.y}) scale(${zoom.k})`}>
                <g className="polity-background">
                  {backgroundPathElements}
                </g>
                <g className="map-paths">
                  {mapPathElements}
                </g>
              </g>
            </svg>
            {tooltip && (
              <div
                className="tooltip"
                style={{ left: tooltip.x, top: tooltip.y, maxHeight: tooltip.maxHeight }}
                onPointerDown={(event) => event.stopPropagation()}
                onWheel={(event) => event.stopPropagation()}
              >
                {chamber === "sen" ? (
                  <>
                    <strong>{tooltip.feature.properties.NAME ?? tooltip.feature.properties.name}</strong><span>U.S. Senate</span>
                    <ul>{[0, 1].map((seat) => {
                      const member = senatorsForState(tooltip.feature)[seat];
                      return member
                        ? <li key={member.id}><i style={{ background: colorForMember(member) }} /><a href={wikipediaHref(member)} target="_blank" rel="noreferrer">{member.n}</a><small>{partyLabel(member)}</small></li>
                        : <li className="vacant-seat" key={`vacant-${seat}`}><i />Vacant<small>Unfilled Senate seat</small></li>;
                    })}</ul>
                  </>
                ) : (
                  <>
                    <strong>{tooltip.feature.properties.statename}{(tooltip.feature.properties.district ?? 0) > 0 ? ` · District ${tooltip.feature.properties.district}` : " · At large"}</strong>
                    <span>U.S. House</span>
                    {memberForDistrict(tooltip.feature).map((member) => <div className="house-member" key={member.id}><i style={{ background: colorForMember(member) }} /><b><a href={wikipediaHref(member)} target="_blank" rel="noreferrer">{member.n}</a></b><small>{partyLabel(member)}</small></div>)}
                    {!memberForDistrict(tooltip.feature).length && <p>Seat vacant or no member record on this date.</p>}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="legend">
            <span className="legend-title">SEATS FILLED</span>
            {chamberSummary.segments.slice(0, 7).map((segment) => <span key={segment.label}><i style={{ background: segment.color }} />{segment.label}<b>{segment.count}</b></span>)}
            <span><i className="territory-swatch" />Territory / other U.S. area</span>
          </div>
        </div>

        <aside className="officials-rail">
          <div className="rail-heading"><p>GOVERNMENT ON</p><h2>{longDate(date)}</h2><span>{termLabel(congress)}</span></div>
          {groups.map((group) => {
            const rows = resolvedActiveOfficials.filter((official) => official.g === group).sort((a, b) => a.o - b.o || a.a.localeCompare(b.a));
            const offices = [...Map.groupBy(rows, (official) => official.t).entries()];
            return (
              <details key={group} open={group !== "Cabinet" || rows.length < 10}>
                <summary><span>{group}</span><b>{offices.length}</b></summary>
                <div className="official-list">
                  {offices.map(([title, holders]) => (
                    <section className="official-office" key={title}>
                      <h3>{title === "Associate Justice" ? "Associate Justices" : title}</h3>
                      {holders.map((official) => (
                        <div className="official-holder" key={`${official.id}-${official.a}`}>
                          <span className="official-name">
                            {official.p && <i className="official-party-dot" style={{ background: colorFor(official.p) }} />}
                            <strong><a href={wikipediaHref(official)} target="_blank" rel="noreferrer">{official.n}</a></strong>
                          </span>
                          {(official.x || official.p) && <small>{official.x ? "Acting" : ""}{official.x && official.p ? " · " : ""}{official.p ?? ""}</small>}
                        </div>
                      ))}
                    </section>
                  ))}
                  {!rows.length && <p className="empty">No dated officeholder in the source record.</p>}
                </div>
              </details>
            );
          })}
          <p className="rail-note">Offices appear only after their creation. Vacancies and acting tenures are shown when they are present in the source record.</p>
        </aside>
      </section>

      <footer id="sources">
        <p><strong>Sources:</strong> UCLA Congressional District Boundaries · Newberry Library · Congress Legislators · U.S. House and Senate historical offices · Wikidata</p>
        <small>Research interface · vacancies, acting service, caucus affiliation, and dated corrections are modeled explicitly.</small>
      </footer>
    </main>
  );
}
