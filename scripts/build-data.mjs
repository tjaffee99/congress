import { execFile } from "node:child_process";
import { access, mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import * as yaml from "js-yaml";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const boundaryDir = path.join(root, "work/congressional-district-boundaries/GeoJson");
const districtOut = path.join(root, "public/data/districts");
const highDetailDistrictOut = path.join(root, "public/data/districts-high");
const dataOut = path.join(root, "public/data");
const VOTEVIEW_MEMBERS_URL = "https://voteview.com/static/data/out/members/HSall_members.csv";
const VOTEVIEW_PARTIES_URL = "https://voteview.com/static/data/out/parties/HSall_parties.csv";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers, ...values] = rows;
  return values.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function normalizedPartyName(party, start = null, congress = null) {
  let normalized = {
    AL: "Popular Democrat",
    "Democrat-Republican": "Democratic-Republican",
    "Democratic Republican": "Democratic-Republican",
    "Democrat Republican": "Democratic-Republican",
    "Pro-administration": "Pro-Administration",
    "Anti-administration": "Anti-Administration",
    "Anti Mason": "Anti-Masonic",
    "Anti Masonic": "Anti-Masonic",
    Adams: "Anti-Jacksonian",
    Jackson: "Jacksonian",
    "Anti-Jackson": "Anti-Jacksonian",
    "Anti Jacksonian": "Anti-Jacksonian",
    "Jacksonian Republican": "Jackson Republican",
    "Ind. Democrat": "Independent Democrat",
    "Ind. Republican": "Independent Republican",
    "Ind. Whig": "Independent Whig",
  }[party] ?? party ?? "Unknown";
  // The source roster occasionally applies the modern label retroactively.
  // Before the Republican Party's 1854 founding, a bare "Republican" means
  // the earlier Democratic-Republican affiliation, not the modern party.
  if (normalized === "Republican" && start && start < "1854-01-01") normalized = "Democratic-Republican";
  if (congress >= 19 && normalized === "Jackson Republican") return "Jacksonian";
  if (congress >= 19 && normalized === "Crawford Republican") return "Anti-Jacksonian";
  if (congress >= 19 && congress <= 24 && ["Democrat", "Union Democrat", "Democratic-Republican"].includes(normalized)) return "Jacksonian";
  return normalized;
}

function congressForDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  if (date >= "1935-01-03") {
    const start = year % 2 === 1 && (month > 1 || (month === 1 && day >= 3)) ? year : year - (year % 2 === 0 ? 1 : 2);
    return Math.max(1, (start - 1787) / 2);
  }
  const start = year % 2 === 1 && (month > 3 || (month === 3 && day >= 4)) ? year : year - (year % 2 === 0 ? 1 : 2);
  return Math.max(1, Math.min(73, (start - 1787) / 2));
}

function previousDay(date) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

async function voteviewPartyAffiliations() {
  const responses = await Promise.all([fetch(VOTEVIEW_MEMBERS_URL), fetch(VOTEVIEW_PARTIES_URL)]);
  if (responses.some((response) => !response.ok)) {
    throw new Error(`Voteview download failed: ${responses.map((response) => response.status).join(", ")}`);
  }
  const [memberRows, partyRows] = await Promise.all(responses.map(async (response) => parseCsv(await response.text())));
  const partyNames = new Map(partyRows.map((row) => [
    `${row.congress}|${row.chamber}|${row.party_code}`,
    normalizedPartyName(row.party_name, null, Number(row.congress)),
  ]));
  const affiliations = new Map();
  for (const row of memberRows) {
    if (!row.bioguide_id || (row.chamber !== "House" && row.chamber !== "Senate")) continue;
    const party = partyNames.get(`${row.congress}|${row.chamber}|${row.party_code}`);
    if (!party) continue;
    const chamber = row.chamber === "House" ? "rep" : "sen";
    const key = `${row.bioguide_id}|${row.congress}|${chamber}`;
    const parties = affiliations.get(key) ?? new Set();
    parties.add(party);
    affiliations.set(key, parties);
  }
  return affiliations;
}

function fullName(person) {
  const n = person.name;
  return [n.first, n.middle, n.nickname ? `“${n.nickname}”` : null, n.last, n.suffix]
    .filter(Boolean)
    .join(" ");
}

function wikipediaUrl(person) {
  return person.id.wikipedia
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(person.id.wikipedia).replaceAll("%20", "_")}`
    : null;
}

const TERM_OVERRIDES = new Map([
  ["S000242:1791-10-24:1793-03-03", { start: "1791-03-04", end: "1792-12-07" }],
  ["H000629:1791-10-24:1793-03-03", { start: "1793-01-30", end: "1793-03-04" }],
  ["P000362:1791-10-24:1793-03-03", { start: "1791-03-04", end: "1791-10-29" }],
  ["M000645:1791-10-24:1793-03-03", { start: "1791-10-29", end: "1793-03-04" }],
  ["W000216:1791-10-24:1792-03-21", { start: "1791-03-04", end: "1792-03-22" }],
  ["P000469:1839-12-02:1841-03-03", { start: "1839-03-04", end: "1839-10-29" }],
  ["M000389:1839-12-02:1841-03-03", { start: "1839-11-20", end: "1841-03-04" }],
  ["R000360:1823-12-01:1825-03-03", { start: "1823-03-04", end: "1823-04-21", party: "Crawford Republican" }],
  ["M000079:1831-12-05:1833-03-03", { start: "1831-03-04", end: "1831-04-15", party: "Anti-Jackson" }],
  ["C000482:1825-12-05:1827-03-03", { party: "Anti-Jacksonian" }],
  ["F000374:1850-01-01:1851-03-03", { start: "1850-09-09" }],
  ["G000540:1850-09-10:1855-03-03", { start: "1850-09-09" }],
  // The House Clerk's vacancy list dates these 119th Congress departures one
  // day differently from the upstream roster.
  ["T000489:2025-01-03:2025-03-04", { end: "2025-03-05" }],
  ["G000590:2025-01-03:2025-07-21", { end: "2025-07-20" }],
  ["L000578:2025-01-03:2026-01-05", { end: "2026-01-06" }],
  ["S001157:2025-01-03:2026-04-21", { end: "2026-04-22" }],
]);

// The upstream unitedstates/congress-legislators roster incorrectly gives
// Florida senator Abijah Gilbert a second, fictional House term from
// California. California's actual first House delegation was Edward Gilbert
// and George Washington Wright, seated after statehood in September 1850.
const INVALID_TERMS = new Set([
  "G000171:rep:CA:1849-12-03:1851-03-03",
]);

// Appointed senators are recorded upstream as leaving on the date of the
// special election for their seat, but they keep serving until a successor
// is sworn in. Until the roster records that successor, keep the appointee
// seated through the end of the Congress rather than showing a vacancy.
function provisionalAppointmentEnd(term, isCurrent) {
  if (!isCurrent || term.type !== "sen" || term.how !== "appointment" || /-01-0[345]$/.test(term.end)) return null;
  const year = Number(term.end.slice(0, 4));
  return `${year % 2 === 1 ? year + 2 : year + 1}-01-03`;
}

// A term's party_affiliations record mid-term party switches (Jeffords in
// 2001, Specter in 2009, Kiley in 2026, and so on). Each affiliation runs
// until the next one begins; the first and last extend to the term's edges.
function affiliationSpans(term, firstCongress) {
  if (!term.party_affiliations?.length) return null;
  return term.party_affiliations.map((affiliation, index, all) => ({
    a: index === 0 ? "0000-01-01" : affiliation.start,
    z: all[index + 1]?.start ?? "9999-12-31",
    p: normalizedPartyName(affiliation.party, affiliation.start, index === 0 ? firstCongress : congressForDate(affiliation.start)),
    c: affiliation.caucus ?? null,
  }));
}

function splitByAffiliation(compactTerm, spans) {
  if (!spans) return [compactTerm];
  return spans.flatMap((span) => {
    const a = span.a > compactTerm.a ? span.a : compactTerm.a;
    const z = span.z < compactTerm.z ? span.z : compactTerm.z;
    if (a >= z) return [];
    return [{ ...compactTerm, a, z, p: span.p, c: span.c, q: null }];
  });
}

function historicalCongressStart(end) {
  const match = end.match(/^(\d{4})-03-03$/);
  if (!match) return null;
  const startYear = Number(match[1]) - 2;
  return `${startYear}-03-04`;
}

function nextDay(date) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

async function buildMembers() {
  const files = ["work/legislators-historical.yaml", "work/legislators-current.yaml"];
  const people = [];
  const currentIds = new Set();
  for (const file of files) {
    const source = yaml.load(await readFile(path.join(root, file), "utf8"));
    if (file.endsWith("current.yaml")) source.forEach((person) => currentIds.add(person.id.bioguide));
    people.push(...source);
  }

  const voteviewParties = await voteviewPartyAffiliations();
  const houseCorrections = JSON.parse(
    await readFile(path.join(root, "scripts/data/house-tenure-corrections.json"), "utf8"),
  );
  const houseCorrectionsByTerm = Map.groupBy(
    houseCorrections,
    (correction) => `${correction.id}:${correction.congress}`,
  );
  const terms = people.flatMap((person) =>
    person.terms.flatMap((term) => {
      if (INVALID_TERMS.has(`${person.id.bioguide}:${term.type}:${term.state}:${term.start}:${term.end}`)) return [];
      const override = TERM_OVERRIDES.get(`${person.id.bioguide}:${term.start}:${term.end}`);
      const firstCongress = congressForDate(override?.start ?? term.start);
      const lastCongress = congressForDate(previousDay(override?.end ?? (term.end.endsWith("-03-03") ? nextDay(term.end) : term.end)));
      const sourceParty = (override?.party || term.party)
        ? normalizedPartyName(override?.party ?? term.party, term.start, firstCongress)
        : (term.district === -1 ? "Nonpartisan" : "Unknown");
      const partiesByCongress = {};
      for (let congress = firstCongress; congress <= lastCongress; congress += 1) {
        const candidates = voteviewParties.get(`${person.id.bioguide}|${congress}|${term.type}`);
        if (!candidates?.size) continue;
        if (candidates.size === 1) {
          partiesByCongress[congress] = [...candidates][0];
          continue;
        }
        const exact = [...candidates].find((candidate) => candidate === sourceParty);
        if (exact) partiesByCongress[congress] = exact;
      }
      const firstVoteviewParty = Object.entries(partiesByCongress).sort((a, b) => Number(a[0]) - Number(b[0]))[0]?.[1];
      const party = firstVoteviewParty ?? sourceParty;
      const partyChanges = Object.fromEntries(Object.entries(partiesByCongress).filter(([, value]) => value !== party));
      const compactTerm = {
        id: person.id.bioguide,
        n: fullName(person),
        t: term.type,
        s: term.state,
        d: term.district ?? null,
        p: party,
        q: Object.keys(partyChanges).length ? partyChanges : null,
        c: term.caucus ?? null,
        w: wikipediaUrl(person),
        a: override?.start ?? term.start,
        z: override?.end
          ?? provisionalAppointmentEnd(term, currentIds.has(person.id.bioguide))
          ?? (term.end.endsWith("-03-03") ? nextDay(term.end) : term.end),
        sourceStart: term.start,
        sourceEnd: term.end,
        senateClass: term.class ?? null,
        affiliations: affiliationSpans(term, firstCongress),
        overridden: Boolean(override),
      };
      if (term.type !== "rep") return [compactTerm];
      const applicableCorrections = [];
      let hasAuthoritativeCorrection = false;
      for (let congress = firstCongress; congress <= lastCongress; congress += 1) {
        const corrections = houseCorrectionsByTerm.get(`${person.id.bioguide}:${congress}`) ?? [];
        if (corrections.length) hasAuthoritativeCorrection = true;
        applicableCorrections.push(...corrections);
      }
      if (!hasAuthoritativeCorrection) return [compactTerm];
      return applicableCorrections.flatMap((correction) => (correction.intervals ?? []).map((interval) => ({
        ...compactTerm,
        s: correction.state,
        d: correction.district,
        a: interval.start,
        z: interval.end,
        overridden: true,
      })));
    }),
  );

  const houseTermsByCongressEnd = Map.groupBy(
    terms.filter((term) => term.t === "rep" && historicalCongressStart(term.sourceEnd)),
    (term) => term.sourceEnd,
  );
  for (const [end, cohort] of houseTermsByCongressEnd) {
    const officialStart = historicalCongressStart(end);
    const startCounts = new Map();
    cohort.forEach((term) => startCounts.set(term.sourceStart, (startCounts.get(term.sourceStart) ?? 0) + 1));
    const [modalStart, modalCount] = [...startCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (modalStart > officialStart && modalCount >= Math.max(10, cohort.length * 0.5)) {
      cohort.forEach((term) => {
        if (!term.overridden && term.sourceStart === modalStart) term.a = officialStart;
      });
    }
  }

  // The source roster often records senators from the day a session first met,
  // even though their constitutional terms had already begun. Detect those
  // shared session-opening dates across each incoming cohort and move them to
  // March 4 (through 1933) or January 3 (after the Twentieth Amendment).
  const delayedSenateCohorts = Map.groupBy(
    terms.filter((term) => {
      if (term.t !== "sen") return false;
      const startYear = Number(term.sourceStart.slice(0, 4));
      if (startYear < 1789 || startYear % 2 === 0) return false;
      const officialStart = `${startYear}-${startYear <= 1933 ? "03-04" : "01-03"}`;
      return term.sourceStart > officialStart && term.sourceStart.slice(0, 4) === String(startYear);
    }),
    (term) => term.sourceStart,
  );
  for (const [sessionStart, cohort] of delayedSenateCohorts) {
    if (cohort.length < 3) continue;
    const startYear = Number(sessionStart.slice(0, 4));
    const expectedStart = `${startYear}-${startYear <= 1933 ? "03-04" : "01-03"}`;
    cohort.forEach((term) => {
      if (!term.overridden) term.a = expectedStart;
    });
  }

  const compactTerms = terms.flatMap((term) => splitByAffiliation(term, term.affiliations)).map((term) => {
    const compact = { ...term };
    if (compact.t === "sen") compact.k = compact.senateClass;
    if (!compact.q) delete compact.q;
    delete compact.sourceStart;
    delete compact.sourceEnd;
    delete compact.senateClass;
    delete compact.affiliations;
    delete compact.overridden;
    return compact;
  });

  await mkdir(dataOut, { recursive: true });
  await writeFile(path.join(dataOut, "members.json"), JSON.stringify(compactTerms));
  console.log(`Wrote ${compactTerms.length.toLocaleString()} congressional terms`);
}

function districtSelection(value) {
  if (!value) return Array.from({ length: 119 }, (_, index) => index + 1);
  const match = value.match(/^(\d{1,3})(?:-(\d{1,3}))?$/);
  if (!match) throw new Error(`Invalid Congress selection: ${value}`);
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (start < 1 || end > 119 || start > end) throw new Error(`Invalid Congress range: ${value}`);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function districtSimplification(congress, detail) {
  if (detail === "high") {
    if (congress <= 97) return "1.2%";
    if (congress <= 102) return "20%";
    if (congress <= 107) return "15%";
    if (congress <= 112) return "8%";
    if (congress <= 114) return "5%";
    return "50%";
  }
  if (congress <= 97) return "0.6%";
  if (congress <= 102) return "10%";
  if (congress <= 107) return "8%";
  if (congress <= 112) return "1.5%";
  if (congress <= 114) return "2%";
  return "25%";
}

async function buildDistricts(selection, force = false, detail = "standard") {
  const outputDir = detail === "high" ? highDetailDistrictOut : districtOut;
  await mkdir(outputDir, { recursive: true });
  const normalizedDir = path.join(root, "work/normalized-boundaries");
  await mkdir(normalizedDir, { recursive: true });
  const allFiles = (await readdir(boundaryDir))
    .filter((file) => file.endsWith(".geojson"))
    .map((file) => {
      const match = file.match(/_(\d{3})_to_(\d{3})\.geojson$/);
      return match
        ? { file: path.join(boundaryDir, file), start: Number(match[1]), end: Number(match[2]) }
        : null;
    })
    .filter(Boolean);

  const normalizedCache = new Map();
  async function normalizedPlan(plan) {
    if (normalizedCache.has(plan.file)) return normalizedCache.get(plan.file);
    const task = (async () => {
      const handle = await open(plan.file, "r");
      const preview = Buffer.alloc(65_536);
      const { bytesRead } = await handle.read(preview, 0, preview.length, 0);
      await handle.close();
      const head = preview.toString("utf8", 0, bytesRead);
      if (head.includes('"statename"') && head.includes('"district"')) return plan.file;

      const data = JSON.parse(await readFile(plan.file, "utf8"));
      const stateName = path.basename(plan.file).replace(/_(\d{3})_to_(\d{3})\.geojson$/, "");
      for (const mapFeature of data.features) {
        const properties = mapFeature.properties ?? {};
        const districtKey = Object.keys(properties).find(
          (key) => key.toLowerCase() === "district" || /^CD\d+FP$/i.test(key),
        );
        mapFeature.properties = {
          statename: stateName,
          district: Number(districtKey ? properties[districtKey] : 0),
          startcong: plan.start,
          endcong: plan.end,
        };
      }
      const output = path.join(normalizedDir, path.basename(plan.file));
      await writeFile(output, JSON.stringify(data));
      return output;
    })();
    normalizedCache.set(plan.file, task);
    return task;
  }

  const queue = districtSelection(selection);
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const congress = queue.shift();
      const output = path.join(outputDir, `${String(congress).padStart(3, "0")}.json`);
      if (!force) {
        try {
          await access(output);
          console.log(`Congress ${congress}: already built`);
          continue;
        } catch {}
      }
      const activePlans = allFiles.filter(({ start, end }) => start <= congress && congress <= end);
      const active = await Promise.all(activePlans.map(normalizedPlan));
      await execFileAsync(
        "npx",
        [
          "-y",
          "mapshaper@0.6.113",
          ...active,
          "combine-files",
          "-simplify",
          districtSimplification(congress, detail),
          "keep-shapes",
          "-filter-fields",
          "statename,district,startcong,endcong",
          "-o",
          "format=topojson",
          "force",
          output,
        ],
        { maxBuffer: 20 * 1024 * 1024 },
      );
      console.log(`Congress ${congress} (${detail}): ${active.length} plans`);
    }
  });
  await Promise.all(workers);
}

const mode = process.argv[2] ?? "all";
const selection = process.argv.find((argument) => /^\d{1,3}(?:-\d{1,3})?$/.test(argument));
const force = process.argv.includes("--force");
const requestedDetail = process.argv.find((argument) => argument.startsWith("--detail="))?.split("=")[1] ?? "standard";
if (!["standard", "high", "both"].includes(requestedDetail)) throw new Error(`Invalid district detail: ${requestedDetail}`);
if (mode === "members" || mode === "all") await buildMembers();
if (mode === "districts" || mode === "all") {
  if (requestedDetail === "standard" || requestedDetail === "both") await buildDistricts(selection, force, "standard");
  if (requestedDetail === "high" || requestedDetail === "both") await buildDistricts(selection, force, "high");
}
