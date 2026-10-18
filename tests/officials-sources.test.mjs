import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { actingShades, endActingTenuresAtSuccession, isActingRow } from "../scripts/lib/cabinet-tables.mjs";
import { congressOnDate, historyHouseRows, housePartyWhips, houseSpeakers } from "../scripts/lib/house-leadership.mjs";
import { fetchSource } from "../scripts/lib/sources.mjs";
import { positionHeldRows } from "../scripts/lib/wikidata.mjs";

// The markup history.house.gov serves for its office lists.
function historyHousePage(rows) {
  const body = rows.map(([congress, name, state, elected]) => `
                    <tr class="">
                        <td sort="${congress}" style="white-space:nowrap">
                            ${congress}${["st", "nd", "rd"][congress - 1] ?? "th"} (1789&ndash;1791)
                        </td>
                        <td sort="${name}">
                            <a href="/People/Detail/1">${name}</a>
                        </td>
                                                    <td sort="${state}">
                                ${state}
                            </td>
${elected ? `                        <td sort="${elected.replaceAll("-", "")}" style="white-space:nowrap">${elected}</td>` : ""}
                    </tr>`).join("");
  return `<html><body><table id="tblSort" class="dynamic">
        <thead><tr><th>Congress and Years</th><th>Name</th><th>State or Territory</th></tr></thead>
        <tbody>${body}</tbody></table></body></html>`;
}

// history.house.gov sometimes redirects to this page, which fetch follows.
const errorPage = "<html><head><title>Error Document</title></head><body><h1>We're sorry</h1></body></html>";

const speakerRows = [
  [1, "MUHLENBERG, Frederick Augustus Conrad", "PA", "1789-04-01"],
  [2, "TRUMBULL, Jonathan, Jr.", "CT", "1791-10-24"],
  [3, "MUHLENBERG, Frederick Augustus Conrad", "PA", "1793-12-02"],
];

const legislators = [
  {
    id: { bioguide: "M001063", wikipedia: "Frederick Muhlenberg" },
    name: { first: "Frederick", last: "Muhlenberg" },
    terms: [{ type: "rep", state: "PA", start: "1789-03-04", end: "1797-03-03", party: "Pro-Administration" }],
  },
  {
    id: { bioguide: "T000368", wikipedia: "Jonathan Trumbull Jr." },
    name: { first: "Jonathan", last: "Trumbull" },
    terms: [{ type: "rep", state: "CT", start: "1789-03-04", end: "1795-03-03", party: "Pro-Administration" }],
  },
];

test("House Speakers are read from history.house.gov's office table", () => {
  const speakers = houseSpeakers({ text: historyHousePage(speakerRows), fetchedAt: "1794-01-01T00:00:00Z" }, legislators);
  assert.deepEqual(
    speakers.map((speaker) => [speaker.n, speaker.s, speaker.a, speaker.z, speaker.id]),
    [
      ["Frederick Muhlenberg", "PA", "1789-04-01", "1791-03-04", "M001063"],
      ["Jonathan Trumbull", "CT", "1791-10-24", "1793-03-04", "T000368"],
      ["Frederick Muhlenberg", "PA", "1793-12-02", "1795-03-04", "M001063"],
    ],
  );
});

test("an error page or incomplete House office table fails instead of dropping officeholders", () => {
  const page = { label: "House Speakers", minimumCells: 4, asOf: "1794-01-01" };
  assert.throws(() => historyHouseRows(errorPage, page), /House Speakers: officeholder table not found/);
  assert.throws(() => historyHouseRows(historyHousePage([]), page), /no officeholder rows/);
  assert.throws(() => historyHouseRows(historyHousePage([speakerRows[0], speakerRows[2]]), page), /no row for Congress 2/);
  assert.throws(() => historyHouseRows(historyHousePage(speakerRows.slice(0, 1)), page), /last row is Congress 1, but Congress 3/);
  assert.throws(() => historyHouseRows(historyHousePage(speakerRows.map((row) => row.slice(0, 3))), page), /unrecognized row/);
  // A new Congress may be missing for a few weeks.
  assert.equal(historyHouseRows(historyHousePage(speakerRows.slice(0, 2)), page).length, 2);

  const whips = { text: historyHousePage(speakerRows.map((row) => row.slice(0, 3))), fetchedAt: "1794-01-01" };
  assert.throws(
    () => housePartyWhips({ democraticWhips: whips, republicanWhips: { text: errorPage, fetchedAt: "1794-01-01" } }, legislators),
    /House Republican whips: officeholder table not found/,
  );
});

test("Congresses are numbered from the date they convene", () => {
  assert.equal(congressOnDate("1789-03-04"), 1);
  assert.equal(congressOnDate("1935-01-02"), 73);
  assert.equal(congressOnDate("2026-10-18"), 119);
  assert.equal(congressOnDate("2027-01-03"), 120);
});

function response(body, { status = 200, url = "https://history.house.gov/People/Office/Republican-Whips/", redirected = false } = {}) {
  return { ok: status >= 200 && status < 300, status, url, redirected, text: async () => body };
}

test("source downloads retry error-page redirects and reuse the saved copy", async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "atlas-sources-"));
  try {
    const url = "https://history.house.gov/People/Office/Republican-Whips/";
    const good = historyHousePage(speakerRows);
    const responses = [
      response(errorPage, { redirected: true, url: "https://history.house.gov/errorpage.htm?aspxerrorpath=/People/Office/Republican-Whips/" }),
      response("Too many requests", { status: 429 }),
      response(good),
    ];
    let calls = 0;
    const fetchImpl = async () => responses[calls++];
    const validate = (html) => historyHouseRows(html, { label: "whips", minimumCells: 3, asOf: "1794-01-01" });
    const options = { cacheDir, fetchImpl, validate, retryDelays: [0, 0], refresh: false };

    const first = await fetchSource(url, options);
    assert.equal(calls, 3);
    assert.deepEqual([first.text, first.cached], [good, false]);

    const second = await fetchSource(url, options);
    assert.equal(calls, 3);
    assert.deepEqual([second.text, second.cached, second.fetchedAt], [good, true, first.fetchedAt]);

    const failing = async () => response(errorPage, { redirected: true, url: "https://history.house.gov/errorpage.htm" });
    await assert.rejects(
      fetchSource(url, { ...options, fetchImpl: failing, refresh: true }),
      /Republican-Whips\/: redirected to https:\/\/history\.house\.gov\/errorpage\.htm/,
    );
    // The failed refresh leaves the good copy in place.
    assert.equal((await fetchSource(url, options)).text, good);
    assert.deepEqual((await readdir(path.join(cacheDir, "history.house.gov"))).sort(), ["People_Office_Republican-Whips", "People_Office_Republican-Whips.meta.json"]);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

function binding({ start, end, label = "Samuel Alito" }) {
  return {
    person: { value: "http://www.wikidata.org/entity/Q11138" },
    position: { value: "http://www.wikidata.org/entity/Q11144" },
    personLabel: { value: label },
    ...(start && { start: { value: `${start}T00:00:00Z` } }),
    ...(end && { end: { value: `${end}T00:00:00Z` } }),
  };
}

test("Wikidata terms ignore dates after the query ran", () => {
  const rows = positionHeldRows([
    binding({ start: "2006-01-31", end: "2027-01-01" }),
    binding({ start: "1990-01-01", end: "2000-01-01", label: "Earlier" }),
    binding({ start: "2027-01-20", label: "Not yet" }),
  ], "2026-10-18T19:00:00Z");
  assert.deepEqual(rows.map((row) => [row.name, row.start, row.end]), [
    ["Samuel Alito", "2006-01-31", null],
    ["Earlier", "1990-01-01", "2000-01-01"],
  ]);
  // Once the date has passed, a later snapshot keeps it.
  assert.equal(positionHeldRows([binding({ start: "2006-01-31", end: "2027-01-01" })], "2027-02-01")[0].end, "2027-01-01");
});

// Excerpts of Wikipedia's "United States Secretary of Energy" list.
const energyLegend = `<span class="legend-color mw-no-invert" style="forced-color-adjust: none; border: 1px solid #AAAAAA;background-color:#E81B23; color:black;"><span typeof="mw:Entity"> </span></span><span typeof="mw:Entity"> </span><a href="./Republican_Party">Republican</a></span>
<span class="legend-color mw-no-invert" style="forced-color-adjust: none; border: 1px solid #AAAAAA;background-color:#E6E6AA; color:black;"><span typeof="mw:Entity"> </span></span><span typeof="mw:Entity"> </span>Acting secretary of energy</span>`;
const kolbRow = `<th style="background: #E81B23;">–</th><td style="background:#e6e6aa;"><span class="fn"><a href="https://en.wikipedia.org/wiki/Ingrid_Kolb">Ingrid Kolb</a></span></td>`;
const wrightRow = `<th style="background: #E81B23;">17</th><td><span class="fn"><a href="https://en.wikipedia.org/wiki/Chris_Wright">Chris Wright</a></span></td>`;

test("acting secretaries are recognized by the table's acting shade", () => {
  const shades = actingShades(energyLegend);
  assert.deepEqual([...shades], ["#e6e6aa"]);
  assert.equal(isActingRow(kolbRow, shades), true);
  assert.equal(isActingRow(wrightRow, shades), false);
  assert.equal(isActingRow(`<td>Robert Wilkie (Acting)</td>`, new Set()), true);
});

test("an acting secretary's tenure ends when the successor takes office", () => {
  const holders = endActingTenuresAtSuccession([
    { n: "Jennifer Granholm", x: false, a: "2021-02-25", z: "2025-01-20" },
    { n: "Ingrid Kolb", x: true, a: "2025-01-20", z: "2025-02-04" },
    { n: "Chris Wright", x: false, a: "2025-02-03", z: null },
  ]);
  assert.deepEqual(holders.map((holder) => holder.z), ["2025-01-20", "2025-02-03", null]);
});
