import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as yaml from "js-yaml";

const root = process.cwd();
const output = path.join(root, "scripts/data/house-tenure-corrections.json");
const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "AmericanAtlasDataAudit/1.0 (https://congress.theojaffee.net)";
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";

const STATE_CODES = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO",
  Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA",
  Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN",
  Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR",
  Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA",
  "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC",
  "Puerto Rico": "PR", Guam: "GU", "American Samoa": "AS", "Northern Mariana Islands": "MP",
  "Virgin Islands": "VI",
};

function ordinalCongress(congress) {
  const lastTwo = congress % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13
    ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" }[congress % 10] ?? "th");
  return `${congress}${suffix} United States Congress`;
}

function congressStart(congress) {
  return `${1787 + congress * 2}-${congress <= 73 ? "03-04" : "01-03"}`;
}

function congressEnd(congress) {
  return congressStart(congress + 1);
}

function nextDay(date) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function normalizedName(value = "") {
  return value
    .replaceAll("_", " ")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\bla guardia\b/g, "laguardia")
    .replace(/\bde witt\b/g, "dewitt");
}

function nameTokens(value) {
  return normalizedName(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !["jr", "sr", "ii", "iii", "iv"].includes(token));
}

function fullName(person) {
  const name = person.name;
  return [name.first, name.middle, name.nickname, name.last, name.suffix].filter(Boolean).join(" ");
}

function sourceTermEnd(date) {
  return date.endsWith("-03-03") ? nextDay(date) : date;
}

async function sourceMembers() {
  const people = [];
  for (const file of ["work/legislators-historical.yaml", "work/legislators-current.yaml"]) {
    people.push(...yaml.load(await readFile(path.join(root, file), "utf8")));
  }
  return people.flatMap((person) => person.terms
    .filter((term) => term.type === "rep")
    .map((term) => ({
      id: person.id.bioguide,
      name: fullName(person),
      wikipedia: person.id.wikipedia ?? "",
      state: term.state,
      district: term.district,
      start: term.start,
      end: sourceTermEnd(term.end),
      partySwitches: new Set((term.party_affiliations ?? []).slice(1).map((affiliation) => affiliation.start)),
    })));
}

async function fetchCongressPages() {
  const pages = [];
  for (let first = 1; first <= 119; first += 20) {
    const titles = [];
    for (let congress = first; congress < Math.min(first + 20, 120); congress += 1) {
      titles.push(ordinalCongress(congress));
    }
    const url = new URL(WIKIPEDIA_API);
    url.search = new URLSearchParams({
      action: "query",
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      formatversion: "2",
      format: "json",
      titles: titles.join("|"),
    });
    let response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    }
    if (!response.ok) throw new Error(`Wikipedia request failed: ${response.status}`);
    const body = await response.json();
    for (const page of body.query.pages) {
      pages.push({
        congress: Number(page.title.match(/^\d+/)?.[0]),
        text: page.revisions?.[0]?.slots?.main?.content ?? "",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return pages.sort((left, right) => left.congress - right.congress);
}

function changesSection(wikitext) {
  return wikitext.match(/==\s*Changes (?:in|of) membership\s*==([\s\S]*?)(?=\n==[^=]|$)/i)?.[1] ?? "";
}

function houseChanges(wikitext) {
  const changes = changesSection(wikitext);
  const headed = changes.match(
    /===\s*House(?: of Representatives)?(?: membership)?(?: changes)?\s*===([\s\S]*?)(?=\n===?[^=]|$)/i,
  )?.[1];
  if (headed) return headed;
  const marker = changes.search(/\{\{Ordinal US Congress change\|House\}\}/i);
  return marker >= 0 ? changes.slice(marker) : "";
}

function houseRoster(wikitext) {
  const members = wikitext.match(/==\s*Members\s*==([\s\S]*?)(?=\n==[^=]|$)/i)?.[1] ?? "";
  return members.match(
    /===\s*House of Representatives\s*===([\s\S]*?)(?=\n===?[^=]|$)/i,
  )?.[1] ?? "";
}

function changeRows(section) {
  return section
    .split(/\n\|-.*\n/)
    .map((row) => row.trim())
    .filter((row) => /^[|!][\s\S]{0,160}\{\{[Uu]shr\|/.test(row));
}

function rowCells(row) {
  return row.split(/\n(?=[|!]\s)/).map((cell) => cell.trim()).filter((cell) => /^[|!]/.test(cell));
}

function seatFromCell(cell = "") {
  const match = cell.match(/\{\{[Uu]shr\|([^|}]+)\|([^|}]+)/);
  if (!match) return null;
  const state = STATE_CODES[match[1].trim()] ?? match[1].trim();
  const district = /^(?:AL|at.large)$/i.test(match[2].trim()) ? 0 : Number(match[2]);
  return state && Number.isFinite(district) ? { state, district } : null;
}

function personTitle(cell = "") {
  const sortName = cell.match(/\{\{[Ss]ortname\|([^|}]+)\|([^|}]+)([\s\S]*?)\}\}/);
  if (sortName) {
    const disambiguation = sortName[3].match(/\|dab=([^|}]+)/)?.[1];
    return `${sortName[1]} ${sortName[2]}${disambiguation ? ` (${disambiguation})` : ""}`;
  }
  return [...cell.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)].map((match) => match[1])[0] ?? null;
}

function exactDate(cell = "") {
  const match = cell.match(new RegExp(`\\b(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?,\\s+(\\d{4})\\b`));
  if (!match) return null;
  const value = new Date(`${match[1]} ${match[2]}, ${match[3]} 00:00:00 UTC`);
  return Number.isNaN(Number(value)) ? null : value.toISOString().slice(0, 10);
}

function exactDateAfter(cell, marker) {
  const index = cell.search(marker);
  return index >= 0 ? exactDate(cell.slice(index)) : null;
}

function memberForSeat(terms, title, congress, state, district) {
  if (!title || /^vacant$/i.test(title)) return null;
  const stateCandidates = terms.filter((term) =>
    term.state === state
    && term.start < congressEnd(congress)
    && term.end > congressStart(congress)
  );
  const districtCandidates = stateCandidates.filter((term) =>
    term.district === district || (district === 0 && term.district === 1)
  );
  const normalizedTitle = normalizedName(title);
  for (const candidates of [districtCandidates, stateCandidates]) {
    const exact = candidates.filter((term) => normalizedName(term.wikipedia) === normalizedTitle);
    if (exact.length === 1) return exact[0];
  }
  const titleTokens = nameTokens(title);
  for (const candidates of [districtCandidates, stateCandidates]) {
    const fuzzy = candidates.filter((term) => {
      const tokens = new Set([...nameTokens(term.name), ...nameTokens(term.wikipedia)]);
      return titleTokens.every((token) => tokens.has(token));
    });
    if (fuzzy.length === 1) return fuzzy[0];
    const first = titleTokens[0];
    const last = titleTokens.at(-1);
    const byEnds = candidates.filter((term) => {
      const tokens = nameTokens(term.name);
      return tokens.at(-1) === last
        && (tokens[0] === first || (tokens[0]?.slice(0, 3) === first?.slice(0, 3)));
    });
    if (byEnds.length === 1) return byEnds[0];
  }
  return null;
}

const terms = await sourceMembers();
const pages = await fetchCongressPages();
const corrections = new Map();
const correctionsByMemberCongress = new Map();
const unmatched = [];

function ensureCorrection(member, congress, seat) {
  const key = `${member.id}:${congress}:${seat.state}:${seat.district}`;
  const correction = corrections.get(key) ?? {
    id: member.id,
    congress,
    state: seat.state,
    district: seat.district === 0 && [-1, 1].includes(member.district) ? member.district : seat.district,
    boundaries: [],
  };
  corrections.set(key, correction);
  const groupKey = `${member.id}:${congress}`;
  const group = correctionsByMemberCongress.get(groupKey) ?? [];
  if (!group.includes(correction)) group.push(correction);
  correctionsByMemberCongress.set(groupKey, group);
  return correction;
}

function addBoundary(member, congress, type, date, seat) {
  // A date outside the Congress (usually a typo in the source table) cannot
  // bound a seat in it.
  if ((type === "start" && date >= congressEnd(congress)) || (type === "end" && date <= congressStart(congress))) return;
  if (type === "start" && date < congressStart(congress)) date = congressStart(congress);
  if (type === "end" && date > congressEnd(congress)) date = congressEnd(congress);
  const candidates = correctionsByMemberCongress.get(`${member.id}:${congress}`) ?? [];
  const correction = candidates.find((candidate) =>
    candidate.state === seat.state && candidate.district === seat.district
  ) ?? (candidates.length === 1 ? candidates[0] : ensureCorrection(member, congress, seat));
  if (!correction.boundaries.some((boundary) => boundary.type === type && boundary.date === date)) {
    correction.boundaries.push({ type, date });
  }
}

for (const { congress, text } of pages) {
  let rosterSeat = null;
  const pendingRosterEnds = new Map();
  for (const originalLine of houseRoster(text).split("\n")) {
    const line = originalLine
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
      .replace(/<ref[^>]*\/>/gi, "");
    const lineSeat = seatFromCell(line);
    if (lineSeat) rosterSeat = lineSeat;
    if (!rosterSeat || !/^:{1,4}\s*/.test(line)) continue;
    const title = personTitle(line);
    const member = memberForSeat(terms, title, congress, rosterSeat.state, rosterSeat.district);
    if (!member) continue;
    ensureCorrection(member, congress, rosterSeat);

    // Roster lines also annotate party switches ("(I) from July 4, 2019");
    // those dates are not changes in who holds the seat.
    const switchedParty = (date) => member.partySwitches.has(date);
    const listedStart = exactDateAfter(line, /\bfrom\b/i);
    const listedEnd = exactDateAfter(line, /\buntil\b/i);
    const start = listedStart && !switchedParty(listedStart) ? listedStart : null;
    const endDate = listedEnd && !switchedParty(listedEnd) && !switchedParty(nextDay(listedEnd)) ? listedEnd : null;
    const seatKey = `${rosterSeat.state}:${rosterSeat.district}`;
    if (start) {
      addBoundary(member, congress, "start", start, rosterSeat);
      const pendingEnd = pendingRosterEnds.get(seatKey);
      if (pendingEnd?.date === start) {
        addBoundary(pendingEnd.member, congress, "end", start, rosterSeat);
      }
    }
    if (endDate) {
      addBoundary(member, congress, "end", nextDay(endDate), rosterSeat);
      pendingRosterEnds.set(seatKey, { member, date: endDate });
    }

    if (!start && !endDate && /\s[–—-]\s/.test(line)) {
      const dates = [...line.matchAll(new RegExp(`\\b(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?,\\s+(\\d{4})\\b`, "g"))]
        .map((match) => exactDate(match[0]))
        .filter(Boolean);
      if (dates.length >= 2) {
        addBoundary(member, congress, "start", dates[0], rosterSeat);
        addBoundary(member, congress, "end", nextDay(dates[1]), rosterSeat);
      }
    }
  }

  for (const row of changeRows(houseChanges(text))) {
    if (/changed part(?:y|ies)|party switch/i.test(row)) continue;
    const cells = rowCells(row);
    const seat = seatFromCell(cells[0]);
    if (!seat || cells.length < 3) continue;
    const predecessorTitle = personTitle(cells[1]);
    const successorTitle = personTitle(cells[3]);
    const exitDate = exactDate(cells[2]);
    const entryDate = exactDate(cells[4]);
    const predecessor = memberForSeat(terms, predecessorTitle, congress, seat.state, seat.district);
    const successor = memberForSeat(terms, successorTitle, congress, seat.state, seat.district);

    if (predecessorTitle && !predecessor && !/^vacant$/i.test(predecessorTitle)) {
      unmatched.push({ congress, seat: `${seat.state}-${seat.district}`, role: "predecessor", title: predecessorTitle });
    }
    if (successorTitle && !successor && !/^vacant$/i.test(successorTitle)) {
      unmatched.push({ congress, seat: `${seat.state}-${seat.district}`, role: "successor", title: successorTitle });
    }
    if (predecessor?.id === successor?.id) continue;
    if (predecessor && exitDate) {
      const end = entryDate && entryDate <= nextDay(exitDate) ? entryDate : nextDay(exitDate);
      addBoundary(predecessor, congress, "end", end, seat);
    }
    if (successor && entryDate) addBoundary(successor, congress, "start", entryDate, seat);
  }
}

const MANUAL_CORRECTIONS = [
  // The official House biographies give only the month for these three
  // resignations. Use the first independently dated day out of office (or the
  // first day after the stated month) so the intervening vacancy is preserved.
  { id: "W000239", congress: 39, state: "MD", district: 2, boundaries: [{ type: "end", date: "1865-07-27" }] },
  { id: "S000544", congress: 39, state: "KY", district: 6, boundaries: [{ type: "end", date: "1866-07-13" }] },
  { id: "M000347", congress: 40, state: "MO", district: 5, boundaries: [{ type: "end", date: "1868-08-01" }] },
  // Clift presented credentials but was not permitted to qualify in the 41st;
  // Wilson resigned on March 3 before the 66th began.
  { id: "C000519", congress: 41, state: "GA", district: 1, boundaries: [], suppress: true },
  { id: "W000593", congress: 66, state: "TX", district: 12, boundaries: [], suppress: true },
  // Lineberger was elected February 15 to the incoming 67th Congress, whose
  // constitutional term did not begin until March 4.
  { id: "L000331", congress: 67, state: "CA", district: 9, boundaries: [{ type: "start", date: "1921-03-04" }] },
];

for (const correction of MANUAL_CORRECTIONS) {
  corrections.set(
    `${correction.id}:${correction.congress}:${correction.state}:${correction.district}`,
    correction,
  );
}

const records = [...corrections.values()].map((correction) => {
  const boundaries = correction.boundaries.sort((left, right) =>
    left.date.localeCompare(right.date) || (left.type === "end" ? -1 : 1)
  );
  const intervals = [];
  if (!boundaries.length && !correction.suppress) {
    intervals.push({ start: congressStart(correction.congress), end: congressEnd(correction.congress) });
  }
  let activeStart = boundaries[0]?.type === "end" ? congressStart(correction.congress) : null;
  for (const boundary of boundaries) {
    if (boundary.type === "start") {
      if (!activeStart) activeStart = boundary.date;
    } else if (activeStart && activeStart < boundary.date) {
      intervals.push({ start: activeStart, end: boundary.date });
      activeStart = null;
    }
  }
  if (activeStart) intervals.push({ start: activeStart, end: congressEnd(correction.congress) });
  return {
    id: correction.id,
    congress: correction.congress,
    state: correction.state,
    district: correction.district,
    intervals,
  };
}).sort((left, right) =>
  left.congress - right.congress || left.state.localeCompare(right.state) || left.district - right.district || left.id.localeCompare(right.id)
);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(records)}\n`);
console.log(`Wrote ${records.length.toLocaleString()} exact House tenure corrections`);
console.log(`${unmatched.length.toLocaleString()} annotated roster names could not be matched automatically`);
const modernUnmatched = unmatched.filter((record) => record.congress >= 28);
if (modernUnmatched.length) {
  console.log(`${modernUnmatched.length.toLocaleString()} unmatched names are in the single-member-district era`);
  console.log(modernUnmatched.map((record) => `${record.congress}: ${record.seat} ${record.role} ${record.title}`).join("\n"));
}
