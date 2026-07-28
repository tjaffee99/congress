"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature, merge } from "topojson-client";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import { isConfederateState } from "./confederate-state.mjs";
import { houseBoundaryBelongsToPlan, houseMembersForDistrict, houseStatewideAtLargeMembers } from "./house-members.mjs";
import { reconstructionDistrictForState } from "./reconstruction-district.mjs";
import { isEditableKeyboardTarget, scrubStepForDuration } from "./date-scrub.mjs";
import { clampZoom, isLikelyMouseWheel } from "./map-input.mjs";
import { FEDERAL_CONGRESS_START, PRECONSTITUTIONAL_STATE_NAMES, preconstitutionalCongressLabel, presidentOfCongress, vermontPolityForDate } from "./preconstitutional.mjs";

type Chamber = "sen" | "rep" | "congress";
type Member = { id: string; n: string; t: Chamber; s: string; d: number | null; k?: number | null; p: string; c: string | null; w: string | null; a: string; z: string; body?: string; year?: number };
type Official = { id: string; n: string; t: string; g: string; o: number; h: Chamber | null; p: string | null; s?: string | null; x?: boolean; w?: string | null; a: string; z: string | null };
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
type TooltipState = { x: number; y: number; maxHeight: number; pinned: boolean; labelOnly: string | null; feature: MapFeature };
type PointerPosition = { clientX: number; clientY: number };
type PinchState = { distance: number; worldX: number; worldY: number; k: number };

const MIN_DATE = "1776-07-04";
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
  [MIN_DATE, "1776"],
  ["1800-01-01", "1800"],
  ["1850-01-01", "1850"],
  ["1900-01-01", "1900"],
  ["1950-01-01", "1950"],
  ["2000-01-01", "2000"],
] as const;

const LEADERSHIP_OFFICES = {
  rep: [
    { title: "Speaker of the House", created: "1789-03-04", order: 40 },
    { title: "House majority leader", created: "1899-03-04", order: 42 },
    { title: "House majority whip", created: "1897-03-04", order: 43 },
    { title: "House minority leader", created: "1899-03-04", order: 44 },
    { title: "House minority whip", created: "1899-03-04", order: 45 },
  ],
  sen: [
    { title: "President of the Senate", created: "1789-03-04", order: 40 },
    { title: "President pro tempore", created: "1789-03-04", order: 41 },
    { title: "Senate majority leader", created: "1893-03-04", order: 42 },
    { title: "Senate majority whip", created: "1913-05-28", order: 43 },
    { title: "Senate minority leader", created: "1889-03-04", order: 44 },
    { title: "Senate minority whip", created: "1915-03-04", order: 45 },
  ],
} as const;

const PARTY_COLORS: Record<string, string> = {
  Republican: "#b64c44", Democrat: "#416f91", Independent: "#887c70", Federalist: "#b28a43",
  "Democratic-Republican": "#5e806f", Whig: "#b58a64", "Anti-Administration": "#80678c",
  "Pro-Administration": "#b17449", Jackson: "#53778a", "Adams-Clay Federalist": "#a47d47",
  Unionist: "#7d6d59", "Conservative Republican": "#9b574c", Populist: "#807548",
  Progressive: "#59847a", "Free Soil": "#6c8454", "American Labor": "#7b5e72", Unknown: "#aaa398",
};
const CAUCUS_COLORS: Record<string, string> = { Democrat: "#91aec2", Republican: "#d99a95" };
const VACANT_COLOR = "#c8c2b8";
const CONFEDERATE_COLOR = "#454846";
const RECONSTRUCTION_COLOR = "#6f7471";

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
  if (date < FEDERAL_CONGRESS_START) return 0;
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

function governmentTermLabel(date: string, congress: number) {
  return date < FEDERAL_CONGRESS_START ? preconstitutionalCongressLabel(date) : termLabel(congress);
}

export default function Home() {
  const [today, setToday] = useState(currentUsDate);
  const [date, setDate] = useState(currentUsDate);
  const [dateDraft, setDateDraft] = useState(currentUsDate);
  const [chamber, setChamber] = useState<Chamber>("rep");
  const [federalMembers, setFederalMembers] = useState<Member[]>([]);
  const [preconstitutionalMembers, setPreconstitutionalMembers] = useState<Member[]>([]);
  const [officials, setOfficials] = useState<Official[]>([]);
  const [historicalPolities, setHistoricalPolities] = useState<MapFeature[]>([]);
  const [preRepublicNewYork, setPreRepublicNewYork] = useState<MapFeature | null>(null);
  const [earlyVermontRepublic, setEarlyVermontRepublic] = useState<MapFeature | null>(null);
  const [districts, setDistricts] = useState<MapFeature[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [highDetail, setHighDetail] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [zoom, setZoom] = useState<ZoomState>({ x: 0, y: 0, k: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const zoomLayerRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomState>({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
  } | null>(null);
  const touchPointersRef = useRef(new Map<number, PointerPosition>());
  const pinchRef = useRef<PinchState | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const followsTodayRef = useRef(true);
  const pinnedTooltipRef = useRef(false);
  const didPanRef = useRef(false);
  const dateRef = useRef(date);
  const heldArrowRef = useRef<{ key: "ArrowLeft" | "ArrowRight"; startedAt: number } | null>(null);
  const preconstitutionalRequestRef = useRef(false);
  const congress = congressFor(date);
  const members = useMemo(() => [...preconstitutionalMembers, ...federalMembers], [federalMembers, preconstitutionalMembers]);

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
    fetch("/data/members.json").then((response) => response.json()).then((memberData: Member[]) => setFederalMembers(memberData));
    fetch("/data/officials.json").then((response) => response.json()).then((officialData: Official[]) => setOfficials(officialData));
    fetch("/data/historical-polities.json").then((response) => response.json()).then((topology: Topology) => {
      const object = Object.values(topology.objects)[0] as GeometryCollection<MapProperties>;
      const collection = feature(topology, object) as FeatureCollection<Geometry, MapProperties>;
      setHistoricalPolities(collection.features);
      const earliestGeometry = (name: string) => object.geometries
        .filter((geometry) => geometry.properties?.NAME === name)
        .sort((a, b) => (a.properties?.START_N ?? 0) - (b.properties?.START_N ?? 0))[0];
      const newYorkGeometry = earliestGeometry("New York");
      const vermontGeometry = earliestGeometry("Vermont Republic");
      const vermontFeature = collection.features
        .filter((mapFeature) => mapFeature.properties.NAME === "Vermont Republic")
        .sort((a, b) => (a.properties.START_N ?? 0) - (b.properties.START_N ?? 0))[0];
      if (newYorkGeometry && vermontGeometry) {
        setPreRepublicNewYork({
          type: "Feature",
          properties: { NAME: "New York", TERR_TYPE: "State", START_N: 17760704, END_N: 17770114 },
          geometry: merge(topology, [newYorkGeometry, vermontGeometry]) as Geometry,
        });
      }
      if (vermontFeature) setEarlyVermontRepublic(vermontFeature);
    });
  }, []);

  useEffect(() => {
    if (date >= FEDERAL_CONGRESS_START || preconstitutionalMembers.length || preconstitutionalRequestRef.current) return;
    preconstitutionalRequestRef.current = true;
    fetch("/data/preconstitutional.json")
      .then((response) => response.json())
      .then((memberData: Member[]) => setPreconstitutionalMembers(memberData))
      .finally(() => { preconstitutionalRequestRef.current = false; });
  }, [date, preconstitutionalMembers.length]);

  useEffect(() => {
    if (chamber !== "rep") return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setMapLoading(true); });
    const detailDirectory = highDetail ? "districts-high" : "districts";
    fetch(`/data/${detailDirectory}/${String(congress).padStart(3, "0")}.json`)
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
  }, [chamber, congress, highDetail]);

  useEffect(() => {
    const reset = { x: 0, y: 0, k: 1 };
    let cancelled = false;
    pinnedTooltipRef.current = false;
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

  const membersByCongress = useMemo(() => {
    const house = new Map<number, Member[]>();
    const senate = new Map<number, Member[]>();
    for (const member of federalMembers) {
      if ((member.t !== "rep" && member.t !== "sen") || !STATE_CODES.has(member.s)) continue;
      const firstCongress = congressFor(member.a);
      const lastDay = fromDay(Math.max(0, toDay(member.z) - 1));
      const lastCongress = congressFor(lastDay);
      const index = member.t === "rep" ? house : senate;
      for (let term = firstCongress; term <= lastCongress; term += 1) {
        const bucket = index.get(term) ?? [];
        bucket.push(member);
        index.set(term, bucket);
      }
    }
    return { house, senate };
  }, [federalMembers]);
  const activeHouseMembers = useMemo(
    () => (membersByCongress.house.get(congress) ?? []).filter((member) => !isConfederateState(member.s, date) && !reconstructionDistrictForState(member.s, date) && member.a <= date && member.z > date),
    [congress, date, membersByCongress],
  );
  const activeMembers = useMemo(() => {
    if (chamber === "rep") return activeHouseMembers;
    if (chamber === "congress") {
      return preconstitutionalMembers.filter((member) => member.a <= date && member.z > date);
    }
    const candidates = (membersByCongress.senate.get(congress) ?? []).filter((member) => !isConfederateState(member.s, date) && !reconstructionDistrictForState(member.s, date) && member.a <= date && member.z > date);
    const bySeat = new Map<string, Member>();
    for (const member of candidates) {
      const key = `${member.s}:${member.k ?? member.id}`;
      const incumbent = bySeat.get(key);
      if (!incumbent || member.z > incumbent.z || (member.z === incumbent.z && member.a > incumbent.a)) bySeat.set(key, member);
    }
    return [...bySeat.values()].sort((a, b) => a.s.localeCompare(b.s) || (a.k ?? 0) - (b.k ?? 0));
  }, [activeHouseMembers, chamber, congress, date, membersByCongress, preconstitutionalMembers]);
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
    () => {
      if (date < "1783-09-03") {
        const originalStates = PRECONSTITUTIONAL_STATE_NAMES.flatMap((stateName) => {
          if (stateName === "New York" && vermontPolityForDate(date) === "New York" && preRepublicNewYork) return [preRepublicNewYork];
          const earliest = historicalPolities
            .filter((polity) => polity.properties.TERR_TYPE === "State" && polity.properties.NAME === stateName)
            .sort((a, b) => (a.properties.START_N ?? 0) - (b.properties.START_N ?? 0))[0];
          return earliest ? [earliest] : [];
        });
        return vermontPolityForDate(date) === "Vermont Republic" && earlyVermontRepublic
          ? [...originalStates, earlyVermontRepublic]
          : originalStates;
      }
      return historicalPolities.filter((polity) => {
        const start = polity.properties.START_N ?? 0;
        const end = polity.properties.END_N ?? 20001231;
        return start <= numericDate && (end >= numericDate || (end === 20001231 && numericDate > end));
      });
    },
    [date, earlyVermontRepublic, historicalPolities, numericDate, preRepublicNewYork],
  );
  const activeStates = useMemo(
    () => activePolities.filter((polity) => polity.properties.TERR_TYPE === "State"),
    [activePolities],
  );
  const houseSeatCapacity = useMemo(() => {
    if (congress < 1) return 0;
    const [congressStart, congressEnd] = congressDates(congress);
    const terms = members.filter((member) =>
      member.t === "rep" && STATE_CODES.has(member.s) && member.a < congressEnd && member.z > congressStart,
    );
    const observed = Math.max(0, ...[congressStart, ...terms.map((term) => term.a)]
      .map((point) => terms.filter((term) => term.a <= point && term.z > point).length));
    return congress >= 63 ? Math.max(435, observed) : observed;
  }, [congress, members]);
  const chamberSummary = useMemo(() => {
    if (chamber === "congress") {
      const representedStates = new Set(activeMembers.map((member) => member.s)).size;
      return {
        seatTotal: 13,
        vacancies: 13 - representedStates,
        majority: 7,
        controlLabel: "One vote per state delegation",
        segments: [{ label: "States represented", color: "#657a71", count: representedStates }],
      };
    }
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
    const numberedStates = new Set(
      districts
        .filter((mapFeature) => (mapFeature.properties.district ?? 0) > 0)
        .map((mapFeature) => mapFeature.properties.statename),
    );
    const activeNumberedStates = new Set(
      activeHouseMembers.filter((member) => (member.d ?? 0) > 0).map((member) => member.s),
    );
    return districts.filter((mapFeature) => {
      const stateName = mapFeature.properties.statename;
      const state = STATE_ABBR[stateName ?? ""];
      const district = mapFeature.properties.district ?? 0;
      const hasNumberedDistricts = numberedStates.has(stateName) && activeNumberedStates.has(state);
      if (district > 0 && !hasNumberedDistricts) return false;
      if (!houseBoundaryBelongsToPlan(activeHouseMembers, state, district, hasNumberedDistricts)) return false;
      return district !== 0 || !houseStatewideAtLargeMembers(activeHouseMembers, state, hasNumberedDistricts).length;
    });
  }, [activeHouseMembers, districts]);
  const visibleFeatures = chamber === "rep" ? visibleDistricts : activeStates;
  const projectionFrame = useMemo(
    () => historicalPolities.filter((polity) => polity.properties.TERR_TYPE === "State" && polity.properties.END_N === 20001231),
    [historicalPolities],
  );
  const projection = useMemo(() => {
    if (!projectionFrame.length) return null;
    const collection: FeatureCollection<Geometry, GeoJsonProperties> = { type: "FeatureCollection", features: projectionFrame };
    return geoAlbersUsa().fitExtent([[22, 18], [978, 602]], collection);
  }, [projectionFrame]);
  const path = useMemo(() => projection ? geoPath(projection) : null, [projection]);
  const pathCache = useMemo(() => ({ generator: path, values: new WeakMap<MapFeature, string>() }), [path]);
  const pathForFeature = useCallback((mapFeature: MapFeature) => {
    if (!pathCache.generator) return undefined;
    const cached = pathCache.values.get(mapFeature);
    if (cached !== undefined) return cached || undefined;
    const generated = pathCache.generator(mapFeature) ?? "";
    pathCache.values.set(mapFeature, generated);
    return generated || undefined;
  }, [pathCache]);

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

  const statewideAtLargeMembersForDistrict = useCallback((mapFeature: MapFeature) => {
    if ((mapFeature.properties.district ?? 0) <= 0) return [];
    const stateName = mapFeature.properties.statename;
    return houseStatewideAtLargeMembers(
      activeMembers,
      STATE_ABBR[stateName ?? ""],
      numberedDistrictStates.has(stateName),
    );
  }, [activeMembers, numberedDistrictStates]);

  const mixedDistrictPatternId = useCallback((mapFeature: MapFeature) => {
    const state = STATE_ABBR[mapFeature.properties.statename ?? ""] ?? "state";
    return `mixed-${state}-${mapFeature.properties.district ?? 0}`;
  }, []);

  const senatorsForState = useCallback((mapFeature: MapFeature) => {
    const state = STATE_ABBR[mapFeature.properties.NAME ?? mapFeature.properties.name ?? ""];
    return activeMembers.filter((member) => member.s === state).sort((a, b) => (a.k ?? 0) - (b.k ?? 0));
  }, [activeMembers]);

  const delegatesForState = useCallback((mapFeature: MapFeature) => {
    const state = STATE_ABBR[mapFeature.properties.NAME ?? mapFeature.properties.name ?? ""];
    return activeMembers.filter((member) => member.s === state).sort((a, b) => a.n.localeCompare(b.n));
  }, [activeMembers]);

  const senateSeatColors = useCallback((mapFeature: MapFeature) => {
    const senators = senatorsForState(mapFeature);
    return [colorForMember(senators[0]), colorForMember(senators[1])];
  }, [senatorsForState]);

  const fillFor = useCallback((mapFeature: MapFeature) => {
    if (chamber === "congress") return delegatesForState(mapFeature).length ? "#657a71" : VACANT_COLOR;
    if (chamber === "rep") {
      return statewideAtLargeMembersForDistrict(mapFeature).length
        ? `url(#${mixedDistrictPatternId(mapFeature)})`
        : colorForMember(memberForDistrict(mapFeature)[0]);
    }
    const colors = senateSeatColors(mapFeature);
    return colors[0] === colors[1]
      ? colors[0]
      : `url(#split-${STATE_ABBR[mapFeature.properties.NAME ?? mapFeature.properties.name ?? ""]})`;
  }, [chamber, delegatesForState, memberForDistrict, mixedDistrictPatternId, senateSeatColors, statewideAtLargeMembersForDistrict]);

  const isConfederateFeature = useCallback((mapFeature: MapFeature) => {
    const stateName = mapFeature.properties.statename ?? mapFeature.properties.NAME ?? mapFeature.properties.name ?? "";
    return isConfederateState(STATE_ABBR[stateName], date);
  }, [date]);

  const reconstructionDistrictForFeature = useCallback((mapFeature: MapFeature) => {
    const stateName = mapFeature.properties.statename ?? mapFeature.properties.NAME ?? mapFeature.properties.name ?? "";
    return reconstructionDistrictForState(STATE_ABBR[stateName], date);
  }, [date]);

  const closeTooltip = useCallback(() => {
    pinnedTooltipRef.current = false;
    setTooltip(null);
  }, []);

  const placeTooltip = useCallback((clientX: number, clientY: number, mapFeature: MapFeature, pinned: boolean, labelOnly: string | null = null) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pointerX = clientX - rect.left;
    const pointerY = clientY - rect.top;
    const cardWidth = Math.min(220, rect.width - 16);
    const preferredHeight = Math.min(190, rect.height - 16);
    const x = pointerX + 12 + cardWidth <= rect.width - 8
      ? pointerX + 12
      : Math.max(8, pointerX - cardWidth - 12);
    const y = pointerY + 12 + preferredHeight <= rect.height - 8
      ? pointerY + 12
      : Math.max(8, pointerY - preferredHeight - 12);
    pinnedTooltipRef.current = pinned;
    setTooltip((current) => {
      const keepCurrentPosition = pinned && current?.feature === mapFeature && !current.labelOnly;
      const nextX = keepCurrentPosition ? current.x : x;
      const nextY = keepCurrentPosition ? current.y : y;
      return {
        x: nextX,
        y: nextY,
        maxHeight: Math.max(60, rect.height - nextY - 8),
        pinned,
        labelOnly,
        feature: mapFeature,
      };
    });
  }, []);

  const backgroundPathElements = useMemo(
    () => path ? activePolities.map((polity, index) => {
      const isState = polity.properties.TERR_TYPE === "State";
      const name = polity.properties.NAME ?? polity.properties.name ?? "Historical territory";
      const confederate = isState && isConfederateState(STATE_ABBR[name], date);
      const labelOnly = !isState ? name : confederate ? `${name} (seceded)` : null;
      return (
        <path
          key={`${polity.properties.NAME}-${polity.properties.START_N}-${index}`}
          d={pathForFeature(polity)}
          className={`${isState ? "historical-state" : "historical-territory"}${labelOnly ? " geography-hover" : ""}`}
          onMouseMove={labelOnly ? (event) => {
            if (dragRef.current || pinnedTooltipRef.current) return;
            placeTooltip(event.clientX, event.clientY, polity, false, labelOnly);
          } : undefined}
        />
      );
    }) : [],
    [activePolities, date, path, pathForFeature, placeTooltip],
  );

  const mapPathElements = useMemo(
    () => path ? visibleFeatures.map((mapFeature, index) => {
      const stateName = mapFeature.properties.NAME ?? mapFeature.properties.name ?? mapFeature.properties.statename ?? "state";
      const district = mapFeature.properties.district ?? 0;
      const featureKey = chamber === "rep" ? `house-${STATE_ABBR[stateName] ?? stateName}-${district}` : `${chamber}-${STATE_ABBR[stateName] ?? stateName}`;
      return (
        <path
          key={`${stateName}-${district ?? index}`}
          data-map-feature={featureKey}
          d={pathForFeature(mapFeature)}
          fill={fillFor(mapFeature)}
          onMouseMove={(event) => {
            if (dragRef.current || pinnedTooltipRef.current) return;
            placeTooltip(event.clientX, event.clientY, mapFeature, false);
          }}
          onClick={(event) => {
            if (didPanRef.current) return;
            event.stopPropagation();
            placeTooltip(event.clientX, event.clientY, mapFeature, true);
          }}
        />
      );
    }) : [],
    [chamber, fillFor, path, pathForFeature, placeTooltip, visibleFeatures],
  );

  const historicalStateOverlayPathElements = useMemo(
    () => path ? activeStates.flatMap((state) => {
      const name = state.properties.NAME ?? state.properties.name ?? "";
      const confederate = isConfederateFeature(state);
      const reconstructionDistrict = reconstructionDistrictForFeature(state);
      if (!confederate && !reconstructionDistrict) return [];
      const labelOnly = confederate
        ? `${name} (seceded)`
        : `${name} (${reconstructionDistrict?.label})`;
      return [(
        <path
          key={`historical-overlay-${name}`}
          d={pathForFeature(state)}
          className={confederate ? "confederate-state" : "reconstruction-state"}
          fill={confederate ? CONFEDERATE_COLOR : RECONSTRUCTION_COLOR}
          onMouseMove={(event) => {
            if (dragRef.current || pinnedTooltipRef.current) return;
            placeTooltip(event.clientX, event.clientY, state, false, labelOnly);
          }}
        />
      )];
    }) : [],
    [activeStates, isConfederateFeature, path, pathForFeature, placeTooltip, reconstructionDistrictForFeature],
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
    const nextK = clampZoom(current.k * factor);
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

  const mapPointForClient = useCallback((clientX: number, clientY: number) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: (clientX - rect.left) * 1000 / rect.width,
      y: (clientY - rect.top) * 620 / rect.height,
    };
  }, []);

  const beginDrag = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      pointerId,
      clientX,
      clientY,
      x: zoomRef.current.x,
      y: zoomRef.current.y,
      scaleX: 1000 / rect.width,
      scaleY: 620 / rect.height,
    };
  }, []);

  const beginPinch = useCallback(() => {
    const pointers = [...touchPointersRef.current.values()];
    if (pointers.length < 2) return;
    const [first, second] = pointers;
    const center = mapPointForClient((first.clientX + second.clientX) / 2, (first.clientY + second.clientY) / 2);
    if (!center) return;
    const current = zoomRef.current;
    pinchRef.current = {
      distance: Math.max(1, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)),
      worldX: (center.x - current.x) / current.k,
      worldY: (center.y - current.y) / current.k,
      k: current.k,
    };
    dragRef.current = null;
    didPanRef.current = true;
  }, [mapPointForClient]);

  const handleMapPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" && event.button !== 0) return;
    didPanRef.current = false;
    setIsPanning(false);
    if (event.pointerType === "touch") {
      touchPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
      if (touchPointersRef.current.size >= 2) beginPinch();
      else beginDrag(event.pointerId, event.clientX, event.clientY);
      return;
    }
    beginDrag(event.pointerId, event.clientX, event.clientY);
  }, [beginDrag, beginPinch]);

  const handleMapPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" && touchPointersRef.current.has(event.pointerId)) {
      touchPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
      if (touchPointersRef.current.size >= 2) {
        if (!pinchRef.current) beginPinch();
        const pinch = pinchRef.current;
        const pointers = [...touchPointersRef.current.values()];
        if (!pinch || pointers.length < 2) return;
        const [first, second] = pointers;
        const center = mapPointForClient((first.clientX + second.clientX) / 2, (first.clientY + second.clientY) / 2);
        if (!center) return;
        const distance = Math.max(1, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY));
        const nextK = clampZoom(pinch.k * distance / pinch.distance);
        applyZoom({ k: nextK, x: center.x - pinch.worldX * nextK, y: center.y - pinch.worldY * nextK });
        didPanRef.current = true;
        setIsPanning(true);
        event.preventDefault();
        return;
      }
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const moved = Math.abs(event.clientX - drag.clientX) + Math.abs(event.clientY - drag.clientY);
    if (moved <= 4) return;
    didPanRef.current = true;
    setIsPanning(true);
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
    applyZoom({
      ...zoomRef.current,
      x: drag.x + (event.clientX - drag.clientX) * drag.scaleX,
      y: drag.y + (event.clientY - drag.clientY) * drag.scaleY,
    });
    event.preventDefault();
  }, [applyZoom, beginPinch, mapPointForClient]);

  const handleMapPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      touchPointersRef.current.delete(event.pointerId);
      pinchRef.current = null;
      const remaining = [...touchPointersRef.current.entries()][0];
      if (remaining) beginDrag(remaining[0], remaining[1].clientX, remaining[1].clientY);
      else dragRef.current = null;
    } else if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setZoom(zoomRef.current);
    setIsPanning(false);
  }, [beginDrag]);

  const handleMapWheel = useCallback((event: globalThis.WheelEvent) => {
    if ((event.target as Element | null)?.closest(".tooltip")) return;
    if (!isLikelyMouseWheel(event)) return;
    const point = mapPointForClient(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    zoomBy(event.deltaY < 0 ? 1.25 : 1 / 1.25, point);
  }, [mapPointForClient, zoomBy]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.addEventListener("wheel", handleMapWheel, { passive: false });
    return () => map.removeEventListener("wheel", handleMapWheel);
  }, [handleMapWheel]);

  const handleMapKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") closeTooltip();
    else if (event.key === "+" || event.key === "=") zoomBy(1.5);
    else if (event.key === "-" || event.key === "_") zoomBy(1 / 1.5);
    else if (event.key === "0") resetZoom();
    else if (["ArrowUp", "ArrowDown"].includes(event.key) || (event.shiftKey && ["ArrowLeft", "ArrowRight"].includes(event.key))) {
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
  }, [applyZoom, closeTooltip, resetZoom, zoomBy]);

  const changeDate = useCallback((next: string) => {
    if (!isValidDateInRange(next, today)) return false;
    followsTodayRef.current = next === today;
    dateRef.current = next;
    setChamber((current) => next < FEDERAL_CONGRESS_START ? "congress" : current === "congress" ? "rep" : current);
    setDate(next);
    setDateDraft(next);
    return true;
  }, [today]);

  const maxDay = toDay(today);
  useEffect(() => { dateRef.current = date; }, [date]);
  useEffect(() => {
    const stopScrubbing = (event?: globalThis.KeyboardEvent) => {
      if (!event || heldArrowRef.current?.key === event.key) heldArrowRef.current = null;
    };
    const scrubDate = (event: globalThis.KeyboardEvent) => {
      if ((event.key !== "ArrowLeft" && event.key !== "ArrowRight") || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditableKeyboardTarget(event.target)) return;
      const key = event.key as "ArrowLeft" | "ArrowRight";
      const now = performance.now();
      if (!heldArrowRef.current || heldArrowRef.current.key !== key || !event.repeat) {
        heldArrowRef.current = { key, startedAt: now };
      }
      const heldFor = now - heldArrowRef.current.startedAt;
      const step = event.repeat ? scrubStepForDuration(heldFor) : 1;
      const direction = key === "ArrowLeft" ? -1 : 1;
      changeDate(fromDay(Math.max(0, Math.min(maxDay, toDay(dateRef.current) + direction * step))));
      event.preventDefault();
    };
    window.addEventListener("keydown", scrubDate);
    window.addEventListener("keyup", stopScrubbing);
    window.addEventListener("blur", stopScrubbing);
    return () => {
      window.removeEventListener("keydown", scrubDate);
      window.removeEventListener("keyup", stopScrubbing);
      window.removeEventListener("blur", stopScrubbing);
    };
  }, [changeDate, maxDay]);
  const timelineMarks = [...TIMELINE_MARKS, [today, "2026"]] as const;
  const isPreconstitutional = chamber === "congress";
  const governmentLabel = governmentTermLabel(date, congress);
  const presidingOfficer = isPreconstitutional ? presidentOfCongress(date) : null;
  const representedDelegations = new Set(activeMembers.map((member) => member.s)).size;
  const hasConfederateGeography = activeStates.some(isConfederateFeature);
  const activeReconstructionDistricts = [...new Set(activeStates
    .map((state) => reconstructionDistrictForFeature(state)?.number)
    .filter((number): number is number => Boolean(number)))]
    .sort((a, b) => a - b);
  const groups = ["Executive", "Cabinet", "Cabinet-level", "Supreme Court"];
  const chamberLeadership = chamber === "congress" ? [] : LEADERSHIP_OFFICES[chamber]
    .filter((office) => office.created <= date)
    .map((office) => ({
      ...office,
      official: resolvedActiveOfficials.find((candidate) => candidate.g === "Congressional leadership" && candidate.h === chamber && candidate.t === office.title) ?? null,
    }))
    .sort((a, b) => a.order - b.order);
  const tooltipHouseMembers = tooltip && chamber === "rep" && !tooltip.labelOnly
    ? memberForDistrict(tooltip.feature)
    : [];
  const tooltipStatewideAtLargeMembers = tooltip && chamber === "rep" && !tooltip.labelOnly
    ? statewideAtLargeMembersForDistrict(tooltip.feature)
    : [];
  const hasMixedDelegation = chamber === "rep" && visibleDistricts.some(
    (mapFeature) => statewideAtLargeMembersForDistrict(mapFeature).length > 0,
  );
  const tooltipDelegates = tooltip && isPreconstitutional && !tooltip.labelOnly
    ? delegatesForState(tooltip.feature)
    : [];

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#atlas" aria-label="American Atlas home">
          <span className="brand-mark" aria-hidden="true" />
          <span><strong>American Atlas</strong><small>A day-by-day look at US government</small></span>
        </a>
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
            <div className="term-card"><span>{governmentLabel}</span><strong>{activeMembers.length || "—"}</strong><small>{isPreconstitutional ? "delegates recorded this year" : chamber === "rep" ? "House seats filled" : "Senate seats filled"}</small></div>
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
              {isPreconstitutional ? (
                <button className="active" role="tab" aria-selected="true">State delegations</button>
              ) : (
                <>
                  <button className={chamber === "rep" ? "active" : ""} onClick={() => setChamber("rep")} role="tab">House districts</button>
                  <button className={chamber === "sen" ? "active" : ""} onClick={() => setChamber("sen")} role="tab">Senate</button>
                </>
              )}
            </div>
            {chamber === "rep" && !isPreconstitutional && (
              <button
                className={`detail-toggle ${highDetail ? "active" : ""}`}
                type="button"
                aria-pressed={highDetail}
                onClick={() => setHighDetail((enabled) => !enabled)}
              >{highDetail ? "High detail on" : "High detail"}</button>
            )}
            <p>{isPreconstitutional ? "Hover for delegates · click to pin · ←/→ scrub dates" : chamber === "rep" ? "Hover for members · click to pin · ←/→ scrub dates" : "Hover for senators · click to pin · ←/→ scrub dates"}</p>
          </div>

          <section className="control-board" aria-label={isPreconstitutional ? `${governmentLabel} state delegations` : `${chamber === "rep" ? "House" : "Senate"} party control`}>
            <div className="control-heading">
              <span>{isPreconstitutional ? "UNICAMERAL CONGRESS" : chamber === "rep" ? "HOUSE CONTROL" : "SENATE CONTROL"}</span>
              <strong>{isPreconstitutional ? "Each state delegation held one vote" : chamberSummary.controlLabel}</strong>
              <small>{isPreconstitutional ? `${activeMembers.length} delegates · ${representedDelegations} states in the annual roster` : `${activeMembers.length} of ${chamberSummary.seatTotal} seats filled${chamberSummary.vacancies ? ` · ${chamberSummary.vacancies} vacant` : ""}`}</small>
            </div>
            {!isPreconstitutional && <>
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
            </>}
            <div className="leadership-strip">
              <span className="leadership-label">{isPreconstitutional ? "PRESIDING OFFICER" : "LEADERSHIP"}</span>
              {isPreconstitutional ? (
                presidingOfficer
                  ? <div className="leadership-person"><small>President of Congress</small><strong><a href={presidingOfficer.w} target="_blank" rel="noreferrer">{presidingOfficer.n}</a></strong><span>{presidingOfficer.s}</span></div>
                  : <p>No elected president of Congress is recorded for this date.</p>
              ) : <>
                {chamberLeadership.map(({ title, official }) => (
                  <div className="leadership-person" key={title}>
                    <small>{title}</small>
                    {official ? <>
                      <strong><a href={wikipediaHref(official)} target="_blank" rel="noreferrer">{official.n}</a></strong>
                      {(official.p || official.s) && <span>{official.p && <i style={{ background: colorFor(official.p) }} />}{official.p}{official.p && official.s ? " – " : ""}{official.s}</span>}
                    </> : <strong className="leadership-vacant"><em>Vacant</em></strong>}
                  </div>
                ))}
                {!chamberLeadership.length && <p>No dated chamber leadership record for this date.</p>}
              </>}
            </div>
          </section>

          <div
            className={`map-frame ${isPanning ? "is-panning" : ""}`}
            ref={mapRef}
            role="region"
            tabIndex={0}
            aria-label="Interactive map. Click a state or district to pin its details. Drag to pan; use plus and minus to zoom; use left and right arrows to scrub dates; use shift plus left or right and the up or down arrows to pan; press zero to reset."
            onKeyDown={handleMapKeyDown}
            onMouseLeave={() => { if (!pinnedTooltipRef.current) setTooltip(null); }}
            onPointerDown={handleMapPointerDown}
            onPointerMove={handleMapPointerMove}
            onPointerUp={handleMapPointerEnd}
            onPointerCancel={handleMapPointerEnd}
          >
            {mapLoading && chamber === "rep" && <div className="map-loading"><span /> Loading {governmentLabel} boundaries</div>}
            <div className="zoom-controls" aria-label="Map zoom controls" onPointerDown={(event) => event.stopPropagation()}>
              <button onClick={() => zoomBy(1.5)} aria-label="Zoom in">+</button>
              <button onClick={() => zoomBy(1 / 1.5)} aria-label="Zoom out">−</button>
              <button onClick={resetZoom} aria-label="Reset map view">Reset</button>
            </div>
            <svg viewBox="0 0 1000 620" role="img" aria-label={`${isPreconstitutional ? "State delegation" : chamber === "rep" ? "House district" : "Senate"} map on ${longDate(date)}`}>
              <defs>
                {chamber === "sen" && activeStates.map((state) => {
                  const code = STATE_ABBR[state.properties.NAME ?? state.properties.name ?? ""];
                  const colors = senateSeatColors(state);
                  if (colors[0] === colors[1]) return null;
                  return <linearGradient id={`split-${code}`} key={code} x1="0" x2="1"><stop offset="50%" stopColor={colors[0]} /><stop offset="50%" stopColor={colors[1]} /></linearGradient>;
                })}
                {chamber === "rep" && visibleDistricts.map((mapFeature) => {
                  const statewideMembers = statewideAtLargeMembersForDistrict(mapFeature);
                  if (!statewideMembers.length) return null;
                  const width = Math.max(8, statewideMembers.length * 8);
                  return (
                    <pattern
                      id={mixedDistrictPatternId(mapFeature)}
                      key={mixedDistrictPatternId(mapFeature)}
                      width={width}
                      height="8"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(45)"
                    >
                      <rect width={width} height="8" fill={colorForMember(memberForDistrict(mapFeature)[0])} />
                      {statewideMembers.map((member, index) => (
                        <g key={`${member.id}-${index}`}>
                          <rect x={index * 8} width="4" height="8" fill={colorForMember(member)} />
                          <rect x={index * 8 + 4} width="1" height="8" fill="#f3efe6" opacity=".8" />
                        </g>
                      ))}
                    </pattern>
                  );
                })}
              </defs>
              <g ref={zoomLayerRef} transform={`translate(${zoom.x} ${zoom.y}) scale(${zoom.k})`}>
                <g className="polity-background">
                  {backgroundPathElements}
                </g>
                <g className="map-paths">
                  {mapPathElements}
                </g>
                <g className="historical-state-overlays">
                  {historicalStateOverlayPathElements}
                </g>
              </g>
            </svg>
            {tooltip && (
              <div
                className={`tooltip ${tooltip.pinned ? "is-pinned" : ""}${tooltip.labelOnly ? " is-geography" : ""}`}
                style={{ left: tooltip.x, top: tooltip.y, maxHeight: tooltip.maxHeight }}
                role={tooltip.pinned ? "dialog" : undefined}
                tabIndex={tooltip.pinned ? 0 : undefined}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onWheel={(event) => event.stopPropagation()}
              >
                {tooltip.labelOnly ? <em>{tooltip.labelOnly}</em> : tooltip.pinned && <button className="tooltip-close" type="button" onClick={closeTooltip} aria-label="Close member details">×</button>}
                {!tooltip.labelOnly && (isPreconstitutional ? (
                  <>
                    <strong>{tooltip.feature.properties.NAME ?? tooltip.feature.properties.name}</strong><span>{governmentLabel}</span>
                    <ul>{tooltipDelegates.map((member) => (
                      <li key={`${member.id}-${member.year}`}><i className="delegate-dot" /><a href={wikipediaHref(member)} target="_blank" rel="noreferrer">{member.n}</a><small>Delegate · recorded in {member.year}</small></li>
                    ))}</ul>
                    {!tooltipDelegates.length && <p>No delegate is listed for this state in the annual roster.</p>}
                  </>
                ) : chamber === "sen" ? (
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
                    {tooltipHouseMembers.map((member) => <div className="house-member" key={member.id}><i style={{ background: colorForMember(member) }} /><b><a href={wikipediaHref(member)} target="_blank" rel="noreferrer">{member.n}</a></b><small>{partyLabel(member)}</small></div>)}
                    {!tooltipHouseMembers.length && <p>Seat vacant or no member record on this date.</p>}
                    {tooltipStatewideAtLargeMembers.length > 0 && <span className="tooltip-subhead">Statewide at large</span>}
                    {tooltipStatewideAtLargeMembers.map((member) => <div className="house-member statewide-member" key={`statewide-${member.id}`}><i style={{ background: colorForMember(member) }} /><b><a href={wikipediaHref(member)} target="_blank" rel="noreferrer">{member.n}</a></b><small>{partyLabel(member)} · statewide seat</small></div>)}
                  </>
                ))}
              </div>
            )}
          </div>

          <div className="legend">
            <span className="legend-title">{isPreconstitutional ? "STATE DELEGATIONS" : "SEATS FILLED"}</span>
            {isPreconstitutional
              ? <span><i className="delegate-swatch" />Annual delegate roster<b>{representedDelegations}</b></span>
              : chamberSummary.segments.slice(0, 7).map((segment) => <span key={segment.label}><i style={{ background: segment.color }} />{segment.label}<b>{segment.count}</b></span>)}
            {hasConfederateGeography && <span><i className="confederate-swatch" />Seceded state</span>}
            {activeReconstructionDistricts.length > 0 && <span><i className="reconstruction-swatch" />Reconstruction military district</span>}
            {hasMixedDelegation && <span><i className="mixed-delegation-swatch" />Statewide at-large seat</span>}
            <span><i className="territory-swatch" />Territory / other U.S. area</span>
          </div>
        </div>

        <aside className="officials-rail">
          <div className="rail-heading"><p>GOVERNMENT ON</p><h2>{longDate(date)}</h2><span>{governmentLabel}</span></div>
          {isPreconstitutional ? (
            <details open>
              <summary><span>Congress</span><b>{presidingOfficer ? 1 : 0}</b></summary>
              <div className="official-list">
                <section className="official-office">
                  <h3>President of Congress</h3>
                  {presidingOfficer
                    ? <div className="official-holder"><span className="official-name"><strong><a href={presidingOfficer.w} target="_blank" rel="noreferrer">{presidingOfficer.n}</a></strong></span><small>{presidingOfficer.s}</small></div>
                    : <p className="empty">No elected president is recorded for this date.</p>}
                </section>
              </div>
            </details>
          ) : groups.map((group) => {
            const rows = resolvedActiveOfficials.filter((official) => official.g === group).sort((a, b) => a.o - b.o || a.a.localeCompare(b.a));
            if (!rows.length) return null;
            const offices = [...Map.groupBy(rows, (official) => official.t).entries()];
            const summaryCount = group === "Supreme Court" ? rows.length : offices.length;
            return (
              <details key={group} open={group !== "Cabinet" || rows.length < 10}>
                <summary><span>{group}</span><b>{summaryCount}</b></summary>
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
                </div>
              </details>
            );
          })}
          <p className="rail-note">{isPreconstitutional ? "Delegate service is shown at annual resolution because surviving rosters generally record participation by year, not a continuous daily tenure. Each state cast one vote under the Articles." : "Offices appear only after their creation. Vacancies and acting tenures are shown when they are present in the source record."}</p>
        </aside>
      </section>

      <footer id="sources">
        <p><strong>Sources:</strong> U.S. House History · UCLA Congressional District Boundaries · U.S. Census Bureau · Newberry Library · Congress Legislators · Wikidata</p>
        <small>Research interface · vacancies, acting service, caucus affiliation, and dated corrections are modeled explicitly.</small>
      </footer>
    </main>
  );
}
