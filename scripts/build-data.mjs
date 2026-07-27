import { execFile } from "node:child_process";
import { access, mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import * as yaml from "js-yaml";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const boundaryDir = path.join(root, "work/congressional-district-boundaries/GeoJson");
const districtOut = path.join(root, "public/data/districts");
const dataOut = path.join(root, "public/data");

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
]);

const MANUAL_TERMS = [
  {
    id: "SC-SEN-2026-DG",
    n: "Darline Graham",
    t: "sen",
    s: "SC",
    d: null,
    p: "Republican",
    c: null,
    w: null,
    a: "2026-07-13",
    z: "2027-01-03",
    sourceStart: "2026-07-13",
    sourceEnd: "2027-01-02",
    overridden: true,
  },
];

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
  for (const file of files) {
    const source = yaml.load(await readFile(path.join(root, file), "utf8"));
    people.push(...source);
  }

  const terms = people.flatMap((person) =>
    person.terms.map((term) => {
      const override = TERM_OVERRIDES.get(`${person.id.bioguide}:${term.start}:${term.end}`);
      return {
        id: person.id.bioguide,
        n: fullName(person),
        t: term.type,
        s: term.state,
        d: term.district ?? null,
        p: term.party ?? "Unknown",
        c: term.caucus ?? null,
        w: wikipediaUrl(person),
        a: override?.start ?? term.start,
        z: override?.end ?? (term.end.endsWith("-03-03") ? nextDay(term.end) : term.end),
        sourceStart: term.start,
        sourceEnd: term.end,
        overridden: Boolean(override),
      };
    }),
  );
  terms.push(...MANUAL_TERMS);

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

  const compactTerms = terms.map((term) => {
    const compact = { ...term };
    delete compact.sourceStart;
    delete compact.sourceEnd;
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

async function buildDistricts(selection, force = false) {
  await mkdir(districtOut, { recursive: true });
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
      const output = path.join(districtOut, `${String(congress).padStart(3, "0")}.json`);
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
          congress >= 115 ? "25%" : congress >= 103 ? "15%" : "0.2%",
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
      console.log(`Congress ${congress}: ${active.length} plans`);
    }
  });
  await Promise.all(workers);
}

const mode = process.argv[2] ?? "all";
const selection = process.argv.find((argument) => /^\d{1,3}(?:-\d{1,3})?$/.test(argument));
const force = process.argv.includes("--force");
if (mode === "members" || mode === "all") await buildMembers();
if (mode === "districts" || mode === "all") await buildDistricts(selection, force);
