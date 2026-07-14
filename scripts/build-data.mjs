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

async function buildMembers() {
  const files = ["work/legislators-historical.yaml", "work/legislators-current.yaml"];
  const people = [];
  for (const file of files) {
    const source = yaml.load(await readFile(path.join(root, file), "utf8"));
    people.push(...source);
  }

  const terms = people.flatMap((person) =>
    person.terms.map((term) => ({
      id: person.id.bioguide,
      n: fullName(person),
      t: term.type,
      s: term.state,
      d: term.district ?? null,
      p: term.party ?? "Unknown",
      a: term.start,
      z: term.end,
    })),
  );

  await mkdir(dataOut, { recursive: true });
  await writeFile(path.join(dataOut, "members.json"), JSON.stringify(terms));
  console.log(`Wrote ${terms.length.toLocaleString()} congressional terms`);
}

async function buildDistricts() {
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
        const districtKey = Object.keys(properties).find((key) => /^CD\d+FP$/.test(key));
        mapFeature.properties = {
          statename: stateName,
          district: Number(properties.district ?? (districtKey ? properties[districtKey] : 0)),
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

  const queue = Array.from({ length: 119 }, (_, index) => index + 1);
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const congress = queue.shift();
      const output = path.join(districtOut, `${String(congress).padStart(3, "0")}.json`);
      try {
        await access(output);
        console.log(`Congress ${congress}: already built`);
        continue;
      } catch {}
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
          "0.2%",
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
if (mode === "members" || mode === "all") await buildMembers();
if (mode === "districts" || mode === "all") await buildDistricts();
