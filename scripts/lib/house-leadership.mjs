export const leadershipRoleMap = new Map([
  ["Speaker of the House", ["Speaker of the House", 40, "rep"]],
  ["President Pro Tempore of the Senate", ["President pro tempore", 41, "sen"]],
  ["Senate Majority Leader", ["Senate majority leader", 42, "sen"]],
  ["Senate Majority Whip", ["Senate majority whip", 43, "sen"]],
  ["Senate Minority Leader", ["Senate minority leader", 44, "sen"]],
  ["Senate Minority Whip", ["Senate minority whip", 45, "sen"]],
  ["House Majority Leader", ["House majority leader", 42, "rep"]],
  ["House Majority Whip", ["House majority whip", 43, "rep"]],
  ["House Minority Leader", ["House minority leader", 44, "rep"]],
  ["House Minority Whip", ["House minority whip", 45, "rep"]],
]);

export function fullName(person) {
  return person.name.official_full ?? [person.name.first, person.name.middle, person.name.last, person.name.suffix]
    .filter(Boolean)
    .join(" ");
}

export function legislatorWikipediaUrl(person) {
  return person?.id.wikipedia
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(person.id.wikipedia).replaceAll("%20", "_")}`
    : null;
}

export function congressDateRange(congress) {
  const startYear = 1789 + (congress - 1) * 2;
  if (congress <= 72) return [`${startYear}-03-04`, `${startYear + 2}-03-04`];
  if (congress === 73) return ["1933-03-04", "1935-01-03"];
  return [`${startYear}-01-03`, `${startYear + 2}-01-03`];
}

export function congressOnDate(date) {
  let congress = 1;
  while (congressDateRange(congress + 1)[0] <= date) congress += 1;
  return congress;
}

export function textFromHtml(value) {
  return value
    .replace(/<[^>]+>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&ndash;", "–")
    .replaceAll("&#150;", "–")
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ")
    .trim();
}

// history.house.gov lists each office as one sortable table with a row per
// Congress and officeholder, from the office's first holder to the sitting
// Congress. Anything else (an error page, a redesigned table, a list that
// stops early) must fail the build rather than drop officeholders, so rows are
// checked to cover every Congress through the one sitting when the page was
// downloaded. A new Congress may take a few weeks to appear.
export function historyHouseRows(html, { label, minimumCells, asOf }) {
  const table = html.match(/<table[^>]*\bid="tblSort"[^>]*>([\s\S]*?)<\/table>/)?.[1];
  if (!table) throw new Error(`${label}: officeholder table not found`);
  const rows = [];
  for (const row of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
    if (!cells.length) continue;
    const congress = textFromHtml(cells[0]).match(/^(\d+)(?:st|nd|rd|th)\b/);
    if (!congress || cells.length < minimumCells) {
      throw new Error(`${label}: unrecognized row "${textFromHtml(row[1]).slice(0, 80)}"`);
    }
    rows.push({ congress: Number(congress[1]), cells, html: row[1] });
  }
  const congresses = new Set(rows.map((row) => row.congress));
  const first = Math.min(...congresses);
  const last = Math.max(...congresses);
  const missing = [];
  for (let congress = first; congress <= last; congress += 1) {
    if (!congresses.has(congress)) missing.push(congress);
  }
  if (!rows.length || missing.length) {
    throw new Error(`${label}: ${rows.length ? `no row for Congress ${missing.join(", ")}` : "no officeholder rows"}`);
  }
  const sitting = congressOnDate(asOf.slice(0, 10));
  if (last < sitting - 1) throw new Error(`${label}: last row is Congress ${last}, but Congress ${sitting} was sitting on ${asOf.slice(0, 10)}`);
  return rows;
}

export const historyHousePages = {
  speakers: { url: "https://history.house.gov/people/office/speakers-list/", label: "House Speakers", minimumCells: 4 },
  democraticWhips: { url: "https://history.house.gov/People/Office/Democratic-Whips/", label: "House Democratic whips", minimumCells: 3 },
  republicanWhips: { url: "https://history.house.gov/People/Office/Republican-Whips/", label: "House Republican whips", minimumCells: 3 },
  majorityLeaders: { url: "https://history.house.gov/People/Office/Majority-Leaders/", label: "House majority leaders", minimumCells: 4 },
  minorityLeaders: { url: "https://history.house.gov/People/Office/Minority-Leaders/", label: "House minority leaders", minimumCells: 4 },
};

function rowsForPage(page, key) {
  return historyHouseRows(page.text, { ...historyHousePages[key], asOf: page.fetchedAt });
}

function houseMajorityParty(legislators, start, end) {
  const byParty = new Map();
  for (const person of legislators) {
    const party = person.terms.find((term) => term.type === "rep" && term.start < end && term.end >= start)?.party;
    if (party) byParty.set(party, (byParty.get(party) ?? 0) + 1);
  }
  return [...byParty.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// `pages` holds the fetched Democratic and Republican whip lists.
export function housePartyWhips(pages, legislators) {
  const sources = [
    [pages.democraticWhips, "democraticWhips", "Democrat"],
    [pages.republicanWhips, "republicanWhips", "Republican"],
  ];
  const transitions = new Map([
    ["60|Democrat", ["1908-02-01"]],
    ["70|Democrat", ["1929-03-03"]],
    ["77|Democrat", ["1942-06-08"]],
    ["79|Democrat", ["1946-01-01"]],
    ["87|Democrat", ["1962-01-10"]],
    ["101|Democrat", ["1989-06-14"]],
    ["102|Democrat", ["1991-09-11"]],
    ["107|Democrat", ["2002-01-15"]],
    ["72|Republican", ["1932-04-08"]],
    ["78|Republican", ["1943-06-02"]],
    ["101|Republican", ["1989-03-22"]],
    ["113|Republican", ["2014-07-31"]],
  ]);
  const whips = [];

  for (const [page, key, party] of sources) {
    const rowsByCongress = new Map();
    for (const { congress, cells } of rowsForPage(page, key)) {
      const [start, end] = congressDateRange(congress);
      const sourceName = textFromHtml(cells[1]);
      const state = textFromHtml(cells[2]);
      const surname = sourceName.split(",")[0].replace(/[^A-Z]/g, "");
      const person = legislators.find((candidate) =>
        candidate.name.last.toUpperCase().replace(/[^A-Z]/g, "") === surname
        && candidate.terms.some((term) => term.type === "rep" && term.state === state && term.start < end && term.end >= start),
      );
      const people = rowsByCongress.get(congress) ?? [];
      people.push({
        id: person?.id.bioguide ?? `HOUSE-WHIP-${party}-${congress}-${people.length}`,
        n: person ? fullName(person) : sourceName.split(",").reverse().join(" ").trim(),
        w: legislatorWikipediaUrl(person),
        s: state,
      });
      rowsByCongress.set(congress, people);
    }

    for (const [congress, people] of rowsByCongress) {
      const [start, end] = congressDateRange(congress);
      const majority = houseMajorityParty(legislators, start, end) === party;
      const title = majority ? "House majority whip" : "House minority whip";
      const order = majority ? 43 : 45;
      const dates = transitions.get(`${congress}|${party}`) ?? [];
      people.forEach((person, index) => {
        const matched = legislators.find((candidate) => candidate.id.bioguide === person.id);
        const exactRole = matched?.leadership_roles?.find((role) => leadershipRoleMap.get(role.title)?.[0] === title && role.start < end && (!role.end || role.end > start));
        whips.push({
          ...person,
          t: title,
          g: "Congressional leadership",
          o: order,
          h: "rep",
          p: party,
          x: false,
          a: exactRole?.start ?? (index === 0 ? start : dates[index - 1] ?? start),
          z: exactRole?.end ?? (index < people.length - 1 ? dates[index] ?? end : end),
        });
      });
    }
  }
  return whips;
}

export function houseSpeakers(page, legislators) {
  const departureDates = new Map([
    ["13|CLAY", "1814-01-19"],
    ["16|CLAY", "1820-10-28"],
    ["23|STEVENSON", "1834-06-02"],
    ["40|COLFAX", "1869-03-03"],
    ["44|KERR", "1876-08-19"],
    ["73|RAINEY", "1934-08-19"],
    ["74|BYRNS", "1936-06-04"],
    ["76|BANKHEAD", "1940-09-15"],
    ["87|RAYBURN", "1961-11-16"],
    ["101|WRIGHT", "1989-06-06"],
    ["114|BOEHNER", "2015-10-29"],
    ["118|MCCARTHY", "2023-10-03"],
  ]);
  const rowsByCongress = new Map();

  for (const { congress, cells, html } of rowsForPage(page, "speakers")) {
    // The "Date Elected" cell is sorted by its YYYYMMDD date.
    const electedMatch = html.match(/sort="(\d{8})"/g)?.at(-1)?.match(/(\d{8})/);
    if (!electedMatch) throw new Error(`House Speakers: no election date in Congress ${congress}`);
    const elected = electedMatch[1].replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
    const sourceName = textFromHtml(cells[1]);
    const state = textFromHtml(cells[2]);
    const surname = sourceName.split(",")[0].replace(/[^A-Z]/g, "");
    const [, congressEnd] = congressDateRange(congress);
    const person = legislators.find((candidate) =>
      candidate.name.last.toUpperCase().replace(/[^A-Z]/g, "") === surname
      && candidate.terms.some((term) => term.type === "rep" && term.state === state && term.start <= elected && term.end >= elected),
    );
    const term = person?.terms.find((candidate) => candidate.type === "rep" && candidate.state === state && candidate.start <= elected && candidate.end >= elected);
    const speakers = rowsByCongress.get(congress) ?? [];
    speakers.push({
      id: person?.id.bioguide ?? `HOUSE-SPEAKER-${congress}-${speakers.length}`,
      n: person ? fullName(person) : sourceName.split(",").reverse().join(" ").trim(),
      t: "Speaker of the House",
      g: "Congressional leadership",
      o: 40,
      h: "rep",
      p: term?.party ?? null,
      s: state,
      x: false,
      w: legislatorWikipediaUrl(person),
      a: elected,
      z: congressEnd,
      surname,
    });
    rowsByCongress.set(congress, speakers);
  }

  const speakers = [];
  for (const [congress, rows] of rowsByCongress) {
    rows.sort((a, b) => a.a.localeCompare(b.a));
    rows.forEach((row, index) => {
      const departure = departureDates.get(`${congress}|${row.surname}`);
      const speaker = { ...row };
      delete speaker.surname;
      speaker.z = departure ?? rows[index + 1]?.a ?? speaker.z;
      speakers.push(speaker);
    });
  }
  return speakers;
}

export function houseFloorLeaders(pages, legislators) {
  const sources = [
    [pages.majorityLeaders, "majorityLeaders", "House majority leader", 42],
    [pages.minorityLeaders, "minorityLeaders", "House minority leader", 44],
  ];
  const leaders = [];
  for (const [page, key, title, order] of sources) {
    for (const { congress, cells } of rowsForPage(page, key)) {
      const party = textFromHtml(cells[2]);
      const state = textFromHtml(cells[3]);
      const sourceName = textFromHtml(cells[1]);
      const surname = sourceName.split(",")[0].replace(/[^A-Z]/g, "");
      const [start, end] = congressDateRange(congress);
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
        s: state,
        x: false,
        w: legislatorWikipediaUrl(person),
        a: exactRole?.start ?? start,
        z: exactRole?.end ?? end,
      });
    }
  }
  return leaders;
}
