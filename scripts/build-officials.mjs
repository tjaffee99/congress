import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const positions = [
  ["Q11696", "President", "Executive", 1],
  ["Q11699", "Vice President", "Executive", 2],
  ["Q14213", "Secretary of State", "Cabinet", 10],
  ["Q4215834", "Secretary of the Treasury", "Cabinet", 11],
  ["Q2419102", "Secretary of War", "Cabinet", 12],
  ["Q735015", "Secretary of Defense", "Cabinet", 12],
  ["Q636207", "Attorney General", "Cabinet", 13],
  ["Q2287650", "Secretary of the Interior", "Cabinet", 14],
  ["Q1029955", "Secretary of Agriculture", "Cabinet", 15],
  ["Q2003296", "Secretary of Commerce", "Cabinet", 16],
  ["Q967750", "Secretary of Labor", "Cabinet", 17],
  ["Q3310559", "Secretary of Health, Education & Welfare", "Cabinet", 18],
  ["Q2305968", "Secretary of Health & Human Services", "Cabinet", 18],
  ["Q2419581", "Secretary of Housing & Urban Development", "Cabinet", 19],
  ["Q967737", "Secretary of Transportation", "Cabinet", 20],
  ["Q1029968", "Secretary of Energy", "Cabinet", 21],
  ["Q967762", "Secretary of Education", "Cabinet", 22],
  ["Q1658460", "Secretary of Veterans Affairs", "Cabinet", 23],
  ["Q642859", "Secretary of Homeland Security", "Cabinet", 24],
  ["Q11147", "Chief Justice", "Supreme Court", 30],
  ["Q11144", "Associate Justice", "Supreme Court", 31],
  ["Q912994", "Speaker of the House", "Congressional leadership", 40],
  ["Q1140848", "President pro tempore", "Congressional leadership", 41],
  ["Q28530268", "Senate majority leader", "Congressional leadership", 42],
  ["Q100734881", "Senate minority leader", "Congressional leadership", 43],
  ["Q108913856", "House majority leader", "Congressional leadership", 44],
  ["Q138208451", "House minority leader", "Congressional leadership", 45],
];

const positionById = Object.fromEntries(positions.map((position) => [position[0], position]));
const values = positions.map(([id]) => `wd:${id}`).join(" ");
const query = `
SELECT ?person ?personLabel ?position ?start ?end WHERE {
  VALUES ?position { ${values} }
  ?person wdt:P31 wd:Q5; p:P39 ?statement .
  ?statement ps:P39 ?position .
  OPTIONAL { ?statement pq:P580 ?start }
  OPTIONAL { ?statement pq:P582 ?end }
  ?person rdfs:label ?personLabel .
  FILTER(LANG(?personLabel) = "en")
}`;

const sparql = new URL("https://query.wikidata.org/sparql");
sparql.searchParams.set("query", query);
sparql.searchParams.set("format", "json");
const response = await fetch(sparql, { headers: { "User-Agent": "AmericanStateAtlas/1.0" } });
if (!response.ok) throw new Error(`Wikidata query failed: ${response.status}`);
const bindings = (await response.json()).results.bindings;

const officials = bindings
  .map((row) => {
    const person = row.person.value.split("/").pop();
    const position = row.position.value.split("/").pop();
    const [, title, group, order] = positionById[position];
    return {
      id: person,
      n: row.personLabel.value,
      t: title,
      g: group,
      o: order,
      a: row.start?.value?.slice(0, 10) ?? null,
      z: row.end?.value?.slice(0, 10) ?? null,
    };
  })
  .filter((official) => official.a)
  .sort((a, b) => a.o - b.o || a.a.localeCompare(b.a));

const out = path.join(process.cwd(), "public/data");
await mkdir(out, { recursive: true });
await writeFile(path.join(out, "officials.json"), JSON.stringify(officials));
console.log(`Wrote ${officials.length.toLocaleString()} dated office tenures`);
