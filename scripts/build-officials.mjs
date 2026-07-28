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
  ["Q940135", "Secretary of the Navy", "Cabinet", 12.1],
  ["Q1591470", "Secretary of the Army", "Cabinet", 12.2],
  ["Q261746", "Secretary of the Air Force", "Cabinet", 12.3],
  ["Q636207", "Attorney General", "Cabinet", 13],
  ["Q1753094", "Postmaster General", "Cabinet", 14],
  ["Q2287650", "Secretary of the Interior", "Cabinet", 14],
  ["Q1029955", "Secretary of Agriculture", "Cabinet", 15],
  ["Q2003296", "Secretary of Commerce", "Cabinet", 16],
  ["Q11285119", "Secretary of Commerce and Labor", "Cabinet", 16],
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
  ["Q732029", "Counselor to the President", "Cabinet-level", 25.1],
  ["Q1296423", "White House Counsel", "Cabinet-level", 25.2],
  ["Q27907217", "Chair of the Council of Economic Advisers", "Cabinet-level", 26.1],
  ["Q1414246", "National Security Advisor", "Cabinet-level", 25.3],
  ["Q1227524", "Director of Central Intelligence", "Cabinet-level", 31.1],
  ["Q11147", "Chief Justice", "Supreme Court", 35],
  ["Q11144", "Associate Justice", "Supreme Court", 36],
  ["Q912994", "Speaker of the House", "Congressional leadership", 40, "rep"],
  ["Q1140848", "President pro tempore", "Congressional leadership", 41, "sen"],
  ["Q28530268", "Senate majority leader", "Congressional leadership", 42, "sen"],
  ["Q100734881", "Senate minority leader", "Congressional leadership", 44, "sen"],
  ["Q108913856", "House majority leader", "Congressional leadership", 42, "rep"],
  ["Q138208451", "House minority leader", "Congressional leadership", 44, "rep"],
];

const created = {
  "Secretary of State": "1789-09-15",
  "Secretary of the Treasury": "1789-09-11",
  "Secretary of War": "1789-08-07",
  "Secretary of the Navy": "1798-06-18",
  "Secretary of the Army": "1947-09-18",
  "Secretary of the Air Force": "1947-09-18",
  "Postmaster General": "1829-03-09",
  "Attorney General": "1789-09-24",
  "Secretary of the Interior": "1849-03-03",
  "Secretary of Agriculture": "1889-02-15",
  "Secretary of Commerce": "1913-03-04",
  "Secretary of Commerce and Labor": "1903-02-14",
  "Secretary of Labor": "1913-03-04",
  "Secretary of Health, Education & Welfare": "1953-04-11",
  "Secretary of Health & Human Services": "1980-05-04",
  "Secretary of Housing & Urban Development": "1965-09-09",
  "Secretary of Transportation": "1966-10-15",
  "Secretary of Energy": "1977-08-04",
  "Secretary of Education": "1980-05-04",
  "Secretary of Veterans Affairs": "1989-03-15",
  "Secretary of Homeland Security": "2003-01-24",
  "Secretary of Defense": "1947-09-17",
  "White House Chief of Staff": "1946-01-20",
  "EPA Administrator": "1970-12-02",
  "Director of the Office of Management & Budget": "1921-06-10",
  "United States Trade Representative": "1962-10-11",
  "U.S. Ambassador to the United Nations": "1947-01-17",
  "Small Business Administrator": "1953-07-30",
  "Director of National Intelligence": "2005-04-21",
  "Director of the Central Intelligence Agency": "2004-12-17",
  "Counselor to the President": "1969-01-20",
  "White House Counsel": "1943-01-01",
  "Chair of the Council of Economic Advisers": "1946-02-20",
  "National Security Advisor": "1953-03-23",
  "Director of Central Intelligence": "1946-01-23",
  "Chief Justice": "1789-09-26",
  "Associate Justice": "1789-09-26",
};

const discontinued = {
  "Secretary of War": "1947-09-18",
  "Secretary of the Navy": "1949-08-10",
  "Secretary of the Army": "1949-08-10",
  "Secretary of the Air Force": "1949-08-10",
  "Postmaster General": "1971-07-01",
  "Secretary of Commerce and Labor": "1913-03-04",
  "Secretary of Health, Education & Welfare": "1980-05-04",
  "Director of Central Intelligence": "2005-04-21",
};

// The Postal Service historian publishes one continuous roster with exact dates.
// Postmasters General joined the Cabinet under Andrew Jackson on March 9, 1829,
// and left it when the Postal Reorganization Act took effect on July 1, 1971.
const cabinetPostmastersGeneral = [
  ["William T. Barry", "1829-03-09"],
  ["Amos Kendall", "1835-05-01"],
  ["John Milton Niles", "1840-05-19"],
  ["Francis Granger", "1841-03-06"],
  ["Charles A. Wickliffe", "1841-09-13"],
  ["Cave Johnson", "1845-03-05"],
  ["Jacob Collamer", "1849-03-08"],
  ["Nathan K. Hall", "1850-07-23"],
  ["Samuel Dickinson Hubbard", "1852-08-31"],
  ["James Campbell", "1853-03-08"],
  ["Aaron V. Brown", "1857-03-06"],
  ["Joseph Holt", "1859-03-14"],
  ["Horatio King", "1861-02-12"],
  ["Montgomery Blair", "1861-03-05"],
  ["William Dennison Jr.", "1864-09-24"],
  ["Alexander Randall", "1866-07-25"],
  ["John Creswell", "1869-03-05"],
  ["James William Marshall", "1874-07-03"],
  ["Marshall Jewell", "1874-08-24"],
  ["James Noble Tyner", "1876-07-12"],
  ["David M. Key", "1877-03-12"],
  ["Horace Maynard", "1880-06-02"],
  ["Thomas Lemuel James", "1881-03-05"],
  ["Timothy O. Howe", "1881-12-20"],
  ["Walter Q. Gresham", "1883-04-03"],
  ["Frank Hatton", "1884-10-14"],
  ["William Freeman Vilas", "1885-03-06"],
  ["Donald M. Dickinson", "1888-01-16"],
  ["John Wanamaker", "1889-03-05"],
  ["Wilson S. Bissell", "1893-03-06"],
  ["William Lyne Wilson", "1895-03-01"],
  ["James Albert Gary", "1897-03-05"],
  ["Charles Emory Smith", "1898-04-21"],
  ["Henry Clay Payne", "1902-01-15"],
  ["Robert Wynne", "1904-10-10"],
  ["George B. Cortelyou", "1905-03-07"],
  ["George von Lengerke Meyer", "1907-03-05"],
  ["Frank Harris Hitchcock", "1909-03-06"],
  ["Albert S. Burleson", "1913-03-05"],
  ["Will H. Hays", "1921-03-04"],
  ["Hubert Work", "1922-03-04"],
  ["Harry Stewart New", "1923-03-05"],
  ["Walter Folger Brown", "1929-03-06"],
  ["James Farley", "1933-03-06"],
  ["Frank Comerford Walker", "1940-09-11"],
  ["Robert E. Hannegan", "1945-06-30"],
  ["Jesse M. Donaldson", "1947-12-16"],
  ["Arthur Summerfield", "1953-01-21"],
  ["J. Edward Day", "1961-01-21"],
  ["John A. Gronouski", "1963-09-30"],
  ["Lawrence O'Brien", "1965-11-03"],
  ["W. Marvin Watson", "1968-04-26"],
  ["Winton M. Blount", "1969-01-22"],
];

const commerceAndLaborSecretaries = [
  ["George B. Cortelyou", "1903-02-18", "1904-07-01"],
  ["Victor H. Metcalf", "1904-07-01", "1906-12-17"],
  ["Oscar Straus", "1906-12-17", "1909-03-06"],
  ["Charles Nagel", "1909-03-06", "1913-03-04"],
];

function wikipediaUrlForName(name) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(name).replaceAll("%20", "_")}`;
}

function formerCabinetOfficeholders() {
  const postmasters = cabinetPostmastersGeneral.map(([name, start], index) => ({
    id: `POSTMASTER-GENERAL-${index + 1}`,
    n: name,
    t: "Postmaster General",
    g: "Cabinet",
    o: 14,
    h: null,
    p: null,
    x: false,
    w: wikipediaUrlForName(name),
    a: start,
    z: cabinetPostmastersGeneral[index + 1]?.[1] ?? discontinued["Postmaster General"],
  }));
  const commerceAndLabor = commerceAndLaborSecretaries.map(([name, start, end], index) => ({
    id: `COMMERCE-AND-LABOR-${index + 1}`,
    n: name,
    t: "Secretary of Commerce and Labor",
    g: "Cabinet",
    o: 16,
    h: null,
    p: null,
    x: false,
    w: wikipediaUrlForName(name),
    a: start,
    z: end,
  }));
  return [...postmasters, ...commerceAndLabor];
}

function intermittentCabinetOfficeholders() {
  return [
    ["WHC-PHILIP-BUCHEN", "Philip W. Buchen", "White House Counsel", 25.2, false, "1974-08-09", "1977-01-20"],
    ["USTR-ALAN-WOLFF-ACTING", "Alan Wm. Wolff", "United States Trade Representative", 28, true, "1977-01-20", "1977-03-30"],
    ["USTR-ROBERT-STRAUSS", "Robert S. Strauss", "United States Trade Representative", 28, false, "1977-03-30", "1979-08-17"],
    ["USTR-REUBIN-ASKEW", "Reubin Askew", "United States Trade Representative", 28, false, "1979-10-01", "1981-01-01"],
    ["USTR-WILLIAM-BROCK", "William E. Brock III", "United States Trade Representative", 28, false, "1981-01-22", "1985-04-29"],
    ["USTR-CLAYTON-YEUTTER", "Clayton Yeutter", "United States Trade Representative", 28, false, "1985-07-01", "1989-01-20"],
    ["USTR-CARLA-HILLS", "Carla Anderson Hills", "United States Trade Representative", 28, false, "1989-02-06", "1993-01-20"],
    ["USTR-MICKEY-KANTOR", "Mickey Kantor", "United States Trade Representative", 28, false, "1993-01-22", "1996-04-12"],
    ["USTR-CHARLENE-BARSHEFSKY-ACTING", "Charlene Barshefsky", "United States Trade Representative", 28, true, "1996-04-12", "1997-03-18"],
    ["USTR-CHARLENE-BARSHEFSKY", "Charlene Barshefsky", "United States Trade Representative", 28, false, "1997-03-18", "2001-01-20"],
    ["USTR-PETER-ALLGEIER-ACTING", "Peter Allgeier", "United States Trade Representative", 28, true, "2005-02-22", "2005-05-17"],
    ["USTR-ROB-PORTMAN", "Rob Portman", "United States Trade Representative", 28, false, "2005-05-17", "2006-05-29"],
    ["USTR-SUSAN-SCHWAB-ACTING", "Susan Schwab", "United States Trade Representative", 28, true, "2006-05-29", "2006-06-08"],
    ["USTR-SUSAN-SCHWAB", "Susan Schwab", "United States Trade Representative", 28, false, "2006-06-08", "2009-01-20"],
    ["CEA-JARED-BERNSTEIN", "Jared Bernstein", "Chair of the Council of Economic Advisers", 26.1, false, "2023-07-10", "2025-01-20"],
    ["ONDCP-JOHN-WALTERS-ACTING", "John P. Walters", "Director of National Drug Control Policy", 30.1, true, "1993-01-20", "1993-07-19"],
    ["ONDCP-LEE-BROWN", "Lee P. Brown", "Director of National Drug Control Policy", 30.1, false, "1993-07-19", "1996-01-20"],
    ["ONDCP-BARRY-MCCAFFREY", "Barry McCaffrey", "Director of National Drug Control Policy", 30.1, false, "1996-02-29", "2001-01-20"],
    ["ONDCP-EDWARD-JURITH-ACTING", "Edward Jurith", "Director of National Drug Control Policy", 30.1, true, "2001-01-20", "2001-12-07"],
    ["ONDCP-JOHN-WALTERS", "John P. Walters", "Director of National Drug Control Policy", 30.1, false, "2001-12-07", "2009-01-20"],
    ["FEMA-JAMES-LEE-WITT", "James Lee Witt", "FEMA Administrator", 30.2, false, "1996-02-26", "2001-01-20"],
    ["SBA-PHILIP-LADER", "Philip Lader", "Small Business Administrator", 30, false, "1994-10-08", "1997-02-11"],
    ["SBA-AIDA-ALVAREZ", "Aida Álvarez", "Small Business Administrator", 30, false, "1997-03-07", "2001-01-20"],
    ["SBA-KAREN-MILLS", "Karen Mills", "Small Business Administrator", 30, false, "2012-01-13", "2013-09-01"],
    ["SBA-JEANNE-HULIT-ACTING", "Jeanne Hulit", "Small Business Administrator", 30, true, "2013-09-01", "2014-02-07"],
    ["SBA-MARIANNE-MARKOWITZ-ACTING", "Marianne Markowitz", "Small Business Administrator", 30, true, "2014-02-07", "2014-04-07"],
    ["OSTP-ERIC-LANDER", "Eric Lander", "Director of the Office of Science & Technology Policy", 33, false, "2021-06-02", "2022-02-18"],
    ["OSTP-ALONDRA-NELSON-ACTING", "Alondra Nelson", "Director of the Office of Science & Technology Policy", 33, true, "2022-02-18", "2022-10-03"],
    ["OSTP-ARATI-PRABHAKAR", "Arati Prabhakar", "Director of the Office of Science & Technology Policy", 33, false, "2022-10-03", "2025-01-20"],
  ].map(([id, name, title, order, acting, start, end]) => ({
    id,
    n: name,
    t: title,
    g: "Cabinet-level",
    o: order,
    h: null,
    p: null,
    x: acting,
    w: wikipediaUrlForName(name),
    a: start,
    z: end,
  }));
}

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

const vicePresidentStates = new Map(Object.entries({
  "John Adams": "MA", "Thomas Jefferson": "VA", "Aaron Burr": "NY", "George Clinton": "NY",
  "Elbridge Gerry": "MA", "Daniel D. Tompkins": "NY", "John C. Calhoun": "SC", "Martin Van Buren": "NY",
  "Richard Mentor Johnson": "KY", "John Tyler": "VA", "George M. Dallas": "PA", "Millard Fillmore": "NY",
  "William R. King": "AL", "John C. Breckinridge": "KY", "Hannibal Hamlin": "ME", "Andrew Johnson": "TN",
  "Schuyler Colfax": "IN", "Henry Wilson": "MA", "William A. Wheeler": "NY", "Chester A. Arthur": "NY",
  "Thomas A. Hendricks": "IN", "Levi P. Morton": "NY", "Adlai Stevenson I": "IL", "Garret Hobart": "NJ",
  "Theodore Roosevelt": "NY", "Charles W. Fairbanks": "IN", "James S. Sherman": "NY", "Thomas R. Marshall": "IN",
  "Calvin Coolidge": "MA", "Charles G. Dawes": "IL", "Charles Curtis": "KS", "John Nance Garner": "TX",
  "Henry A. Wallace": "IA", "Harry S. Truman": "MO", "Alben W. Barkley": "KY", "Richard Nixon": "CA",
  "Lyndon B. Johnson": "TX", "Hubert Humphrey": "MN", "Spiro Agnew": "MD", "Gerald Ford": "MI",
  "Nelson Rockefeller": "NY", "Nelson Aldrich Rockefeller": "NY", "Walter Mondale": "MN", "George H. W. Bush": "TX", "Dan Quayle": "IN",
  "Al Gore": "TN", "Dick Cheney": "WY", "Joe Biden": "DE", "Mike Pence": "IN", "Kamala Harris": "CA",
  "JD Vance": "OH",
}));

const vicePresidentPartyOverrides = new Map(Object.entries({
  "John Adams": "Federalist",
  "John Nance Garner": "Democrat",
  "Henry A. Wallace": "Democrat",
  "Harry S. Truman": "Democrat",
}));

const falseOfficeClaims = new Set([
  "Speaker of the House|James Madison",
  "Speaker of the House|John Nance Garner",
  "Speaker of the House|Jack Kemp",
  "Secretary of the Interior|Herbert Alton Meyer",
  "Director of the Central Intelligence Agency|Pito Grotesco",
  "White House Counsel|Philip W. Buchen",
  "Small Business Administrator|Marianne Markowitz",
]);

const leadershipRoleMap = new Map([
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

function congressDateRange(congress) {
  const startYear = 1789 + (congress - 1) * 2;
  if (congress <= 72) return [`${startYear}-03-04`, `${startYear + 2}-03-04`];
  if (congress === 73) return ["1933-03-04", "1935-01-03"];
  return [`${startYear}-01-03`, `${startYear + 2}-01-03`];
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
    const congressMatch = congressText.match(/(\d+)(?:st|nd|rd|th) Congress/);
    if (!congressMatch) continue;
    const congress = Number(congressMatch[1]);
    const [congressStart, congressEnd] = congressDateRange(congress);
    for (const [cellIndex, title, order] of [[1, "Senate majority leader", 42], [2, "Senate minority leader", 44]]) {
      const people = [...cells[cellIndex].matchAll(/<a[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>\s*\(([DRI])-([A-Z]{2})\)<\/a>/g)]
        .map((match) => ({ name: textFromHtml(match[1]), party: match[2] === "D" ? "Democrat" : match[2] === "R" ? "Republican" : "Independent", state: match[3] }));
      const dates = transitions.get(`${congress}|${title}`) ?? [];
      people.forEach((person, index) => leaders.push({
        id: `SENATE-${congress}-${title}-${index}`,
        n: person.name,
        t: title,
        g: "Congressional leadership",
        o: order,
        h: "sen",
        p: person.party,
        s: person.state,
        x: false,
        a: index === 0 ? congressStart : dates[index - 1] ?? congressStart,
        z: index < people.length - 1 ? dates[index] ?? congressEnd : congressEnd,
      }));
    }
  }
  const withoutExceptionalCongresses = leaders.filter((leader) => ![107, 117].some((congress) => leader.id.startsWith(`SENATE-${congress}-`)));
  return withoutExceptionalCongresses.concat([
    [107, "Senate majority leader", 42, "Thomas A. Daschle", "Democrat", "SD", "2001-01-03", "2001-01-20"],
    [107, "Senate majority leader", 42, "Trent Lott", "Republican", "MS", "2001-01-20", "2001-06-06"],
    [107, "Senate majority leader", 42, "Thomas A. Daschle", "Democrat", "SD", "2001-06-06", "2003-01-03"],
    [107, "Senate minority leader", 44, "Trent Lott", "Republican", "MS", "2001-01-03", "2001-01-20"],
    [107, "Senate minority leader", 44, "Thomas A. Daschle", "Democrat", "SD", "2001-01-20", "2001-06-06"],
    [107, "Senate minority leader", 44, "Trent Lott", "Republican", "MS", "2001-06-06", "2003-01-03"],
    [117, "Senate majority leader", 42, "Mitch McConnell", "Republican", "KY", "2021-01-03", "2021-01-20"],
    [117, "Senate majority leader", 42, "Charles E. Schumer", "Democrat", "NY", "2021-01-20", "2023-01-03"],
    [117, "Senate minority leader", 44, "Charles E. Schumer", "Democrat", "NY", "2021-01-03", "2021-01-20"],
    [117, "Senate minority leader", 44, "Mitch McConnell", "Republican", "KY", "2021-01-20", "2023-01-03"],
  ].map(([congress, title, order, name, party, state, start, end], index) => ({
    id: `SENATE-${congress}-${title}-${index}`,
    n: name,
    t: title,
    g: "Congressional leadership",
    o: order,
    h: "sen",
    p: party,
    s: state,
    x: false,
    a: start,
    z: end,
  })));
}

function leadershipYearStart(year) {
  if (year <= 1933 && year % 2 === 1) return `${year}-03-04`;
  if (year >= 1935 && year % 2 === 1) return `${year}-01-03`;
  return `${year}-01-01`;
}

async function senatePartyWhips(legislators, floorLeaders) {
  const response = await fetch("https://www.senate.gov/about/parties-leadership/party-whips.htm", {
    headers: { "User-Agent": "AmericanStateAtlas/1.0" },
  });
  if (!response.ok) throw new Error(`Senate whip query failed: ${response.status}`);
  const html = await response.text();
  const partyRows = new Map([["Republican", []], ["Democrat", []]]);

  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
    if (cells.length < 2) continue;
    const identity = cells[0].match(/index=([A-Z]\d+)/i);
    const partyMatch = textFromHtml(cells[0]).match(/\(([DR])-([A-Z]{2})\)/);
    const termText = textFromHtml(cells[1].replace(/<span[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/span>/gi, ""));
    const term = termText.match(/(\d{4})(?:[-–—](present|\d{4}))?/i);
    if (!identity || !partyMatch || !term) continue;
    const party = partyMatch[1] === "R" ? "Republican" : "Democrat";
    const startYear = Number(term[1]);
    const endYear = term[2] && term[2].toLowerCase() !== "present" ? Number(term[2]) : null;
    const person = legislators.find((candidate) => candidate.id.bioguide === identity[1].toUpperCase());
    const nameMatch = cells[0].match(/<span[^>]*style=""[^>]*>([\s\S]*?)<\/span>/);
    partyRows.get(party).push({
      id: identity[1].toUpperCase(),
      n: person ? fullName(person) : textFromHtml(nameMatch?.[1] ?? cells[0]).replace(/\s*\([DR]-[A-Z]{2}\)\s*$/, ""),
      p: party,
      s: partyMatch[2],
      w: legislatorWikipediaUrl(person),
      a: party === "Democrat" && startYear === 1913 ? "1913-05-28" : leadershipYearStart(startYear),
      listedEnd: endYear ? leadershipYearStart(endYear) : null,
    });
  }

  const whips = [];
  for (const rows of partyRows.values()) {
    rows.sort((a, b) => a.a.localeCompare(b.a));
    rows.forEach((row, index) => {
      const end = row.listedEnd && (!rows[index + 1] || row.listedEnd < rows[index + 1].a)
        ? row.listedEnd
        : rows[index + 1]?.a ?? null;
      for (const leader of floorLeaders.filter((candidate) => candidate.t === "Senate majority leader" && candidate.p)) {
        const start = row.a > leader.a ? row.a : leader.a;
        const finish = !end ? leader.z : !leader.z ? end : end < leader.z ? end : leader.z;
        if (finish && start >= finish) continue;
        const majority = leader.p === row.p;
        whips.push({
          id: row.id,
          n: row.n,
          t: majority ? "Senate majority whip" : "Senate minority whip",
          g: "Congressional leadership",
          o: majority ? 43 : 45,
          h: "sen",
          p: row.p,
          s: row.s,
          x: false,
          w: row.w,
          a: start,
          z: finish,
        });
      }
    });
  }
  return whips;
}

function houseMajorityParty(legislators, start, end) {
  const byParty = new Map();
  for (const person of legislators) {
    const party = person.terms.find((term) => term.type === "rep" && term.start < end && term.end >= start)?.party;
    if (party) byParty.set(party, (byParty.get(party) ?? 0) + 1);
  }
  return [...byParty.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

async function housePartyWhips(legislators) {
  const sources = [
    ["https://history.house.gov/People/Office/Democratic-Whips/", "Democrat"],
    ["https://history.house.gov/People/Office/Republican-Whips/", "Republican"],
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

  for (const [url, party] of sources) {
    const response = await fetch(url, { headers: { "User-Agent": "AmericanStateAtlas/1.0" } });
    if (!response.ok) throw new Error(`House whip query failed: ${response.status}`);
    const html = await response.text();
    const rowsByCongress = new Map();
    for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
      if (cells.length < 3) continue;
      const congressMatch = textFromHtml(cells[0]).match(/(\d+)(?:st|nd|rd|th)/);
      if (!congressMatch) continue;
      const congress = Number(congressMatch[1]);
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

async function houseSpeakers(legislators) {
  const response = await fetch("https://history.house.gov/people/office/speakers-list/", {
    headers: { "User-Agent": "AmericanStateAtlas/1.0" },
  });
  if (!response.ok) throw new Error(`House Speaker query failed: ${response.status}`);
  const html = await response.text();
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

  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
    if (cells.length < 4) continue;
    const congressMatch = textFromHtml(cells[0]).match(/(\d+)(?:st|nd|rd|th)/);
    const electedMatch = row[1].match(/sort="(\d{8})"/g)?.at(-1)?.match(/(\d{8})/);
    if (!congressMatch || !electedMatch) continue;
    const congress = Number(congressMatch[1]);
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

async function houseFloorLeaders(legislators) {
  const sources = [
    ["https://history.house.gov/People/Office/Majority-Leaders/", "House majority leader", 42],
    ["https://history.house.gov/People/Office/Minority-Leaders/", "House minority leader", 44],
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

function mergeSameOfficeholder(rows) {
  const merged = [];
  for (const row of [...rows].sort((a, b) => a.t.localeCompare(b.t) || a.n.localeCompare(b.n) || a.a.localeCompare(b.a))) {
    const previous = merged.at(-1);
    const touches = previous?.z && row.a <= nextDay(previous.z);
    const overlapsOpenTerm = previous && !previous.z;
    if (previous && previous.n === row.n && previous.t === row.t && (touches || overlapsOpenTerm)) {
      previous.a = previous.a < row.a ? previous.a : row.a;
      previous.z = !previous.z || !row.z ? null : (previous.z > row.z ? previous.z : row.z);
      previous.p ??= row.p;
      previous.s ??= row.s;
      previous.w ??= row.w;
      previous.x ||= row.x;
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
const wikipediaCabinetOfficeholders = JSON.parse(
  await readFile(path.join(root, "data/cabinet-officeholders.json"), "utf8"),
);
const wikipediaCabinetTitles = new Set(wikipediaCabinetOfficeholders.map((official) => official.t));
const wikipediaCabinetByTitle = Map.groupBy(wikipediaCabinetOfficeholders, (official) => official.t);

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
    s: null,
    x: false,
    w: row.article?.value ?? null,
    a: row.start?.value?.slice(0, 10) ?? null,
    z: row.end?.value?.slice(0, 10) ?? null,
  };
}).filter((official) =>
  official.a
  && (!created[official.t] || official.a >= created[official.t])
  && (!discontinued[official.t] || official.a < discontinued[official.t])
  && !falseOfficeClaims.has(`${official.t}|${official.n}`),
);

for (const official of officials) {
  const end = discontinued[official.t];
  if (end && (!official.z || official.z > end)) official.z = end;
}

officials = officials.filter((official) => ![
  "Speaker of the House",
  "Senate majority leader",
  "Senate minority leader",
  "House majority leader",
  "House minority leader",
  "Postmaster General",
  "Secretary of Commerce and Labor",
].includes(official.t) && !(
  wikipediaCabinetTitles.has(official.t)
  && wikipediaCabinetByTitle.get(official.t).some((wikipediaOfficial) =>
    wikipediaOfficial.n !== official.n
    && official.a < (wikipediaOfficial.z ?? "9999-12-31")
    && wikipediaOfficial.a < (official.z ?? "9999-12-31")
  )
));
officials.push(...wikipediaCabinetOfficeholders);
officials.push(...formerCabinetOfficeholders());
officials.push(...intermittentCabinetOfficeholders());
officials.push(...await houseSpeakers(legislators));
const senateLeaders = await senateFloorLeaders();
officials.push(...senateLeaders);
officials.push(...await senatePartyWhips(legislators, senateLeaders));
officials.push(...await houseFloorLeaders(legislators));
officials.push(...await housePartyWhips(legislators));

for (const person of legislators) {
  for (const role of person.leadership_roles ?? []) {
    const mapped = leadershipRoleMap.get(role.title);
    if (!mapped) continue;
    const [title, order, chamber] = mapped;
    if (title === "Speaker of the House" || title === "Senate majority leader" || title === "Senate minority leader") continue;
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
      s: term?.state ?? null,
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
    ) ?? matchedLegislator?.terms.find((candidate) =>
      candidate.type === official.h && (!official.z || candidate.start < official.z) && candidate.end >= official.a,
    ) ?? matchedLegislator?.terms.filter((candidate) => candidate.type === official.h && candidate.start <= official.a).at(-1);
    official.p = term?.party ?? null;
  }
  if (official.g === "Congressional leadership" && !official.s) {
    const term = matchedLegislator?.terms.find((candidate) =>
      candidate.type === official.h && candidate.start <= official.a && candidate.end >= official.a,
    ) ?? matchedLegislator?.terms.find((candidate) =>
      candidate.type === official.h && (!official.z || candidate.start < official.z) && candidate.end >= official.a,
    ) ?? matchedLegislator?.terms.filter((candidate) => candidate.type === official.h && candidate.start <= official.a).at(-1);
    official.s = term?.state ?? null;
  }
  if (official.t === "President") official.p = presidentParties.get(official.n) ?? null;
}

officials = mergeSameOfficeholder(officials);

const presidents = officials.filter((official) => official.t === "President");
for (const official of officials) {
  if (official.t === "Vice President") {
    official.p = presidents.find((president) => president.a <= official.a && (!president.z || president.z > official.a))?.p
      ?? vicePresidentPartyOverrides.get(official.n)
      ?? null;
  }
}

officials.push(...officials.filter((official) => official.t === "Vice President").map((official) => ({
  ...official,
  t: "President of the Senate",
  g: "Congressional leadership",
  o: 40,
  h: "sen",
  s: vicePresidentStates.get(official.n) ?? null,
})));

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
