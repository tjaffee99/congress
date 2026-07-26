import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { feature } from "topojson-client";
import { isConfederateState } from "../app/confederate-state.mjs";
import { houseBoundaryBelongsToPlan, houseMembersForDistrict } from "../app/house-members.mjs";

const members = JSON.parse(await readFile(new URL("../public/data/members.json", import.meta.url), "utf8"));
const officials = JSON.parse(await readFile(new URL("../public/data/officials.json", import.meta.url), "utf8"));
const topology = JSON.parse(await readFile(new URL("../public/data/historical-polities.json", import.meta.url), "utf8"));
const polities = feature(topology, Object.values(topology.objects)[0]).features;

function activeHouse(date) {
  return members.filter((member) => member.t === "rep" && member.a <= date && member.z > date);
}

function activeOfficials(date) {
  return officials.filter((official) => official.a <= date && (!official.z || official.z > date));
}

test("the Second Congress begins with its 69-member elected House", () => {
  assert.equal(activeHouse("1791-03-04").length, 69);
});

test("independent senators retain their caucus affiliation", () => {
  const sanders = members.find((member) => member.id === "S000033" && member.a === "2007-01-04");
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

test("Cabinet offices do not appear before their creation and have one active holder", () => {
  assert.equal(activeOfficials("1800-01-01").some((official) => official.t === "Secretary of Agriculture"), false);
  assert.equal(activeOfficials("1970-01-01").some((official) => official.t === "Secretary of Energy"), false);
  const currentCabinet = activeOfficials("2026-07-26").filter((official) => official.g === "Cabinet");
  const byTitle = Map.groupBy(currentCabinet, (official) => official.t);
  assert.equal([...byTitle.values()].every((holders) => holders.length === 1), true);
  assert.deepEqual(byTitle.get("Attorney General")?.map((official) => official.n), ["Todd Blanche"]);
});

test("Cabinet-level offices appear only after their posts were created", () => {
  assert.equal(activeOfficials("1900-01-01").some((official) => official.g === "Cabinet-level"), false);
  const current = activeOfficials("2026-07-26").filter((official) => official.g === "Cabinet-level");
  assert.ok(current.length >= 7);
  assert.ok(current.some((official) => official.t === "White House Chief of Staff"));
  assert.ok(current.some((official) => official.t === "EPA Administrator"));
});

test("people have direct Wikipedia records or a clickable search fallback", () => {
  assert.ok(members.some((member) => member.w?.startsWith("https://en.wikipedia.org/wiki/")));
  assert.ok(officials.some((official) => official.w?.startsWith("https://en.wikipedia.org/wiki/")));
});

test("the current Supreme Court contains one chief and eight associate justices", () => {
  const court = activeOfficials("2026-07-26").filter((official) => official.g === "Supreme Court");
  assert.equal(court.filter((official) => official.t === "Chief Justice").length, 1);
  assert.equal(court.filter((official) => official.t === "Associate Justice").length, 8);
});

test("the atlas has complete top chamber leadership for its initial 2004 snapshot", () => {
  const leadership = activeOfficials("2004-08-23").filter((official) => official.g === "Congressional leadership");
  assert.deepEqual(
    leadership.map((official) => official.t).sort(),
    [
      "House majority leader",
      "House minority leader",
      "President pro tempore",
      "Senate majority leader",
      "Senate minority leader",
      "Speaker of the House",
    ].sort(),
  );
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

test("modern House district maps retain enough geometry for close zooming", async () => {
  for (const congress of [115, 116, 117, 118, 119]) {
    const file = String(congress).padStart(3, "0");
    const districtTopology = JSON.parse(
      await readFile(new URL(`../public/data/districts/${file}.json`, import.meta.url), "utf8"),
    );
    const coordinateCount = districtTopology.arcs.reduce((total, arc) => total + arc.length, 0);
    assert.ok(coordinateCount > 90_000, `Congress ${congress} has only ${coordinateCount} arc points`);
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
