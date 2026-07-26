import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { feature } from "topojson-client";

const members = JSON.parse(await readFile(new URL("../public/data/members.json", import.meta.url), "utf8"));
const topology = JSON.parse(await readFile(new URL("../public/data/historical-polities.json", import.meta.url), "utf8"));
const polities = feature(topology, Object.values(topology.objects)[0]).features;

function activeHouse(date) {
  return members.filter((member) => member.t === "rep" && member.a <= date && member.z > date);
}

test("the Second Congress begins with its 69-member elected House", () => {
  assert.equal(activeHouse("1791-03-04").length, 69);
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
