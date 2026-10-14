import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { chamberControl, congressDates, congressFor, LATEST_DISTRICT_CONGRESS } from "../app/congress-terms.mjs";

const members = JSON.parse(await readFile(new URL("../public/data/members.json", import.meta.url), "utf8"));
const officials = JSON.parse(await readFile(new URL("../public/data/officials.json", import.meta.url), "utf8"));

function serving(id, date) {
  return members.find((member) => member.id === id && member.a <= date && member.z > date);
}

function senators(state, date) {
  return members.filter((member) => member.t === "sen" && member.s === state && member.a <= date && member.z > date);
}

function officeholder(title, date) {
  return officials
    .filter((official) => official.t === title && official.a <= date && (!official.z || official.z > date))
    .sort((a, b) => b.a.localeCompare(a.a))[0];
}

test("Congress numbering continues past the 119th", () => {
  assert.equal(congressFor("2027-01-02"), 119);
  assert.equal(congressFor("2027-01-03"), 120);
  assert.equal(congressFor("2031-06-01"), 122);
  assert.deepEqual(congressDates(120), ["2027-01-03", "2029-01-03"]);
  assert.deepEqual(congressDates(73), ["1933-03-04", "1935-01-03"]);
  assert.deepEqual(congressDates(72), ["1931-03-04", "1933-03-04"]);
  assert.ok(LATEST_DISTRICT_CONGRESS >= 119);
});

test("an evenly split Senate follows the Vice President's party", () => {
  const counts = new Map([["Republican", 50], ["Democrat", 50]]);
  const control = chamberControl(counts, 100, "Democrat", true);
  assert.equal(control.leadingParty, "Democrat");
  assert.equal(control.tieBreak, true);
  assert.equal(control.hasControl, true);
  assert.equal(chamberControl(counts, 100, "Democrat", false).hasControl, false);
  assert.equal(chamberControl(new Map([["Republican", 53], ["Democrat", 47]]), 100, "Republican", true).tieBreak, false);
});

test("the 117th Congress Senate is a 50-50 chamber with a Democratic Vice President", () => {
  const date = "2021-03-01";
  const senate = members.filter((member) => member.t === "sen" && member.a <= date && member.z > date);
  const counts = new Map();
  for (const member of senate) counts.set(member.c ?? member.p, (counts.get(member.c ?? member.p) ?? 0) + 1);
  assert.equal(counts.get("Democrat"), 50);
  assert.equal(counts.get("Republican"), 50);
  assert.equal(officeholder("Vice President", date)?.n, "Kamala Harris");
  assert.equal(chamberControl(counts, 100, officeholder("Vice President", date)?.p, true).leadingParty, "Democrat");
});

test("mid-term party switches take effect on the day they happened", () => {
  assert.equal(serving("J000072", "2001-03-01")?.p, "Republican");
  assert.equal(serving("J000072", "2001-07-01")?.p, "Independent");
  assert.equal(serving("J000072", "2001-07-01")?.c, "Democrat");
  assert.equal(serving("S000709", "2009-03-01")?.p, "Republican");
  assert.equal(serving("S000709", "2009-06-01")?.p, "Democrat");
  assert.equal(serving("K000401", "2025-06-01")?.p, "Republican");
  assert.equal(serving("K000401", "2026-06-01")?.p, "Independent");
  assert.equal(serving("K000401", "2026-06-01")?.c, "Republican");
});

test("party switches do not open false House vacancies", () => {
  assert.equal(serving("A000367", "2019-03-01")?.p, "Republican");
  assert.equal(serving("A000367", "2019-09-01")?.p, "Independent");
  assert.equal(serving("V000133", "2019-06-01")?.p, "Democrat");
  assert.equal(serving("V000133", "2020-06-01")?.p, "Republican");
});

test("South Carolina has two senators after Lindsey Graham's death", () => {
  assert.equal(senators("SC", "2026-07-12").length, 1);
  assert.deepEqual(senators("SC", "2026-10-14").map((member) => member.id).sort(), ["G000608", "S001184"]);
});

test("appointed senators stay seated until their successors are sworn in", () => {
  for (const id of ["H001104", "M001244"]) {
    assert.ok(serving(id, "2026-11-04"), `${id} should not leave on Election Day`);
  }
  assert.equal(senators("OH", "2026-11-10").length, 2);
  assert.equal(senators("FL", "2026-11-10").length, 2);
});

test("2026 House vacancies follow the House Clerk's dates", () => {
  assert.equal(serving("L000578", "2026-01-05")?.n, "Doug LaMalfa");
  assert.equal(serving("L000578", "2026-01-06"), undefined);
  assert.equal(serving("S001157", "2026-04-21")?.n, "David Scott");
  assert.equal(serving("S001157", "2026-04-22"), undefined);
  assert.equal(serving("B001328", "2026-09-01")?.s, "GA");
  assert.equal(serving("W000832", "2026-09-02")?.s, "CA");
  const house = members.filter((member) => member.t === "rep" && member.a <= "2026-10-14" && member.z > "2026-10-14");
  const voting = house.filter((member) => !["DC", "PR", "GU", "VI", "AS", "MP"].includes(member.s));
  assert.equal(voting.length, 433);
  assert.ok(!voting.some((member) => `${member.s}-${member.d}` === "TX-23" || `${member.s}-${member.d}` === "FL-20"));
});

test("executive officeholders reflect 2026 confirmations and departures", () => {
  assert.equal(officeholder("Attorney General", "2026-06-01")?.x, true);
  assert.equal(officeholder("Attorney General", "2026-10-14")?.n, "Todd Blanche");
  assert.equal(officeholder("Attorney General", "2026-10-14")?.x, false);
  assert.equal(officeholder("Secretary of Labor", "2026-09-01")?.x, true);
  assert.equal(officeholder("Secretary of Labor", "2026-10-14")?.x, false);
  assert.equal(officeholder("Director of National Intelligence", "2026-07-01")?.n, "William J. Pulte");
  assert.equal(officeholder("Director of National Intelligence", "2026-10-14")?.n, "Jay Clayton");
  assert.equal(officeholder("White House Counsel", "2026-10-14")?.n, "Will Scharf");
  assert.equal(officeholder("Secretary of Homeland Security", "2026-10-14")?.n, "Markwayne Mullin");
});

test("Wikidata gaps do not drop Vice Presidents or invent Justice departures", () => {
  assert.equal(officeholder("Vice President", "2005-01-01")?.n, "Dick Cheney");
  assert.equal(officeholder("Vice President", "2022-01-01")?.n, "Kamala Harris");
  const justices = officials.filter((official) => official.t === "Associate Justice" && official.a <= "2026-10-14" && (!official.z || official.z > "2026-10-14"));
  assert.equal(justices.length, 8);
  assert.ok(justices.every((justice) => !justice.z));
});
