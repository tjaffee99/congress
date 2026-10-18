"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature, merge } from "topojson-client";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import { isConfederateState } from "./confederate-state.mjs";
import { houseBoundaryBelongsToPlan, houseDelegationRows, houseMembersForDistrict, houseStatewideAtLargeMembers, houseStatesNeedingAtLargeFallback } from "./house-members.mjs";
import { reconstructionDistrictForState } from "./reconstruction-district.mjs";
import { isEditableKeyboardTarget, scrubStepForDuration } from "./date-scrub.mjs";
import { clampZoom, wheelZoomFactor } from "./map-input.mjs";
import { FRAME_HEIGHT, FRAME_WIDTH, fitMapFrame } from "./map-frame.mjs";
import { newerPageChunk } from "./deploy-check.mjs";
import { CONFEDERATION_CONGRESS_START, FEDERAL_CONGRESS_START, PRECONSTITUTIONAL_STATE_NAMES, preconstitutionalCongressLabel, presidentOfCongress, vermontPolityForDate } from "./preconstitutional.mjs";
import { officialOfficesForDate } from "./cabinet-offices.mjs";

type Chamber = "sen" | "rep" | "congress";
type Member = { id: string; n: string; t: Chamber; s: string; d: number | null; k?: number | null; p: string; q?: Record<string, string>; c: string | null; w: string | null; a: string; z: string; body?: string; year?: number };
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
type TooltipState = { x: number; y: number; maxHeight: number; pinned: boolean; labelOnly: string | null; scope: "feature" | "delegation"; feature: MapFeature };
type PointerPosition = { clientX: number; clientY: number };
type PinchState = { distance: number; worldX: number; worldY: number; k: number };
type OfficialGroup = "Executive" | "Cabinet" | "Supreme Court";
type SheetState = "peek" | "half" | "full";
// The SVG viewBox from fitMapFrame, plus the window insets (in pixels) that
// the floating panel, timeline and zoom controls cover.
type MapFrame = { x: number; y: number; w: number; h: number; s: number; left: number; top: number; right: number; bottom: number };

const DEFAULT_FRAME: MapFrame = { x: 0, y: 0, w: FRAME_WIDTH, h: FRAME_HEIGHT, s: 1, left: 0, top: 0, right: 0, bottom: 0 };
const PHONE_WIDTH = 860;
// Revalidate data files on every load so a browser never pairs a new deploy
// with a cached roster from the previous one.
const DATA_FETCH: RequestInit = { cache: "no-cache" };

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

const OFFICIAL_GROUPS = ["Executive", "Cabinet", "Supreme Court"] as const;

const PARTY_COLORS: Record<string, string> = {
  Republican: "#c8463b", Democrat: "#3a6ea8", Independent: "#887c70", Federalist: "#b28a43",
  "Democratic-Republican": "#5e806f", Whig: "#b58a64", "Anti-Administration": "#789382",
  "Pro-Administration": "#b17449", Jacksonian: "#53778a", "Anti-Jacksonian": "#a77c63",
  "Adams-Clay Republican": "#729381", "Crawford Republican": "#5e806f", "Jackson Republican": "#496f5e",
  "Adams-Clay Federalist": "#c09c5d", "Crawford Federalist": "#ad874a", "Jackson Federalist": "#96743e",
  "Anti-Masonic": "#756b8c", Nullifier: "#826c55",
  Unionist: "#7d6d59", "Conservative Republican": "#9b574c", Populist: "#807548",
  Progressive: "#59847a", "Free Soil": "#6c8454", "American Labor": "#7b5e72", Unknown: "#aaa398",
  American: "#9a7042", "Anti-Lecompton Democrat": "#557f9d", Coalitionist: "#86659b",
  Conservative: "#806641", "Constitutional Unionist": "#6f7752", "Farmer-Labor": "#9a762f",
  "Free Silver": "#7695ae", "Independent Democrat": "#6d96b3", "Independent Republican": "#cc827b",
  "Independent Whig": "#c09972", "Law and Order": "#8f6047", Liberal: "#8e5ea4",
  "Liberal Republican": "#c16f68", Libertarian: "#b49728", Liberty: "#725b9f",
  "National Greenbacker": "#4d8a61", "New Progressive": "#3f8f86", Nonpartisan: "#a17e43",
  Opposition: "#8d654f", "Popular Democrat": "#5682a3", "Progressive Republican": "#c4635d",
  Prohibitionist: "#6c79a0", Readjuster: "#86669a", "Readjuster Democrat": "#697d9f",
  Silver: "#789eb8", "Silver Republican": "#ad6d77", Socialist: "#a64657",
  "States Rights": "#9b6247", "Unconditional Unionist": "#667c57", Union: "#738348",
  "Union Labor": "#a06f31",
};
const PARTY_SEGMENT_ORDER: Record<string, number> = {
  "Anti-Administration": 10,
  "Pro-Administration": 40,
  "Democratic-Republican": 10,
  "Adams-Clay Republican": 11,
  "Crawford Republican": 12,
  "Jackson Republican": 13,
  Federalist: 40,
  "Adams-Clay Federalist": 41,
  "Crawford Federalist": 42,
  "Jackson Federalist": 43,
  Jacksonian: 10,
  "Anti-Jacksonian": 40,
  Whig: 40,
};
const CAUCUS_COLORS: Record<string, string> = { Democrat: "#94b3d6", Republican: "#e29d96" };
const VACANT_COLOR = "#c3beb5";
const CONFEDERATE_COLOR = "#454846";
const RECONSTRUCTION_COLOR = "#6f7471";

function colorFor(party?: string) {
  if (!party) return "#d6d0c5";
  if (PARTY_COLORS[party]) return PARTY_COLORS[party];
  const fallbackPalette = ["#5d849f", "#9a6a45", "#6f8751", "#8a6096", "#b07868", "#4f8b82"];
  const hash = [...party].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
  return fallbackPalette[hash % fallbackPalette.length];
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

function controlParty(member: Member) {
  if (member.c) return member.c;
  if (["Adams-Clay Republican", "Crawford Republican", "Jackson Republican"].includes(member.p)) return "Democratic-Republican";
  if (["Adams-Clay Federalist", "Crawford Federalist", "Jackson Federalist"].includes(member.p)) return "Federalist";
  return member.p;
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

function congressOrdinal(congress: number) {
  const suffix = congress % 100 >= 11 && congress % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[congress % 10] ?? "th";
  return `${congress}${suffix}`;
}

function termLabel(congress: number) {
  return `${congressOrdinal(congress)} Congress`;
}

function governmentTermLabel(date: string, congress: number) {
  return date < FEDERAL_CONGRESS_START ? preconstitutionalCongressLabel(date) : termLabel(congress);
}

const ICON_PATHS = {
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  reset: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  prev: "M14.5 6l-6 6 6 6",
  next: "M9.5 6l6 6-6 6",
  chevron: "M6 9l6 6 6-6",
  close: "M6 6l12 12M18 6L6 18",
  sidebar: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4v16",
} as const;

function Icon({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

// The chamber card already names its chamber: "House majority leader" reads
// as "Majority leader" there.
function leaderTitle(title: string) {
  return title.replace(/^(?:House|Senate) (m)/, (_, initial: string) => initial.toUpperCase());
}

function governmentTermWikipediaHref(date: string, congress: number) {
  if (date < CONFEDERATION_CONGRESS_START) return "https://en.wikipedia.org/wiki/Second_Continental_Congress";
  if (date < FEDERAL_CONGRESS_START) return "https://en.wikipedia.org/wiki/Congress_of_the_Confederation";
  return `https://en.wikipedia.org/wiki/${congressOrdinal(congress)}_United_States_Congress`;
}

export default function Home() {
  const [today, setToday] = useState(currentUsDate);
  const [date, setDate] = useState(currentUsDate);
  const [dateDraft, setDateDraft] = useState(currentUsDate);
  const [chamber, setChamber] = useState<Chamber>("rep");
  const [openOfficialGroups, setOpenOfficialGroups] = useState<Record<OfficialGroup, boolean>>({
    Executive: true,
    Cabinet: false,
    "Supreme Court": true,
  });
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
  const [frame, setFrame] = useState<MapFrame>(DEFAULT_FRAME);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [sheet, setSheet] = useState<SheetState>("half");
  const [isPhone, setIsPhone] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const chamberRef = useRef<HTMLElement>(null);
  const timelineRef = useRef<HTMLElement>(null);
  const frameRef = useRef<MapFrame>(DEFAULT_FRAME);
  const sheetDragRef = useRef<{ pointerId: number; startY: number; startHeight: number; moved: boolean } | null>(null);
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
    fetch("/data/members.json", DATA_FETCH).then((response) => response.json()).then((memberData: Member[]) => setFederalMembers(memberData));
    fetch("/data/officials.json", DATA_FETCH).then((response) => response.json()).then((officialData: Official[]) => setOfficials(officialData));
    fetch("/data/historical-polities.json", DATA_FETCH).then((response) => response.json()).then((topology: Topology) => {
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
    fetch("/data/preconstitutional.json", DATA_FETCH)
      .then((response) => response.json())
      .then((memberData: Member[]) => setPreconstitutionalMembers(memberData))
      .finally(() => { preconstitutionalRequestRef.current = false; });
  }, [date, preconstitutionalMembers.length]);

  useEffect(() => {
    if (chamber !== "rep") return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setMapLoading(true); });
    const detailDirectory = highDetail ? "districts-high" : "districts";
    fetch(`/data/${detailDirectory}/${String(congress).padStart(3, "0")}.json`, DATA_FETCH)
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

  const updateFrame = useCallback(() => {
    const map = mapRef.current;
    if (!map || sheetDragRef.current?.moved) return;
    const rect = map.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const panel = panelRef.current?.getBoundingClientRect();
    const timeline = timelineRef.current?.getBoundingClientRect();
    const chamberRect = chamberRef.current?.getBoundingClientRect();
    const panelShown = Boolean(panel?.width && panel.height);
    const phone = rect.width <= PHONE_WIDTH;
    setIsPhone(phone);
    let left = 16;
    let top = 16;
    let right = 16;
    let bottom = 16;
    if (phone) {
      left = 8;
      right = 8;
      if (timeline) top = timeline.bottom - rect.top + 8;
      if (panel && panelShown) bottom = rect.bottom - panel.top + 8;
    } else {
      right = 72;
      if (panel && panelShown) left = panel.right - rect.left + 24;
      if (chamberRect?.height) top = chamberRect.bottom - rect.top + 16;
      if (timeline) bottom = rect.bottom - timeline.top + 16;
    }
    const next: MapFrame = {
      ...fitMapFrame({ width: rect.width, height: rect.height, left, top, right, bottom }),
      left,
      top,
      right,
      bottom,
    };
    frameRef.current = next;
    setFrame((current) => (Object.keys(next) as (keyof MapFrame)[]).every((key) => Math.abs(current[key] - next[key]) < 0.01) ? current : next);
  }, []);

  useEffect(() => {
    updateFrame();
    const observer = new ResizeObserver(updateFrame);
    for (const element of [mapRef.current, panelRef.current, timelineRef.current, chamberRef.current]) {
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [isPhone, panelCollapsed, updateFrame]);

  useEffect(() => {
    const loaded = [
      ...performance.getEntriesByType("resource").map((entry) => entry.name),
      ...[...document.querySelectorAll<HTMLLinkElement>("link[rel=modulepreload]")].map((link) => link.href),
    ];
    fetch(window.location.pathname, { cache: "no-cache" })
      .then((response) => response.ok ? response.text() : "")
      .then((html) => {
        const latest = newerPageChunk(loaded, html);
        if (!latest) return;
        // Reload at most once per newer build in case the cache keeps lying.
        const key = `american-atlas-reloaded:${latest}`;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
        window.location.reload();
      })
      .catch(() => {});
  }, []);

  // On phones the panel is a bottom sheet with three resting heights. These
  // mirror the [data-sheet] heights in globals.css.
  const suppressGripClickRef = useRef(false);
  const sheetSnapHeights = useCallback((): Record<SheetState, number> => ({
    peek: 164,
    half: Math.round(window.innerHeight * 0.5),
    full: Math.round(window.innerHeight - frameRef.current.top),
  }), []);

  const handleGripPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const panel = panelRef.current;
    if (!panel) return;
    sheetDragRef.current = { pointerId: event.pointerId, startY: event.clientY, startHeight: panel.getBoundingClientRect().height, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handleGripPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = sheetDragRef.current;
    const panel = panelRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !panel) return;
    const delta = drag.startY - event.clientY;
    if (!drag.moved && Math.abs(delta) < 4) return;
    drag.moved = true;
    panel.classList.add("dragging");
    panel.style.height = `${Math.max(96, Math.min(sheetSnapHeights().full, drag.startHeight + delta))}px`;
  }, [sheetSnapHeights]);

  const handleGripPointerEnd = useCallback(() => {
    const drag = sheetDragRef.current;
    const panel = panelRef.current;
    sheetDragRef.current = null;
    if (!drag?.moved || !panel) return;
    suppressGripClickRef.current = true;
    const height = panel.getBoundingClientRect().height;
    const [nearest] = (Object.entries(sheetSnapHeights()) as [SheetState, number][])
      .sort((a, b) => Math.abs(a[1] - height) - Math.abs(b[1] - height))[0];
    panel.classList.remove("dragging");
    panel.style.height = "";
    setSheet(nearest);
    requestAnimationFrame(updateFrame);
  }, [sheetSnapHeights, updateFrame]);

  const cycleSheet = useCallback(() => {
    if (suppressGripClickRef.current) {
      suppressGripClickRef.current = false;
      return;
    }
    setSheet((current) => current === "peek" ? "half" : current === "half" ? "full" : "peek");
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
        const party = member.q?.[String(term)] ?? member.p;
        bucket.push(party === member.p ? member : { ...member, p: party });
        index.set(term, bucket);
      }
    }
    return { house, senate };
  }, [federalMembers]);
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
  const activeStateCodes = useMemo(
    () => new Set(activeStates
      .map((state) => STATE_ABBR[state.properties.NAME ?? state.properties.name ?? ""])
      .filter((state): state is string => Boolean(state))),
    [activeStates],
  );
  const activeHouseMembers = useMemo(
    () => (membersByCongress.house.get(congress) ?? []).filter((member) => activeStateCodes.has(member.s) && !isConfederateState(member.s, date) && !reconstructionDistrictForState(member.s, date) && member.a <= date && member.z > date),
    [activeStateCodes, congress, date, membersByCongress],
  );
  const activeMembers = useMemo(() => {
    if (chamber === "rep") return activeHouseMembers;
    if (chamber === "congress") {
      return preconstitutionalMembers.filter((member) => member.a <= date && member.z > date);
    }
    const candidates = (membersByCongress.senate.get(congress) ?? []).filter((member) => activeStateCodes.has(member.s) && !isConfederateState(member.s, date) && !reconstructionDistrictForState(member.s, date) && member.a <= date && member.z > date);
    const bySeat = new Map<string, Member>();
    for (const member of candidates) {
      const key = `${member.s}:${member.k ?? member.id}`;
      const incumbent = bySeat.get(key);
      if (!incumbent || member.z > incumbent.z || (member.z === incumbent.z && member.a > incumbent.a)) bySeat.set(key, member);
    }
    return [...bySeat.values()].sort((a, b) => a.s.localeCompare(b.s) || (a.k ?? 0) - (b.k ?? 0));
  }, [activeHouseMembers, activeStateCodes, chamber, congress, date, membersByCongress, preconstitutionalMembers]);
  const activeOfficials = useMemo(
    () => officials.filter((official) => official.a <= date && (!official.z || official.z > date)),
    [officials, date],
  );
  const resolvedActiveOfficials = useMemo(() => {
    const byOffice = Map.groupBy(activeOfficials, (official) => official.t);
    return [...byOffice.entries()].flatMap(([title, rows]) => {
      const unique = [...new Map(rows.map((row) => [`${row.id}-${row.a}`, row])).values()];
      if (title === "Associate Justice" || title === "Counselor to the President") return unique;
      return unique.sort((a, b) => b.a.localeCompare(a.a)).slice(0, 1);
    });
  }, [activeOfficials]);
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
  const houseSeatCapacityByState = useMemo(() => {
    if (congress < 1) return new Map<string, number>();
    const [congressStart, congressEnd] = congressDates(congress);
    const termsByState = Map.groupBy(
      members.filter((member) => member.t === "rep" && STATE_CODES.has(member.s) && member.a < congressEnd && member.z > congressStart),
      (member) => member.s,
    );
    return new Map([...termsByState].map(([state, terms]) => {
      const observed = Math.max(0, ...[congressStart, ...terms.map((term) => term.a)]
        .map((point) => terms.filter((term) => term.a <= point && term.z > point).length));
      return [state, observed];
    }));
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
      const governingParty = controlParty(member);
      controlCounts.set(governingParty, (controlCounts.get(governingParty) ?? 0) + 1);
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
      const order = (label: string) => PARTY_SEGMENT_ORDER[label]
        ?? (label.startsWith("Democrat") ? 0
          : label.startsWith("Independent · Democratic") ? 1
            : label.startsWith("Independent · Republican") ? 39
              : label.startsWith("Independent") ? 20
                : label.startsWith("Republican") ? 40
                  : 30);
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
      if (!state || !activeStateCodes.has(state)) return false;
      const hasNumberedDistricts = numberedStates.has(stateName) && activeNumberedStates.has(state);
      if (district > 0 && !hasNumberedDistricts) return false;
      if (!houseBoundaryBelongsToPlan(activeHouseMembers, state, district, hasNumberedDistricts)) return false;
      return district !== 0 || !houseStatewideAtLargeMembers(activeHouseMembers, state, hasNumberedDistricts).length;
    });
  }, [activeHouseMembers, activeStateCodes, districts]);
  const atLargeFallbackDistricts = useMemo(() => {
    const statesWithBoundary = new Set(
      districts
        .map((mapFeature) => STATE_ABBR[mapFeature.properties.statename ?? ""])
        .filter((state): state is string => Boolean(state)),
    );
    const fallbackStates = houseStatesNeedingAtLargeFallback(activeHouseMembers, statesWithBoundary);
    return activeStates.flatMap((state) => {
      const stateName = state.properties.NAME ?? state.properties.name;
      if (!stateName || !fallbackStates.has(STATE_ABBR[stateName])) return [];
      return [{ ...state, properties: { ...state.properties, statename: stateName, district: 0 } }];
    });
  }, [activeHouseMembers, activeStates, districts]);
  const houseMapFeatures = useMemo(
    () => [...visibleDistricts, ...atLargeFallbackDistricts],
    [atLargeFallbackDistricts, visibleDistricts],
  );
  const visibleFeatures = chamber === "rep" ? houseMapFeatures : activeStates;
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

  const placeTooltip = useCallback((clientX: number, clientY: number, mapFeature: MapFeature, pinned: boolean, labelOnly: string | null = null, scope: "feature" | "delegation" = "feature") => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pointerX = clientX - rect.left;
    const pointerY = clientY - rect.top;
    const phone = rect.width <= PHONE_WIDTH;
    // Keep cards beside the floating panel and above the timeline.
    const minX = phone ? 8 : Math.max(8, frameRef.current.left - 16);
    const minY = phone ? 8 : Math.max(8, frameRef.current.top - 12);
    const maxY = rect.height - (phone ? 8 : Math.max(8, frameRef.current.bottom - 8));
    const cardWidth = Math.min(scope === "delegation" ? 300 : 240, rect.width - 16);
    const preferredHeight = Math.min(scope === "delegation" ? 380 : 200, maxY - 8);
    const x = pointerX + 14 + cardWidth <= rect.width - 8
      ? pointerX + 14
      : Math.max(minX, pointerX - cardWidth - 14);
    const y = pointerY + 14 + preferredHeight <= maxY
      ? pointerY + 14
      : Math.max(minY, pointerY - preferredHeight - 14);
    pinnedTooltipRef.current = pinned;
    setTooltip((current) => {
      const keepCurrentPosition = pinned && current?.feature === mapFeature && current.scope === scope && !current.labelOnly;
      const nextX = keepCurrentPosition ? current.x : x;
      const nextY = keepCurrentPosition ? current.y : y;
      return {
        x: nextX,
        y: nextY,
        maxHeight: Math.max(60, maxY - nextY),
        pinned,
        labelOnly,
        scope,
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
          onDoubleClick={chamber === "rep" ? (event) => {
            if (didPanRef.current) return;
            event.preventDefault();
            event.stopPropagation();
            placeTooltip(event.clientX, event.clientY, mapFeature, true, null, "delegation");
          } : undefined}
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

  const zoomCommitTimerRef = useRef<number | null>(null);
  // Continuous gestures (wheel, trackpad pinch) move the map every event but
  // only commit the zoom to React state once they pause.
  const zoomBy = useCallback((factor: number, point = { x: 500, y: 310 }, continuous = false) => {
    const current = zoomRef.current;
    const nextK = clampZoom(current.k * factor);
    const ratio = nextK / current.k;
    const next = { k: nextK, x: point.x - (point.x - current.x) * ratio, y: point.y - (point.y - current.y) * ratio };
    applyZoom(next);
    if (zoomCommitTimerRef.current !== null) window.clearTimeout(zoomCommitTimerRef.current);
    zoomCommitTimerRef.current = null;
    if (!continuous) {
      setZoom(next);
      return;
    }
    zoomCommitTimerRef.current = window.setTimeout(() => {
      zoomCommitTimerRef.current = null;
      setZoom(zoomRef.current);
    }, 150);
  }, [applyZoom]);

  const resetZoom = useCallback(() => {
    const reset = { x: 0, y: 0, k: 1 };
    applyZoom(reset);
    setZoom(reset);
  }, [applyZoom]);

  const mapPointForClient = useCallback((clientX: number, clientY: number) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const current = frameRef.current;
    return {
      x: current.x + (clientX - rect.left) / current.s,
      y: current.y + (clientY - rect.top) / current.s,
    };
  }, []);

  const beginDrag = useCallback((pointerId: number, clientX: number, clientY: number) => {
    if (!mapRef.current) return;
    dragRef.current = {
      pointerId,
      clientX,
      clientY,
      x: zoomRef.current.x,
      y: zoomRef.current.y,
      scaleX: 1 / frameRef.current.s,
      scaleY: 1 / frameRef.current.s,
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

  // Pinching anywhere on the atlas zooms the map, never the page: around the
  // fingers over the map, or around the middle of the map over the panels.
  // Plain scrolling zooms over the map and scrolls the panels elsewhere.
  const pinchPoint = useCallback((event: { clientX: number; clientY: number; target: EventTarget | null }) => (
    mapRef.current?.contains(event.target as Node)
      ? mapPointForClient(event.clientX, event.clientY)
      : { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 }
  ), [mapPointForClient]);

  const handleMapWheel = useCallback((event: globalThis.WheelEvent) => {
    const target = event.target as Element | null;
    const overMap = Boolean(target && mapRef.current?.contains(target));
    if (!event.ctrlKey && (!overMap || target?.closest(".tooltip"))) return;
    const point = pinchPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    zoomBy(wheelZoomFactor(event), point, true);
  }, [pinchPoint, zoomBy]);

  useEffect(() => {
    // Safari reports trackpad pinches as gesture events rather than ctrl+wheel.
    type GestureEvent = Event & { scale: number; clientX: number; clientY: number };
    let gestureScale = 1;
    const startGesture = (event: Event) => {
      event.preventDefault();
      gestureScale = (event as GestureEvent).scale || 1;
    };
    const changeGesture = (event: Event) => {
      event.preventDefault();
      const gesture = event as GestureEvent;
      // iOS also sends these for touch pinches, which the pointer handlers zoom.
      if (touchPointersRef.current.size < 2 && gesture.scale) {
        const point = pinchPoint(gesture);
        if (point) zoomBy(gesture.scale / gestureScale, point, true);
      }
      gestureScale = gesture.scale || gestureScale;
    };
    const endGesture = (event: Event) => event.preventDefault();
    window.addEventListener("wheel", handleMapWheel, { passive: false });
    window.addEventListener("gesturestart", startGesture);
    window.addEventListener("gesturechange", changeGesture);
    window.addEventListener("gestureend", endGesture);
    return () => {
      window.removeEventListener("wheel", handleMapWheel);
      window.removeEventListener("gesturestart", startGesture);
      window.removeEventListener("gesturechange", changeGesture);
      window.removeEventListener("gestureend", endGesture);
    };
  }, [handleMapWheel, pinchPoint, zoomBy]);

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
  const timelineMarks = [...TIMELINE_MARKS, [today, today.slice(0, 4)]] as const;
  const isPreconstitutional = chamber === "congress";
  const governmentLabel = governmentTermLabel(date, congress);
  const hasFederalSeatData = federalMembers.length > 0
    && (chamber === "rep" ? chamberSummary.seatTotal > 0 : activeStates.length > 0);
  const termSeatCount = isPreconstitutional
    ? (preconstitutionalMembers.length > 0 ? String(activeMembers.length) : "—")
    : (hasFederalSeatData ? `${activeMembers.length}/${chamberSummary.seatTotal}` : "—");
  const presidingOfficer = isPreconstitutional ? presidentOfCongress(date) : null;
  const representedDelegations = new Set(activeMembers.map((member) => member.s)).size;
  const hasConfederateGeography = activeStates.some(isConfederateFeature);
  const hasTerritories = activePolities.length > activeStates.length;
  const activeReconstructionDistricts = [...new Set(activeStates
    .map((state) => reconstructionDistrictForFeature(state)?.number)
    .filter((number): number is number => Boolean(number)))]
    .sort((a, b) => a - b);
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
  const tooltipHouseDelegation = useMemo(() => {
    if (!tooltip || chamber !== "rep" || tooltip.scope !== "delegation" || tooltip.labelOnly) return [];
    const stateName = tooltip.feature.properties.statename ?? "";
    const state = STATE_ABBR[stateName];
    const districtNumbers = houseMapFeatures
      .filter((mapFeature) => mapFeature.properties.statename === stateName)
      .map((mapFeature) => mapFeature.properties.district ?? 0);
    return houseDelegationRows(activeHouseMembers, state, districtNumbers, houseSeatCapacityByState.get(state) ?? 0);
  }, [activeHouseMembers, chamber, houseMapFeatures, houseSeatCapacityByState, tooltip]);
  const tooltipHouseDelegationFilled = tooltipHouseDelegation.filter((seat) => seat.member).length;
  const hasMixedDelegation = chamber === "rep" && visibleDistricts.some(
    (mapFeature) => statewideAtLargeMembersForDistrict(mapFeature).length > 0,
  );
  const tooltipDelegates = tooltip && isPreconstitutional && !tooltip.labelOnly
    ? delegatesForState(tooltip.feature)
    : [];

  const chamberName = chamber === "rep" ? "House" : "Senate";
  const atlasStyle = {
    "--free-left": `${frame.left}px`,
    "--free-top": `${frame.top}px`,
    "--free-right": `${frame.right}px`,
    "--free-bottom": `${frame.bottom}px`,
  } as CSSProperties;
  const timelineProgress = { "--progress": `${(toDay(date) / Math.max(1, maxDay)) * 100}%` } as CSSProperties;

  const chamberCard = (
    <section
      className={`chamber-card${isPhone ? " in-panel" : ""}`}
      ref={isPhone ? undefined : chamberRef}
      aria-label={isPreconstitutional ? `${governmentLabel} state delegations` : `${chamberName} party control`}
    >
      <div className="chamber-head">
        <div className="seg" role="tablist" aria-label="Chamber">
          {isPreconstitutional ? (
            <button type="button" role="tab" aria-selected="true">State delegations</button>
          ) : (
            <>
              <button type="button" role="tab" aria-selected={chamber === "rep"} onClick={() => setChamber("rep")}>House districts</button>
              <button type="button" role="tab" aria-selected={chamber === "sen"} onClick={() => setChamber("sen")}>Senate</button>
            </>
          )}
        </div>
        <strong className="control-label">{isPreconstitutional ? "Each state delegation held one vote" : chamberSummary.controlLabel}</strong>
        <div className="stats">
          {isPreconstitutional ? (
            <>
              <div><b className="term-seat-count">{termSeatCount}</b><span>delegates this year</span></div>
              <div><b>{representedDelegations}</b><span>of 13 states</span></div>
            </>
          ) : (
            <>
              <div><b className="term-seat-count">{hasFederalSeatData ? <><span>{activeMembers.length}</span><span>/{chamberSummary.seatTotal}</span></> : termSeatCount}</b><span>seats filled</span></div>
              <div><b>{hasFederalSeatData ? chamberSummary.majority : "—"}</b><span>for a majority</span></div>
              <div><b>{hasFederalSeatData ? chamberSummary.vacancies : "—"}</b><span>vacant</span></div>
            </>
          )}
        </div>
      </div>
      {!isPreconstitutional && (
        <div className="control-meter" aria-label={`Majority threshold: ${chamberSummary.majority} seats`}>
          <div className="control-meter-bar">
            {chamberSummary.segments.map((segment) => (
              <i
                key={segment.label}
                style={{ width: `${(segment.count / Math.max(1, chamberSummary.seatTotal)) * 100}%`, background: segment.color }}
                title={`${segment.label}: ${segment.count}`}
              />
            ))}
          </div>
          <span className="majority-marker" style={{ left: `${(chamberSummary.majority / Math.max(1, chamberSummary.seatTotal)) * 100}%` }} />
        </div>
      )}
      <div className="key-row">
        <ul className="control-key">
          {isPreconstitutional
            ? <li><i className="delegate-swatch" />Annual delegate roster<b>{representedDelegations}</b></li>
            : chamberSummary.segments.map((segment) => <li key={segment.label}><i style={{ background: segment.color }} />{segment.label}<b>{segment.count}</b></li>)}
          {hasConfederateGeography && <li><i className="swatch confederate-swatch" />Seceded state</li>}
          {activeReconstructionDistricts.length > 0 && <li><i className="swatch reconstruction-swatch" />Reconstruction military district</li>}
          {hasMixedDelegation && <li><i className="swatch mixed-delegation-swatch" />Statewide at-large seat</li>}
          {hasTerritories && <li><i className="swatch territory-swatch" />Territory or other U.S. area</li>}
        </ul>
        {chamber === "rep" && (
          <button className="switch" type="button" role="switch" aria-checked={highDetail} onClick={() => setHighDetail((enabled) => !enabled)}>
            <span>High detail</span><i aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="leadership" role="group" aria-label={isPreconstitutional ? "Presiding officer" : `${chamberName} leadership`}>
        <div className="sec">{isPreconstitutional ? "Presiding officer" : `${chamberName} leadership`}</div>
        <div className="leaders">
          {isPreconstitutional ? (
            presidingOfficer
              ? (
                <div className="leader">
                  <small className="leader-title">President of Congress</small>
                  <strong className="leader-name"><a href={presidingOfficer.w} target="_blank" rel="noreferrer">{presidingOfficer.n}</a></strong>
                  <span className="leader-party">{presidingOfficer.s}</span>
                </div>
              )
              : <p className="empty">No elected president of Congress is recorded for this date.</p>
          ) : (
            <>
              {chamberLeadership.map(({ title, official }) => (
                <div className="leader leadership-person" key={title}>
                  <small className="leader-title">{leaderTitle(title)}</small>
                  {official?.p && <i className="official-party-dot" style={{ background: colorFor(official.p) }} />}
                  {official
                    ? <strong className="leader-name"><a href={wikipediaHref(official)} target="_blank" rel="noreferrer">{official.n}</a></strong>
                    : <strong className="leader-name leadership-vacant"><em>Vacant</em></strong>}
                  {official && (official.p || official.s) && <span className="leader-party">{official.p}{official.p && official.s ? " – " : ""}{official.s}</span>}
                </div>
              ))}
              {!chamberLeadership.length && <p className="empty">No dated chamber leadership record for this date.</p>}
            </>
          )}
        </div>
      </div>
    </section>
  );

  return (
    <main className={`atlas${panelCollapsed ? " panel-collapsed" : ""}${tooltip?.pinned ? " has-pinned-card" : ""}`} style={atlasStyle}>
      <div
        className={`map-frame ${isPanning ? "is-panning" : ""}`}
        ref={mapRef}
        role="region"
        tabIndex={0}
        aria-label="Interactive map. Click a state or district to pin its details. In the House view, double-click a district to open its entire state delegation. Drag to pan; use plus and minus to zoom; use left and right arrows to scrub dates; use shift plus left or right and the up or down arrows to pan; press zero to reset."
        onKeyDown={handleMapKeyDown}
        onMouseMove={(event) => {
          if (pinnedTooltipRef.current || dragRef.current) return;
          if (!(event.target as Element).closest(".map-paths path, .historical-state-overlays path, .geography-hover")) setTooltip(null);
        }}
        onMouseLeave={() => { if (!pinnedTooltipRef.current) setTooltip(null); }}
        onPointerDown={handleMapPointerDown}
        onPointerMove={handleMapPointerMove}
        onPointerUp={handleMapPointerEnd}
        onPointerCancel={handleMapPointerEnd}
      >
        <svg viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`} role="img" aria-label={`${isPreconstitutional ? "State delegation" : chamber === "rep" ? "House district" : "Senate"} map on ${longDate(date)}`}>
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
                      <rect className="pattern-gap" x={index * 8 + 4} width="1" height="8" />
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
            className={`tooltip ${tooltip.pinned ? "is-pinned" : ""}${tooltip.labelOnly ? " is-geography" : ""}${tooltip.scope === "delegation" ? " is-delegation" : ""}`}
            style={{ left: tooltip.x, top: tooltip.y, maxHeight: tooltip.maxHeight }}
            role={tooltip.pinned ? "dialog" : undefined}
            tabIndex={tooltip.pinned ? 0 : undefined}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
          >
            {tooltip.labelOnly ? <em>{tooltip.labelOnly}</em> : tooltip.pinned && <button className="tooltip-close" type="button" onClick={closeTooltip} aria-label="Close member details"><Icon name="close" /></button>}
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
              tooltip.scope === "delegation" ? (
                <>
                  <strong>{tooltip.feature.properties.statename}</strong>
                  <span>U.S. House delegation · {tooltipHouseDelegationFilled}/{tooltipHouseDelegation.length} seats filled</span>
                  {tooltipHouseDelegation.map((seat, index) => seat.member
                    ? <div className="house-member delegation-member" key={`${seat.member.id}-${seat.label}`}><i style={{ background: colorForMember(seat.member) }} /><b><a href={wikipediaHref(seat.member)} target="_blank" rel="noreferrer">{seat.member.n}</a></b><small>{seat.label} · {partyLabel(seat.member)}</small></div>
                    : <div className="house-member delegation-member vacant-delegation-seat" key={`vacant-${seat.label}-${index}`}><i /><b><em>Vacant</em></b><small>{seat.label}</small></div>)}
                  {!tooltipHouseDelegation.length && <p>No seated representatives are listed for this state on this date.</p>}
                </>
              ) : (
                <>
                  <strong>{tooltip.feature.properties.statename}{(tooltip.feature.properties.district ?? 0) > 0 ? ` · District ${tooltip.feature.properties.district}` : " · At large"}</strong>
                  <span>U.S. House</span>
                  {tooltipHouseMembers.map((member) => <div className="house-member" key={member.id}><i style={{ background: colorForMember(member) }} /><b><a href={wikipediaHref(member)} target="_blank" rel="noreferrer">{member.n}</a></b><small>{partyLabel(member)}</small></div>)}
                  {!tooltipHouseMembers.length && <p>Seat vacant or no member record on this date.</p>}
                  {tooltipStatewideAtLargeMembers.length > 0 && <span className="tooltip-subhead">Statewide at large</span>}
                  {tooltipStatewideAtLargeMembers.map((member) => <div className="house-member statewide-member" key={`statewide-${member.id}`}><i style={{ background: colorForMember(member) }} /><b><a href={wikipediaHref(member)} target="_blank" rel="noreferrer">{member.n}</a></b><small>{partyLabel(member)} · statewide seat</small></div>)}
                  {chamber === "rep" && tooltip.pinned && tooltip.scope === "feature" && <button className="tooltip-action" type="button" onClick={(event) => placeTooltip(event.clientX, event.clientY, tooltip.feature, true, null, "delegation")}>Show {tooltip.feature.properties.statename} delegation</button>}
                </>
              )
            ))}
          </div>
        )}
      </div>

      {mapLoading && chamber === "rep" && <div className="map-loading" role="status"><span aria-hidden="true" />Loading {governmentLabel} boundaries</div>}

      <div className="zoom-controls" role="group" aria-label="Map zoom controls">
        <button type="button" onClick={() => zoomBy(1.5)} aria-label="Zoom in"><Icon name="plus" /></button>
        <button type="button" onClick={() => zoomBy(1 / 1.5)} aria-label="Zoom out"><Icon name="minus" /></button>
        <button type="button" onClick={resetZoom} aria-label="Reset map view"><Icon name="reset" /></button>
      </div>

      {panelCollapsed && (
        <button className="reopen" type="button" onClick={() => setPanelCollapsed(false)}>
          <Icon name="sidebar" />American Atlas
        </button>
      )}

      {!isPhone && chamberCard}

      <aside id="panel" ref={panelRef} data-sheet={sheet} hidden={panelCollapsed} aria-label={`Government on ${longDate(date)}`}>
        <button
          className="grip"
          type="button"
          aria-label="Resize panel"
          onClick={cycleSheet}
          onPointerDown={handleGripPointerDown}
          onPointerMove={handleGripPointerMove}
          onPointerUp={handleGripPointerEnd}
          onPointerCancel={handleGripPointerEnd}
        />
        <div className="panel-head">
          <div className="title-row">
            <h1>American Atlas</h1>
            <button className="pbtn collapse-panel" type="button" onClick={() => setPanelCollapsed(true)} aria-label="Hide panel"><Icon name="sidebar" /></button>
          </div>
          <p className="lede">The U.S. government on any day since July 4, 1776.</p>
        </div>

        <div className="panel-body">
          {isPhone && chamberCard}

          {!isPreconstitutional && OFFICIAL_GROUPS.map((group) => {
            const officeDefinitions = group === "Supreme Court" ? null : officialOfficesForDate(group, date);
            const visibleTitles = officeDefinitions ? new Set(officeDefinitions.map((office) => office.title)) : null;
            const rows = resolvedActiveOfficials
              .filter((official) => (official.g === group || (group === "Cabinet" && official.g === "Cabinet-level")) && (!visibleTitles || visibleTitles.has(official.t)))
              .sort((a, b) => a.o - b.o || a.a.localeCompare(b.a));
            const offices = group === "Supreme Court"
              ? [...Map.groupBy(rows, (official) => official.t).entries()]
              : officeDefinitions?.map((office) => [office.title, rows.filter((official) => official.t === office.title)] as const) ?? [];
            if (!offices.length) return null;
            return (
              <details
                className="official-group"
                key={group}
                open={openOfficialGroups[group]}
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open;
                  setOpenOfficialGroups((current) => current[group] === isOpen ? current : { ...current, [group]: isOpen });
                }}
              >
                <summary><span>{group}</span><b>{rows.length}</b><Icon name="chevron" /></summary>
                <div className="official-list">
                  {offices.flatMap(([title, holders]) => holders.length ? holders.map((official) => (
                    <div className="official-holder" key={`${official.id}-${official.a}`}>
                      {official.p && <i className="official-party-dot" style={{ background: colorFor(official.p) }} />}
                      <span className="official-name">
                        <strong>{official.x
                          ? <><em><a href={wikipediaHref(official)} target="_blank" rel="noreferrer">{official.n}</a></em> <span className="acting-label">(acting)</span></>
                          : <a href={wikipediaHref(official)} target="_blank" rel="noreferrer">{official.n}</a>}</strong>
                        <small>{title}</small>
                      </span>
                      {official.p && <span className="official-party">{official.p}</span>}
                    </div>
                  )) : [(
                    <div className="official-holder" key={title}>
                      <span className="official-name">
                        <strong className="official-vacant"><em>Vacant</em></strong>
                        <small>{title}</small>
                      </span>
                    </div>
                  )])}
                </div>
              </details>
            );
          })}
          {isPreconstitutional && <p className="empty panel-note">The executive branch and Supreme Court begin under the Constitution in 1789. Until then the Continental Congress and the Congress of the Confederation governed.</p>}

          <p className="rail-note">{isPreconstitutional ? "Delegate service is shown at annual resolution because surviving rosters generally record participation by year, not a continuous daily tenure. Each state cast one vote under the Articles." : "Created offices remain visible while vacant. Additional offices appear only during periods when they held Cabinet rank."}</p>
          <p className="rail-note hint">{isPreconstitutional ? "Hover for delegates · click to pin · ←/→ scrub dates" : chamber === "rep" ? "Hover for members · click to pin · double-click for state delegation · ←/→ scrub dates" : "Hover for senators · click to pin · ←/→ scrub dates"}</p>

          <footer id="sources">
            <p>Sources: U.S. House History · UCLA Congressional District Boundaries · U.S. Census Bureau · Newberry Library · Congress Legislators · Voteview · Wikidata</p>
            <p>Vacancies, acting service, caucus affiliation and dated corrections are modeled explicitly. · <a href="https://x.com/theojaffee" target="_blank" rel="noreferrer">Made by Theo Jaffee</a></p>
          </footer>
        </div>
      </aside>

      <section className="timeline" ref={timelineRef} aria-label="Date in view">
        <div className="date-block">
          <button className="step-button" type="button" onClick={() => changeDate(fromDay(Math.max(0, toDay(date) - 1)))} aria-label="Previous day"><Icon name="prev" /></button>
          <div className="date-readout">
            <label>
              <span className="visually-hidden">Date in view</span>
              <span className="date-display" aria-hidden="true">{longDate(date)}</span>
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
                onClick={(event) => {
                  try { event.currentTarget.showPicker(); } catch { /* the picker is optional */ }
                }}
              />
            </label>
            <a className="congress-link" href={governmentTermWikipediaHref(date, congress)} target="_blank" rel="noreferrer">{governmentLabel}</a>
          </div>
          <button className="step-button" type="button" onClick={() => changeDate(fromDay(Math.min(maxDay, toDay(date) + 1)))} aria-label="Next day"><Icon name="next" /></button>
        </div>
        <div className="slider-wrap">
          <input aria-label="Historical date" type="range" min={0} max={maxDay} value={toDay(date)} style={timelineProgress} onChange={(event) => changeDate(fromDay(Number(event.target.value)))} />
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
        <button className="today-button" type="button" disabled={date === today} onClick={() => changeDate(today)}>Today</button>
      </section>
    </main>
  );
}
