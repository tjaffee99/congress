import { writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE = "https://en.wikipedia.org/wiki/List_of_delegates_to_the_Continental_Congress";
const STATE_CODES = {
  Connecticut: "CT", Delaware: "DE", Georgia: "GA", Maryland: "MD", Massachusetts: "MA",
  "New Hampshire": "NH", "New Jersey": "NJ", "New York": "NY", "North Carolina": "NC",
  Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", Virginia: "VA",
};
const STATE_HEADINGS = {
  Massachusetts: "Massachusetts_Bay",
  "Rhode Island": "Rhode_Island_and_Providence_Plantations",
};

function plainText(value) {
  return value
    .replace(/<sup[\s\S]*?<\/sup>/g, "")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#160;", " ")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replace(/\s+/g, " ")
    .trim();
}

function yearsFrom(value) {
  const years = new Set();
  for (const match of value.matchAll(/(17\d{2})(?:[–-](17\d{2}))?/g)) {
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    for (let year = first; year <= last; year += 1) years.add(year);
  }
  return [...years].sort();
}

function annualTerm(body, year) {
  if (body === "continental") {
    return {
      a: year === 1776 ? "1776-07-04" : `${year}-01-01`,
      z: year === 1781 ? "1781-03-01" : `${year + 1}-01-01`,
    };
  }
  return {
    a: year === 1781 ? "1781-03-01" : `${year}-01-01`,
    z: year === 1788 ? "1789-03-04" : `${year + 1}-01-01`,
  };
}

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Could not download delegate roster: ${response.status}`);
const document = await response.text();
const rosterStart = document.indexOf('id="Elected_delegates_who_participated"');
const rosterEnd = document.indexOf('id="Elected_delegates_who_did_not_participate"');
const roster = document.slice(rosterStart, rosterEnd > rosterStart ? rosterEnd : undefined);
const records = [];

for (const [stateName, stateCode] of Object.entries(STATE_CODES)) {
  const marker = `<h3 id="${STATE_HEADINGS[stateName] ?? stateName.replaceAll(" ", "_")}">`;
  const start = roster.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${stateName} table`);
  const nextHeading = roster.indexOf("<h3 id=", start + marker.length);
  const section = roster.slice(start, nextHeading < 0 ? undefined : nextHeading);
  const table = section.match(/<table class="wikitable sortable"[\s\S]*?<\/table>/)?.[0];
  if (!table) throw new Error(`Missing ${stateName} roster`);
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].slice(1);

  for (const [, row] of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
    if (cells.length < 4) continue;
    const link = cells[0].match(/<a[^>]+href="(https:\/\/en\.wikipedia\.org\/wiki\/[^"]+)"[^>]*>([^<]+)<\/a>/);
    const name = plainText(link?.[2] ?? cells[0]);
    const wikipedia = link?.[1] ?? `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`;
    const bodyYears = [
      ["continental", yearsFrom(plainText(cells[2])).filter((year) => year >= 1776 && year <= 1781)],
      ["confederation", yearsFrom(plainText(cells[3])).filter((year) => year >= 1781 && year <= 1788)],
    ];
    for (const [body, years] of bodyYears) {
      for (const year of years) {
        const term = annualTerm(body, year);
        records.push({
          id: `PRE-${stateCode}-${name.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`,
          n: name,
          t: "congress",
          s: stateCode,
          d: null,
          p: "Nonpartisan",
          c: null,
          w: wikipedia,
          a: term.a,
          z: term.z,
          body,
          year,
        });
      }
    }
  }
}

records.sort((a, b) => a.a.localeCompare(b.a) || a.s.localeCompare(b.s) || a.n.localeCompare(b.n));
const output = path.join(process.cwd(), "public/data/preconstitutional.json");
await writeFile(output, JSON.stringify(records));
console.log(`Wrote ${records.length} annual delegate records from ${SOURCE}`);
