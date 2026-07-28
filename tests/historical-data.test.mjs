import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { feature } from "topojson-client";
import { isConfederateState } from "../app/confederate-state.mjs";
import { houseBoundaryBelongsToPlan, houseMembersForDistrict, houseStatewideAtLargeMembers } from "../app/house-members.mjs";
import { reconstructionDistrictForState } from "../app/reconstruction-district.mjs";
import { isEditableKeyboardTarget, scrubStepForDuration } from "../app/date-scrub.mjs";
import { preconstitutionalCongressLabel, presidentOfCongress, vermontPolityForDate } from "../app/preconstitutional.mjs";
import { officialOfficesForDate } from "../app/cabinet-offices.mjs";

const members = JSON.parse(await readFile(new URL("../public/data/members.json", import.meta.url), "utf8"));
const officials = JSON.parse(await readFile(new URL("../public/data/officials.json", import.meta.url), "utf8"));
const topology = JSON.parse(await readFile(new URL("../public/data/historical-polities.json", import.meta.url), "utf8"));
const polities = feature(topology, Object.values(topology.objects)[0]).features;
const preconstitutional = JSON.parse(await readFile(new URL("../public/data/preconstitutional.json", import.meta.url), "utf8"));

function activeHouse(date) {
  return members.filter((member) => member.t === "rep" && member.a <= date && member.z > date);
}

function activeSenate(date, state) {
  return members.filter((member) => member.t === "sen" && member.s === state && member.a <= date && member.z > date);
}

function activeOfficials(date) {
  return officials.filter((official) => official.a <= date && (!official.z || official.z > date));
}

function activeCabinet(date) {
  const visibleTitles = new Set(officialOfficesForDate("Cabinet", date).map((office) => office.title));
  return activeOfficials(date).filter((official) => ["Cabinet", "Cabinet-level"].includes(official.g) && visibleTitles.has(official.t));
}

test("the Second Congress begins with its 69-member elected House", () => {
  assert.equal(activeHouse("1791-03-04").length, 69);
});

test("the atlas distinguishes the two pre-Constitution national congresses", () => {
  assert.equal(preconstitutionalCongressLabel("1776-07-04"), "Second Continental Congress");
  assert.equal(preconstitutionalCongressLabel("1781-03-01"), "Congress of the Confederation");
  assert.equal(presidentOfCongress("1776-07-04")?.n, "John Hancock");
  assert.equal(presidentOfCongress("1788-02-01")?.n, "Cyrus Griffin");
});

test("annual pre-Constitution rosters cover all thirteen state delegations", () => {
  for (const date of ["1776-07-04", "1781-03-01", "1788-01-01"]) {
    const active = preconstitutional.filter((delegate) => delegate.a <= date && delegate.z > date);
    assert.equal(new Set(active.map((delegate) => delegate.s)).size, 13, date);
    assert.ok(active.every((delegate) => delegate.w.startsWith("https://en.wikipedia.org/wiki/")));
  }
});

test("Vermont is mapped with New York until the Vermont Republic declared independence", () => {
  assert.equal(vermontPolityForDate("1776-07-04"), "New York");
  assert.equal(vermontPolityForDate("1777-01-14"), "New York");
  assert.equal(vermontPolityForDate("1777-01-15"), "Vermont Republic");
});

test("held left and right arrows accelerate historical date scrubbing", () => {
  assert.equal(scrubStepForDuration(0), 1);
  assert.equal(scrubStepForDuration(1_000), 2);
  assert.equal(scrubStepForDuration(2_000), 5);
  assert.equal(scrubStepForDuration(4_000), 14);
  assert.equal(scrubStepForDuration(8_000), 45);
  assert.equal(isEditableKeyboardTarget({ tagName: "INPUT" }), true);
  assert.equal(isEditableKeyboardTarget({ tagName: "DIV", isContentEditable: false }), false);
});

test("independent senators retain their caucus affiliation", () => {
  const sanders = members.find((member) => member.id === "S000033" && member.a === "2007-01-03");
  assert.equal(sanders.p, "Independent");
  assert.equal(sanders.c, "Democrat");
});

test("current House totals exclude six non-voting territorial delegates", () => {
  const nonVoting = new Set(["AS", "DC", "GU", "MP", "PR", "VI"]);
  assert.equal(activeHouse("2026-07-26").filter((member) => !nonVoting.has(member.s)).length, 431);
  assert.equal(activeHouse("2026-07-26").length, 437);
});

test("a Senate vacancy remains visible until an appointed successor takes office", () => {
  const beforeAppointment = members.filter((member) => member.t === "sen" && member.s === "SC" && member.a <= "2026-07-12" && member.z > "2026-07-12");
  const afterAppointment = members.filter((member) => member.t === "sen" && member.s === "SC" && member.a <= "2026-07-13" && member.z > "2026-07-13");
  assert.equal(beforeAppointment.length, 1);
  assert.deepEqual(afterAppointment.map((member) => member.n).sort(), ["Darline Graham", "Tim Scott"]);
});

test("regular Senate terms begin on March 4 rather than the delayed session opening", () => {
  assert.deepEqual(activeSenate("1861-06-01", "NH").map((member) => member.k).sort(), [2, 3]);
  assert.deepEqual(activeSenate("1863-06-01", "CA").map((member) => member.k).sort(), [1, 3]);
  assert.deepEqual(activeSenate("1875-06-01", "NY").map((member) => member.k).sort(), [1, 3]);
  assert.equal(members.find((member) => member.n === "Edgar Cowan" && member.t === "sen")?.a, "1861-03-04");
  assert.equal(members.find((member) => member.n === "John Conness" && member.t === "sen")?.a, "1863-03-04");
  assert.equal(members.find((member) => member.n === "Francis Kernan" && member.t === "sen")?.a, "1875-03-04");
});

test("Senate terms begin on the constitutional date across every mass session-opening cohort", () => {
  const delayedStarts = Map.groupBy(
    members.filter((member) => {
      if (member.t !== "sen") return false;
      const year = Number(member.a.slice(0, 4));
      const constitutionalStart = `${year}-${year <= 1933 ? "03-04" : "01-03"}`;
      return year % 2 === 1 && member.a > constitutionalStart && member.a.slice(0, 4) === String(year);
    }),
    (member) => member.a,
  );
  assert.equal([...delayedStarts.values()].some((cohort) => cohort.length >= 3), false);
  assert.equal(activeSenate("1921-03-04", "NY").length, 2);
  assert.equal(activeSenate("1929-03-04", "MI").length, 2);
  assert.equal(activeSenate("1931-03-04", "MA").length, 2);
  assert.equal(activeSenate("1933-03-04", "AZ").length, 2);
});

test("Cabinet offices do not appear before their creation and have one active holder", () => {
  assert.equal(activeOfficials("1800-01-01").some((official) => official.t === "Secretary of Agriculture"), false);
  assert.equal(activeOfficials("1970-01-01").some((official) => official.t === "Secretary of Energy"), false);
  const currentCabinet = activeOfficials("2026-07-26").filter((official) => official.g === "Cabinet");
  const byTitle = Map.groupBy(currentCabinet, (official) => official.t);
  assert.equal([...byTitle.values()].every((holders) => holders.length === 1), true);
  assert.deepEqual(byTitle.get("Attorney General")?.map((official) => official.n), ["Todd Blanche"]);
});

test("former Cabinet departments appear only during their historical Cabinet periods", () => {
  assert.equal(activeOfficials("1800-01-01").find((official) => official.t === "Secretary of the Navy")?.n, "Benjamin Stoddert");
  assert.equal(activeOfficials("1830-01-01").find((official) => official.t === "Postmaster General")?.n, "William T. Barry");
  assert.equal(activeOfficials("1905-01-01").find((official) => official.t === "Secretary of Commerce and Labor")?.n, "Victor H. Metcalf");
  assert.equal(activeOfficials("1970-01-01").find((official) => official.t === "Postmaster General")?.n, "Winton M. Blount");
  assert.equal(activeOfficials("1972-01-01").some((official) => official.t === "Postmaster General"), false);
});

test("Cabinet and Cabinet-rank officials share one historically bounded roster", () => {
  assert.equal(officialOfficesForDate("Cabinet", "1900-01-01").some((office) => office.title === "White House Chief of Staff"), false);
  assert.equal(officialOfficesForDate("Cabinet", "1995-01-01").some((office) => office.title === "Director of National Drug Control Policy"), true);
  assert.equal(officialOfficesForDate("Cabinet", "2010-01-01").some((office) => office.title === "Director of National Drug Control Policy"), false);
  assert.equal(officialOfficesForDate("Cabinet", "2022-01-01").some((office) => office.title === "Director of the Office of Science & Technology Policy"), true);
  assert.equal(officialOfficesForDate("Cabinet", "2026-07-26").some((office) => office.title === "U.S. Ambassador to the United Nations"), false);

  const cabinet1985 = activeCabinet("1985-08-01");
  assert.equal(cabinet1985.find((official) => official.t === "United States Trade Representative")?.n, "Clayton Yeutter");
  const cabinet1996 = activeCabinet("1996-03-01");
  assert.equal(cabinet1996.find((official) => official.t === "FEMA Administrator")?.n, "James Lee Witt");
  assert.equal(cabinet1996.find((official) => official.t === "Director of National Drug Control Policy")?.n, "Barry McCaffrey");
  const actingScienceDirector = activeCabinet("2022-06-01").find((official) => official.t === "Director of the Office of Science & Technology Policy");
  assert.equal(actingScienceDirector?.n, "Alondra Nelson");
  assert.equal(actingScienceDirector?.x, true);
});

test("people have direct Wikipedia records or a clickable search fallback", () => {
  assert.ok(members.some((member) => member.w?.startsWith("https://en.wikipedia.org/wiki/")));
  assert.ok(officials.some((official) => official.w?.startsWith("https://en.wikipedia.org/wiki/")));
});

test("the current Supreme Court contains one chief and eight associate justices", () => {
  const court = activeOfficials("2026-07-26").filter((official) => official.g === "Supreme Court");
  assert.equal(court.filter((official) => official.t === "Chief Justice").length, 1);
  assert.equal(court.filter((official) => official.t === "Associate Justice").length, 8);
  assert.equal(activeOfficials("1800-01-01").filter((official) => official.g === "Supreme Court").length, 5);
  assert.equal(court.length, 9);
});

test("the atlas has complete top chamber leadership for its initial 2004 snapshot", () => {
  const leadership = activeOfficials("2004-08-23").filter((official) => official.g === "Congressional leadership");
  assert.deepEqual(
    leadership.map((official) => official.t).sort(),
    [
      "House majority leader",
      "House majority whip",
      "House minority leader",
      "House minority whip",
      "President of the Senate",
      "President pro tempore",
      "Senate majority leader",
      "Senate majority whip",
      "Senate minority leader",
      "Senate minority whip",
      "Speaker of the House",
    ].sort(),
  );
});

test("the House Speaker roster preserves real vacancies instead of dropping historical records", () => {
  assert.equal(activeOfficials("1800-01-01").find((official) => official.t === "Speaker of the House")?.n, "Theodore Sedgwick");
  assert.equal(activeOfficials("1814-01-18").find((official) => official.t === "Speaker of the House")?.n, "Henry Clay");
  assert.equal(activeOfficials("1820-11-01").some((official) => official.t === "Speaker of the House"), false);
  assert.equal(activeOfficials("1876-08-20").some((official) => official.t === "Speaker of the House"), false);
  assert.equal(activeOfficials("1876-12-04").find((official) => official.t === "Speaker of the House")?.n, "Samuel Jackson Randall");
  assert.equal(activeOfficials("2023-10-10").some((official) => official.t === "Speaker of the House"), false);
});

test("every occupied modern congressional leadership card has party and state", () => {
  for (const date of ["2004-08-23", "2026-07-26"]) {
    const leadership = activeOfficials(date).filter((official) => official.g === "Congressional leadership");
    assert.ok(leadership.every((official) => official.p && official.s), date);
  }
  const vance = activeOfficials("2026-07-26").find((official) => official.t === "President of the Senate");
  assert.deepEqual([vance?.p, vance?.s], ["Republican", "OH"]);
});

test("Senate leadership has no parser-created gaps and includes its constitutional presiding officer", () => {
  for (const date of ["1931-03-04", "1959-01-03", "2004-08-23", "2026-07-26"]) {
    const leadership = activeOfficials(date).filter((official) => official.g === "Congressional leadership" && official.h === "sen");
    const titles = new Set(leadership.map((official) => official.t));
    assert.ok(titles.has("President of the Senate"), date);
    assert.ok(titles.has("Senate majority leader"), date);
    assert.ok(titles.has("Senate majority whip"), date);
    assert.ok(titles.has("Senate minority leader"), date);
    assert.ok(titles.has("Senate minority whip"), date);
  }
});

test("partisan executive officeholders include party affiliation", () => {
  const president = activeOfficials("2004-08-23").find((official) => official.t === "President");
  const vicePresident = activeOfficials("2004-08-23").find((official) => official.t === "Vice President");
  assert.equal(president.p, "Republican");
  assert.equal(vicePresident.p, "Republican");
});

test("historical at-large boundaries find members recorded with district -1", () => {
  const delegation = houseMembersForDistrict(activeHouse("1790-06-01"), "PA", 0, false);
  assert.equal(delegation.length, 8);
  assert.ok(delegation.every((member) => member.d === -1));
});

test("single-district at-large states find members recorded as district 1", () => {
  const delegation = houseMembersForDistrict(activeHouse("1790-06-01"), "RI", 0, false);
  assert.deepEqual(delegation.map((member) => member.n), ["Benjamin Bourne"]);
});

test("a stale at-large outline is ignored when the state uses numbered districts", () => {
  const planMembers = activeHouse("1792-01-15");
  assert.equal(houseBoundaryBelongsToPlan(planMembers, "PA", 0, true), false);
});

test("statewide at-large members supplement rather than replace numbered districts", () => {
  const delegation = [
    { s: "IL", d: 1, n: "District member" },
    { s: "IL", d: -1, n: "Statewide member" },
  ];
  assert.deepEqual(houseMembersForDistrict(delegation, "IL", 1, true).map((member) => member.n), ["District member"]);
  assert.deepEqual(houseStatewideAtLargeMembers(delegation, "IL", true).map((member) => member.n), ["Statewide member"]);
  assert.deepEqual(houseStatewideAtLargeMembers(delegation, "IL", false), []);
});

test("Pennsylvania district 14 shows McCulloch, not his deceased predecessor, in November 1840", () => {
  const district = activeHouse("1840-11-23").filter((member) => member.s === "PA" && member.d === 14);
  assert.deepEqual(district.map((member) => member.n), ["George McCulloch"]);
});

test("the 1840 political geography includes states and federal territories", () => {
  const date = 18401123;
  const active = polities.filter((polity) => polity.properties.START_N <= date && polity.properties.END_N >= date);
  assert.equal(active.filter((polity) => polity.properties.TERR_TYPE === "State").length, 26);
  assert.ok(active.some((polity) => polity.properties.NAME === "Iowa Territory"));
  assert.ok(active.some((polity) => polity.properties.NAME === "Wisconsin Territory"));
});

test("seceded states are disabled only during their Confederate interval", () => {
  assert.equal(isConfederateState("SC", "1860-12-19"), false);
  assert.equal(isConfederateState("SC", "1860-12-20"), true);
  assert.equal(isConfederateState("VA", "1861-04-16"), false);
  assert.equal(isConfederateState("VA", "1861-04-17"), true);
  assert.equal(isConfederateState("TN", "1861-06-08"), true);
  assert.equal(isConfederateState("KY", "1863-07-01"), false);
  assert.equal(isConfederateState("TX", "1865-06-03"), false);
});

test("postwar Reconstruction overlays persist until state readmission", () => {
  assert.equal(reconstructionDistrictForState("VA", "1865-06-02"), null);
  assert.deepEqual(reconstructionDistrictForState("VA", "1865-06-03"), { number: 1, label: "First Military District" });
  assert.deepEqual(reconstructionDistrictForState("LA", "1865-06-03"), { number: 5, label: "Fifth Military District" });
  assert.deepEqual(reconstructionDistrictForState("TX", "1865-06-03"), { number: 5, label: "Fifth Military District" });
  assert.equal(reconstructionDistrictForState("TN", "1867-06-01"), null);
  assert.equal(reconstructionDistrictForState("NC", "1868-06-25"), null);
  assert.deepEqual(reconstructionDistrictForState("MS", "1869-01-01"), { number: 4, label: "Fourth Military District" });
  assert.equal(reconstructionDistrictForState("MS", "1870-02-23"), null);
  assert.deepEqual(reconstructionDistrictForState("GA", "1870-01-01"), { number: 3, label: "Third Military District" });
  assert.equal(reconstructionDistrictForState("GA", "1870-07-15"), null);
});

test("default modern House maps use a consistent responsive geometry budget", async () => {
  for (const congress of [98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 112, 115, 116, 117, 118, 119]) {
    const file = String(congress).padStart(3, "0");
    const districtTopology = JSON.parse(
      await readFile(new URL(`../public/data/districts/${file}.json`, import.meta.url), "utf8"),
    );
    const coordinateCount = districtTopology.arcs.reduce((total, arc) => total + arc.length, 0);
    const preservesLateCenturyDetail = congress >= 98 && congress <= 107;
    const minimum = preservesLateCenturyDetail ? 190_000 : 80_000;
    const maximum = preservesLateCenturyDetail ? 310_000 : 180_000;
    assert.ok(coordinateCount > minimum, `Congress ${congress} has only ${coordinateCount} standard arc points`);
    assert.ok(coordinateCount < maximum, `Congress ${congress} has ${coordinateCount} standard arc points`);
  }
});

test("power users can load a denser boundary tier for every era", async () => {
  for (const congress of [1, 90, 103, 112, 119]) {
    const file = String(congress).padStart(3, "0");
    const standard = JSON.parse(await readFile(new URL(`../public/data/districts/${file}.json`, import.meta.url), "utf8"));
    const high = JSON.parse(await readFile(new URL(`../public/data/districts-high/${file}.json`, import.meta.url), "utf8"));
    const standardCount = standard.arcs.reduce((total, arc) => total + arc.length, 0);
    const highCount = high.arcs.reduce((total, arc) => total + arc.length, 0);
    assert.ok(highCount > standardCount * 1.25, `Congress ${congress} high-detail tier is not materially denser`);
  }
});

test("current Rhode Island boundaries contain districts 1 and 2 without a false at-large seat", async () => {
  const districtTopology = JSON.parse(
    await readFile(new URL("../public/data/districts/119.json", import.meta.url), "utf8"),
  );
  const districts = Object.values(districtTopology.objects).flatMap((object) =>
    feature(districtTopology, object).features,
  );
  const rhodeIsland = districts
    .filter((district) => district.properties.statename === "Rhode Island")
    .map((district) => district.properties.district);
  assert.deepEqual([...new Set(rhodeIsland)].sort((a, b) => a - b), [1, 2]);
});
