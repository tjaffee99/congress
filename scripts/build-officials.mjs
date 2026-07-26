import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as yaml from "js-yaml";

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
  ["Q786242", "White House Chief of Staff", "Cabinet-level", 25],
  ["Q2087596", "EPA Administrator", "Cabinet-level", 26],
  ["Q16300323", "Director of the Office of Management & Budget", "Cabinet-level", 27],
  ["Q27907212", "United States Trade Representative", "Cabinet-level", 28],
  ["Q1785225", "U.S. Ambassador to the United Nations", "Cabinet-level", 29],
  ["Q15623718", "Small Business Administrator", "Cabinet-level", 30],
  ["Q1154057", "Director of National Intelligence", "Cabinet-level", 31],
  ["Q27656", "Director of the Central Intelligence Agency", "Cabinet-level", 32],
  ["Q11147", "Chief Justice", "Supreme Court", 35],
  ["Q11144", "Associate Justice", "Supreme Court", 36],
  ["Q912994", "Speaker of the House", "Congressional leadership", 40, "rep"],
  ["Q1140848", "President pro tempore", "Congressional leadership", 41, "sen"],
  ["Q28530268", "Senate majority leader", "Congressional leadership", 42, "sen"],
  ["Q100734881", "Senate minority leader", "Congressional leadership", 43, "sen"],
  ["Q108913856", "House majority leader", "Congressional leadership", 44, "rep"],
  ["Q138208451", "House minority leader", "Congressional leadership", 45, "rep"],
];

const created = {
  "Secretary of State": "1789-09-15",
  "Secretary of the Treasury": "1789-09-11",
  "Secretary of War": "1789-08-07",
  "Attorney General": "1789-09-24",
  "Secretary of the Interior": "1849-03-03",
  "Secretary of Agriculture": "1889-02-15",
  "Secretary of Commerce": "1913-03-04",
  "Secretary of Labor": "1913-03-04",
  "Secretary of Health, Education & Welfare": "1953-04-11",
  "Secretary of Health & Human Services": "1980-05-04",
  "Secretary of Housing & Urban Development": "1965-09-09",
  "Secretary of Transportation": "1966-10-15",
  "Secretary of Energy": "1977-08-04",
  "Secretary of Education": "1980-05-04",
  "Secretary of Veterans Affairs": "1989-03-15",
  "Secretary of Homeland Security": "2003-01-24",
  "Secretary of Defense": "1947-09-18",
  "White House Chief of Staff": "1946-01-20",
  "EPA Administrator": "1970-12-02",
  "Director of the Office of Management & Budget": "1970-07-01",
  "United States Trade Representative": "1962-10-11",
  "U.S. Ambassador to the United Nations": "1947-01-17",
  "Small Business Administrator": "1953-07-30",
  "Director of National Intelligence": "2005-04-21",
  "Director of the Central Intelligence Agency": "2004-12-17",
  "Chief Justice": "1789-09-26",
  "Associate Justice": "1789-09-26",
};

const presidentParties = new Map(Object.entries({
  "George Washington": "Independent",
  "John Adams": "Federalist",
  "Thomas Jefferson": "Democratic-Republican",
  "James Madison": "Democratic-Republican",
  "James Monroe": "Democratic-Republican",
  "John Quincy Adams": "Democratic-Republican",
  "Andrew Jackson": "Democrat",
  "Martin Van Buren": "Democrat",
  "William Henry Harrison": "Whig",
  "John Tyler": "Whig",
  "James K. Polk": "Democrat",
  "Zachary Taylor": "Whig",
  "Millard Fillmore": "Whig",
  "Franklin Pierce": "Democrat",
  "James Buchanan": "Democrat",
  "Abraham Lincoln": "Republican",
  "Andrew Johnson": "Democrat",
  "Ulysses S. Grant": "Republican",
  "Rutherford B. Hayes": "Republican",
  "James A. Garfield": "Republican",
  "Chester A. Arthur": "Republican",
  "Grover Cleveland": "Democrat",
  "Benjamin Harrison": "Republican",
  "William McKinley": "Republican",
  "Theodore Roosevelt": "Republican",
  "William Howard Taft": "Republican",
  "Woodrow Wilson": "Democrat",
  "Warren G. Harding": "Republican",
  "Calvin Coolidge": "Republican",
  "Herbert Hoover": "Republican",
  "Franklin D. Roosevelt": "Democrat",
  "Harry S. Truman": "Democrat",
  "Dwight D. Eisenhower": "Republican",
  "John F. Kennedy": "Democrat",
  "Lyndon B. Johnson": "Democrat",
  "Richard Nixon": "Republican",
  "Gerald Ford": "Republican",
  "Jimmy Carter": "Democrat",
  "Ronald Reagan": "Republican",
  "George H. W. Bush": "Republican",
  "Bill Clinton": "Democrat",
  "George W. Bush": "Republican",
  "Barack Obama": "Democrat",
  "Donald Trump": "Republican",
  "Joe Biden": "Democrat",
}));

const falseOfficeClaims = new Set([
  "Speaker of the House|James Madison",
  "Speaker of the House|John Nance Garner",
  "Speaker of the House|Jack Kemp",
  "Secretary of the Interior|Herbert Alton Meyer",
  "Director of the Central Intelligence Agency|Pito Grotesco",
]);

const leadershipRoleMap = new Map([
  ["Speaker of the House", ["Speaker of the House", 40, "rep"]],
  ["President Pro Tempore of the Senate", ["President pro tempore", 41, "sen"]],
  ["Senate Majority Leader", ["Senate majority leader", 42, "sen"]],
  ["Senate Minority Leader", ["Senate minority leader", 43, "sen"]],
  ["House Majority Leader", ["House majority leader", 44, "rep"]],
  ["House Minority Leader", ["House minority leader", 45, "rep"]],
]);

function fullName(person) {
  return person.name.official_full ?? [person.name.first, person.name.middle, person.name.last, person.name.suffix]
    .filter(Boolean)
    .join(" ");
}

function legislatorWikipediaUrl(person) {
  return person?.id.wikipedia
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(person.id.wikipedia).replaceAll("%20", "_")}`
    : null;
}

function nextDay(date) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function textFromHtml(value) {
  return value
    .replace(/<[^>]+>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&ndash;", "–")
    .replaceAll("&#150;", "–")
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function senateFloorLeaders() {
  const response = await fetch("https://www.senate.gov/senators/majority-minority-leaders.htm", {
    headers: { "User-Agent": "AmericanStateAtlas/1.0" },
  });
  if (!response.ok) throw new Error(`Senate leadership query failed: ${response.status}`);
  const html = await response.text();
  const transitions = new Map([
    ["55|Senate minority leader", ["1898-04-29"]],
    ["59|Senate majority leader", ["1906-06-09"]],
    ["61|Senate minority leader", ["1909-12-09"]],
    ["65|Senate minority leader", ["1918-08-25"]],
    ["66|Senate minority leader", ["1920-04-27"]],
    ["68|Senate majority leader", ["1924-11-28"]],
    ["75|Senate majority leader", ["1937-07-22"]],
    ["78|Senate minority leader", ["1943-11-22"]],
    ["82|Senate minority leader", ["1952-01-08"]],
    ["83|Senate majority leader", ["1953-08-04"]],
    ["91|Senate minority leader", ["1969-09-24"]],
    ["104|Senate majority leader", ["1996-06-12"]],
  ]);
  const leaders = [];
  for (const row of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
    if (cells.length < 3) continue;
    const congressText = textFromHtml(cells[0].replace(/<span[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/span>/gi, ""));
    const congressMatch = congressText.match(/(\d+)(?:st|nd|rd|th) Congress \((\d{4})–(\d{4})\)/);
    if (!congressMatch) continue;
    const congress = Number(congressMatch[1]);
    const startYear = Number(congressMatch[2]);
    const endYear = Number(congressMatch[3]);
    const monthDay = congress <= 73 ? "03-04" : "01-03";
    const congressStart = `${startYear}-${monthDay}`;
    const congressEnd = `${endYear}-${monthDay}`;
    for (const [cellIndex, title, order] of [[1, "Senate majority leader", 42], [2, "Senate minority leader", 43]]) {
      const people = [...cells[cellIndex].matchAll(/<a[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>\s*\(([DRI])-([A-Z]{2})\)<\/a>/g)]
        .map((match) => ({ name: textFromHtml(match[1]), party: match[2] === "D" ? "Democrat" : match[2] === "R" ? "Republican" : "Independent" }));
      const dates = transitions.get(`${congress}|${title}`) ?? [];
      people.forEach((person, index) => leaders.push({
        id: `SENATE-${congress}-${title}-${index}`,
        n: person.name,
        t: title,
        g: "Congressional leadership",
        o: order,
        h: "sen",
        p: person.party,
        x: false,
        a: index === 0 ? congressStart : dates[index - 1] ?? congressStart,
        z: index < people.length - 1 ? dates[index] ?? congressEnd : congressEnd,
      }));
    }
  }
  const withoutExceptionalCongresses = leaders.filter((leader) => ![107, 117].some((congress) => leader.id.startsWith(`SENATE-${congress}-`)));
  return withoutExceptionalCongresses.concat([
    [107, "Senate majority leader", 42, "Thomas A. Daschle", "Democrat", "2001-01-03", "2001-01-20"],
    [107, "Senate majority leader", 42, "Trent Lott", "Republican", "2001-01-20", "2001-06-06"],
    [107, "Senate majority leader", 42, "Thomas A. Daschle", "Democrat", "2001-06-06", "2003-01-03"],
    [107, "Senate minority leader", 43, "Trent Lott", "Republican", "2001-01-03", "2001-01-20"],
    [107, "Senate minority leader", 43, "Thomas A. Daschle", "Democrat", "2001-01-20", "2001-06-06"],
    [107, "Senate minority leader", 43, "Trent Lott", "Republican", "2001-06-06", "2003-01-03"],
    [117, "Senate majority leader", 42, "Mitch McConnell", "Republican", "2021-01-03", "2021-01-20"],
    [117, "Senate majority leader", 42, "Charles E. Schumer", "Democrat", "2021-01-20", "2023-01-03"],
    [117, "Senate minority leader", 43, "Charles E. Schumer", "Democrat", "2021-01-03", "2021-01-20"],
    [117, "Senate minority leader", 43, "Mitch McConnell", "Republican", "2021-01-20", "2023-01-03"],
  ].map(([congress, title, order, name, party, start, end], index) => ({
    id: `SENATE-${congress}-${title}-${index}`,
    n: name,
    t: title,
    g: "Congressional leadership",
    o: order,
    h: "sen",
    p: party,
    x: false,
    a: start,
    z: end,
  })));
}

async function houseFloorLeaders(legislators) {
  const sources = [
    ["https://history.house.gov/People/Office/Majority-Leaders/", "House majority leader", 44],
    ["https://history.house.gov/People/Office/Minority-Leaders/", "House minority leader", 45],
  ];
  const leaders = [];
  for (const [url, title, order] of sources) {
    const response = await fetch(url, { headers: { "User-Agent": "AmericanStateAtlas/1.0" } });
    if (!response.ok) throw new Error(`House leadership query failed: ${response.status}`);
    const html = await response.text();
    for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
      if (cells.length < 4) continue;
      const congressMatch = textFromHtml(cells[0]).match(/(\d+)(?:st|nd|rd|th) \((\d{4})–(\d{4})\)/);
      if (!congressMatch) continue;
      const congress = Number(congressMatch[1]);
      const startYear = Number(congressMatch[2]);
      const endYear = Number(congressMatch[3]);
      const party = textFromHtml(cells[2]);
      const state = textFromHtml(cells[3]);
      const sourceName = textFromHtml(cells[1]);
      const surname = sourceName.split(",")[0].replace(/[^A-Z]/g, "");
      const start = congress <= 73 ? `${startYear}-03-04` : `${startYear}-01-03`;
      const end = congress <= 73 ? `${endYear}-03-04` : `${endYear}-01-03`;
      const person = legislators.find((candidate) =>
        candidate.name.last.toUpperCase().replace(/[^A-Z]/g, "") === surname
        && candidate.terms.some((term) => term.type === "rep" && term.state === state && term.party === party && term.start < end && term.end > start),
      );
      const exactRole = person?.leadership_roles?.find((role) => {
        const mapped = leadershipRoleMap.get(role.title);
        return mapped?.[0] === title && role.start < end && (!role.end || role.end > start);
      });
      leaders.push({
        id: person?.id.bioguide ?? `HOUSE-${congress}-${title}-${leaders.length}`,
        n: person ? fullName(person) : sourceName.split(",").reverse().join(" ").trim(),
        t: title,
        g: "Congressional leadership",
        o: order,
        h: "rep",
        p: party,
        x: false,
        w: legislatorWikipediaUrl(person),
        a: exactRole?.start ?? start,
        z: exactRole?.end ?? end,
      });
    }
  }
  return leaders;
}

function mergeSameOfficeholder(rows) {
  const merged = [];
  for (const row of [...rows].sort((a, b) => a.t.localeCompare(b.t) || a.id.localeCompare(b.id) || a.a.localeCompare(b.a))) {
    const previous = merged.at(-1);
    const touches = previous?.z && row.a <= nextDay(previous.z);
    const overlapsOpenTerm = previous && !previous.z;
    if (previous && previous.id === row.id && previous.t === row.t && (touches || overlapsOpenTerm)) {
      previous.a = previous.a < row.a ? previous.a : row.a;
      previous.z = !previous.z || !row.z ? null : (previous.z > row.z ? previous.z : row.z);
      previous.p ??= row.p;
      previous.w ??= row.w;
      continue;
    }
    merged.push({ ...row });
  }
  return merged;
}

const root = process.cwd();
const legislators = [];
for (const file of ["work/legislators-historical.yaml", "work/legislators-current.yaml"]) {
  legislators.push(...yaml.load(await readFile(path.join(root, file), "utf8")));
}

const positionById = Object.fromEntries(positions.map((position) => [position[0], position]));
const values = positions.map(([id]) => `wd:${id}`).join(" ");
const query = `
SELECT ?person ?personLabel ?position ?start ?end ?article WHERE {
  VALUES ?position { ${values} }
  ?person wdt:P31 wd:Q5; p:P39 ?statement .
  ?statement ps:P39 ?position .
  OPTIONAL { ?statement pq:P580 ?start }
  OPTIONAL { ?statement pq:P582 ?end }
  OPTIONAL {
    ?article schema:about ?person;
      schema:isPartOf <https://en.wikipedia.org/>.
  }
  ?person rdfs:label ?personLabel .
  FILTER(LANG(?personLabel) = "en")
}`;

const sparql = new URL("https://query.wikidata.org/sparql");
sparql.searchParams.set("query", query);
sparql.searchParams.set("format", "json");
const response = await fetch(sparql, { headers: { "User-Agent": "AmericanStateAtlas/1.0" } });
if (!response.ok) throw new Error(`Wikidata query failed: ${response.status}`);
const bindings = (await response.json()).results.bindings;

let officials = bindings.map((row) => {
  const person = row.person.value.split("/").pop();
  const position = row.position.value.split("/").pop();
  const [, title, group, order, chamber] = positionById[position];
  return {
    id: person,
    n: row.personLabel.value,
    t: title,
    g: group,
    o: order,
    h: chamber ?? null,
    p: null,
    x: false,
    w: row.article?.value ?? null,
    a: row.start?.value?.slice(0, 10) ?? null,
    z: row.end?.value?.slice(0, 10) ?? null,
  };
}).filter((official) =>
  official.a
  && (!created[official.t] || official.a >= created[official.t])
  && !falseOfficeClaims.has(`${official.t}|${official.n}`),
);

officials = officials.filter((official) => ![
  "Senate majority leader",
  "Senate minority leader",
  "House majority leader",
  "House minority leader",
].includes(official.t));
officials.push(...await senateFloorLeaders());
officials.push(...await houseFloorLeaders(legislators));

officials.push({
  id: "TODD-BLANCHE-ACTING-AG",
  n: "Todd Blanche",
  t: "Attorney General",
  g: "Cabinet",
  o: 13,
  h: null,
  p: null,
  x: true,
  w: "https://en.wikipedia.org/wiki/Todd_Blanche",
  a: "2026-04-02",
  z: null,
});

for (const person of legislators) {
  for (const role of person.leadership_roles ?? []) {
    const mapped = leadershipRoleMap.get(role.title);
    if (!mapped) continue;
    const [title, order, chamber] = mapped;
    if (title === "Senate majority leader" || title === "Senate minority leader") continue;
    if (title === "President pro tempore" && fullName(person).startsWith("Patty Murray")) continue;
    const term = person.terms.find((candidate) =>
      candidate.type === chamber && candidate.start <= role.start && candidate.end > role.start,
    );
    officials.push({
      id: person.id.bioguide,
      n: fullName(person),
      t: title,
      g: "Congressional leadership",
      o: order,
      h: chamber,
      p: term?.party ?? null,
      x: false,
      w: legislatorWikipediaUrl(person),
      a: role.start,
      z: role.end ?? null,
    });
  }
}

const legislatorByWikidata = new Map(legislators.filter((person) => person.id.wikidata).map((person) => [person.id.wikidata, person]));
for (const official of officials) {
  const matchedLegislator = legislatorByWikidata.get(official.id)
    ?? legislators.find((candidate) => fullName(candidate) === official.n);
  official.w ??= legislatorWikipediaUrl(matchedLegislator);
  if (official.g === "Congressional leadership" && !official.p) {
    const term = matchedLegislator?.terms.find((candidate) =>
      candidate.type === official.h && candidate.start <= official.a && candidate.end > official.a,
    );
    official.p = term?.party ?? null;
  }
  if (official.t === "President") official.p = presidentParties.get(official.n) ?? null;
}

officials = mergeSameOfficeholder(officials);

const presidents = officials.filter((official) => official.t === "President");
for (const official of officials) {
  if (official.t === "Vice President") {
    official.p = presidents.find((president) => president.a <= official.a && (!president.z || president.z > official.a))?.p ?? null;
  }
}

for (const rows of Map.groupBy(officials.filter((official) => official.t !== "Associate Justice"), (official) => official.t).values()) {
  rows.sort((a, b) => a.a.localeCompare(b.a));
  for (let index = 0; index < rows.length - 1; index += 1) {
    if (!rows[index].z) rows[index].z = rows[index + 1].a;
  }
}

const seen = new Set();
officials = officials
  .filter((official) => {
    const key = [official.id, official.t, official.a, official.z].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .sort((a, b) => a.o - b.o || a.a.localeCompare(b.a));

const out = path.join(root, "public/data");
await mkdir(out, { recursive: true });
await writeFile(path.join(out, "officials.json"), JSON.stringify(officials));
console.log(`Wrote ${officials.length.toLocaleString()} cleaned office tenures`);
