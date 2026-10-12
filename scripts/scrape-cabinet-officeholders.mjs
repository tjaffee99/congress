import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Wikipedia's office-by-office tables include acting secretaries that are often
// absent from Wikidata's P39 statements. This script snapshots those tables so
// the production build remains deterministic and does not scrape at request time.
const offices = [
  ["Secretary of State", "List of United States secretaries of state", 10, "1789-09-15"],
  ["Secretary of the Treasury", "United States Secretary of the Treasury", 11, "1789-09-11"],
  ["Secretary of War", "United States Secretary of War", 12, "1789-08-07", "1947-09-18"],
  ["Secretary of Defense", "United States Secretary of Defense", 12, "1947-09-17"],
  ["Secretary of the Navy", "United States Secretary of the Navy", 12.1, "1798-06-18", "1949-08-10"],
  ["Secretary of the Army", "United States Secretary of the Army", 12.2, "1947-09-18", "1949-08-10"],
  ["Secretary of the Air Force", "United States Secretary of the Air Force", 12.3, "1947-09-18", "1949-08-10"],
  ["Attorney General", "United States Attorney General", 13, "1789-09-24"],
  ["Secretary of the Interior", "United States Secretary of the Interior", 14, "1849-03-03"],
  ["Secretary of Agriculture", "United States Secretary of Agriculture", 15, "1889-02-15"],
  ["Secretary of Commerce", "United States Secretary of Commerce", 16, "1913-03-04"],
  ["Secretary of Labor", "United States Secretary of Labor", 17, "1913-03-04"],
  ["Secretary of Health, Education & Welfare", "United States Secretary of Health and Human Services", 18, "1953-04-11", "1980-05-04"],
  ["Secretary of Health & Human Services", "United States Secretary of Health and Human Services", 18, "1980-05-04"],
  ["Secretary of Housing & Urban Development", "United States Secretary of Housing and Urban Development", 19, "1965-09-09"],
  ["Secretary of Transportation", "United States Secretary of Transportation", 20, "1966-10-15"],
  ["Secretary of Energy", "United States Secretary of Energy", 21, "1977-08-04"],
  ["Secretary of Education", "United States Secretary of Education", 22, "1980-05-04"],
  ["Secretary of Veterans Affairs", "United States Secretary of Veterans Affairs", 23, "1989-03-15"],
  ["Secretary of Homeland Security", "United States Secretary of Homeland Security", 24, "2003-01-24"],
];

function decodeHtml(value) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(Number.parseInt(number, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .trim();
}

function wikipediaUrl(href) {
  let url = null;
  if (href.startsWith("https://en.wikipedia.org/")) url = href.replaceAll("&amp;", "&");
  if (href.startsWith("/")) url = `https://en.wikipedia.org${href.replaceAll("&amp;", "&")}`;
  if (href.startsWith("./")) url = `https://en.wikipedia.org/wiki/${href.slice(2)}`;
  if (!url) return null;
  const parsed = new URL(url);
  if (parsed.searchParams.get("redlink") === "1") {
    const title = parsed.searchParams.get("title") ?? decodeURIComponent(parsed.pathname.split("/").at(-1) ?? "");
    return `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(title.replaceAll("_", " "))}`;
  }
  return url;
}

const monthNames = "January|February|March|April|May|June|July|August|September|October|November|December";

function isoDate(value) {
  const date = new Date(`${value} 00:00:00 UTC`);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10);
}

async function scrapeOffice([title, page, order, created, discontinued]) {
  const url = `https://en.wikipedia.org/wiki/${page.replaceAll(" ", "_")}`;
  const response = await fetch(url, {
    headers: { "user-agent": "AmericanAtlas/1.0 (historical civic atlas; https://congress.theojaffee.net)" },
  });
  if (!response.ok) throw new Error(`${title}: Wikipedia returned ${response.status}`);
  const html = await response.text();
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[1]);
  const holders = [];
  let previousPerson = null;

  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((match) => match[1]);
    const nameCellIndex = cells.findIndex((cell) => cell.includes('class="fn"'));
    const person = nameCellIndex < 0
      ? null
      : cells[nameCellIndex].match(/<span class="fn"><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const officeholder = person ?? previousPerson;
    if (!officeholder) continue;
    const tenureCells = cells.slice(nameCellIndex < 0 ? 0 : nameCellIndex + 1);
    let dates = [...tenureCells.join("").matchAll(/data-sort-value="0*(\d{4}-\d{2}-\d{2})-0000"/g)].map((match) => match[1]);
    if (!dates.length) {
      dates = tenureCells.flatMap((cell) => {
        const text = decodeHtml(cell);
        return [...text.matchAll(new RegExp(`(?:${monthNames})\\s+\\d{1,2},\\s+\\d{4}`, "g"))]
          .map((match) => isoDate(match[0]))
          .filter(Boolean);
      });
    }
    if (!dates.length) {
      previousPerson = null;
      continue;
    }
    if (person) previousPerson = person;
    const start = dates[0];
    if (start < created || (discontinued && start >= discontinued)) continue;
    const name = decodeHtml(officeholder[2]);
    const end = dates[1] && (!discontinued || dates[1] <= discontinued) ? dates[1] : discontinued ?? null;
    holders.push({
      id: `WIKIPEDIA-${title.replaceAll(/[^A-Z0-9]+/gi, "-").toUpperCase()}-${holders.length + 1}`,
      n: name,
      t: title,
      g: "Cabinet",
      o: order,
      h: null,
      p: null,
      s: null,
      x: /\bActing\b/i.test(row),
      w: wikipediaUrl(officeholder[1]),
      a: start,
      z: end,
    });
  }

  let unique = [...new Map(holders.map((holder) => [
    [holder.n, holder.a, holder.z].join("|"),
    holder,
  ])).values()];
  // Some Attorney General tables preserve every statutory succession claimant
  // for a transition day. The dated row is the actual continuous acting tenure;
  // an undated same-day alternative must not remain open indefinitely.
  unique = unique.filter((holder) => holder.z || !unique.some((candidate) =>
    candidate !== holder && candidate.a === holder.a && candidate.z
  ));

  // Stanton remained secretary while suspended, with Grant serving as acting
  // secretary during the suspension. Model that interruption rather than
  // drawing two simultaneous officeholders.
  if (title === "Secretary of War") {
    const stanton = unique.find((holder) => holder.n === "Edwin M. Stanton");
    const grant = unique.find((holder) => holder.n === "Ulysses S. Grant");
    if (stanton && grant?.z) {
      const originalEnd = stanton.z;
      stanton.z = grant.a;
      stanton.x = false;
      unique.push({ ...stanton, id: `${stanton.id}-RETURNED`, a: grant.z, z: originalEnd });
    }
  }
  // Wikipedia's current-officeholder rows sometimes omit the `fn` class used
  // by the historical table, causing the parser to carry the prior acting
  // officeholder forward. Keep these current transitions explicit.
  if (title === "Secretary of Labor") {
    const sonderling = unique.find((holder) => holder.a === "2026-04-20");
    if (sonderling) sonderling.x = true;
  }
  if (title === "Secretary of Transportation") {
    const duffy = unique.find((holder) => holder.a === "2025-01-28");
    if (duffy) Object.assign(duffy, {
      n: "Sean Duffy",
      x: false,
      w: "https://en.wikipedia.org/wiki/Sean_Duffy",
    });
  }
  if (!unique.length) throw new Error(`${title}: no officeholders parsed`);
  console.log(`${title}: ${unique.length} tenures`);
  return unique;
}

const officeholders = (await Promise.all(offices.map(scrapeOffice)))
  .flat()
  .sort((a, b) => a.o - b.o || a.a.localeCompare(b.a));

const out = path.join(root, "data");
await mkdir(out, { recursive: true });
await writeFile(path.join(out, "cabinet-officeholders.json"), `${JSON.stringify(officeholders, null, 2)}\n`);
console.log(`Wrote ${officeholders.length} Wikipedia Cabinet tenures`);
