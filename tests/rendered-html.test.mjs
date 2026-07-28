import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished American Atlas shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>American Atlas/);
  assert.match(html, /DATE IN VIEW/);
  assert.match(html, /House districts/);
  assert.match(html, /aria-label="Map zoom controls"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("the product source contains the historical map and no starter preview", async () => {
  const [page, cabinetOffices, layout, packageJson, socialPreview] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/cabinet-offices.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/american-atlas-social-2026.png", import.meta.url)),
  ]);

  assert.match(page, /historical-polities\.json/);
  assert.doesNotMatch(page, /scroll to zoom/);
  assert.match(page, /click to pin · ←\/→ scrub dates/);
  assert.match(page, /\[chamber\]\);/);
  assert.match(page, /\["1800-01-01", "1800"\]/);
  assert.match(page, /\["2000-01-01", "2000"\]/);
  assert.match(page, /wikipediaHref/);
  assert.match(page, /const OFFICIAL_GROUPS = \["Executive", "Cabinet", "Supreme Court"\]/);
  assert.doesNotMatch(page, /"Cabinet-level", "Supreme Court"/);
  assert.match(page, /High detail/);
  assert.doesNotMatch(page, /No dated officeholder in the source record/);
  assert.match(page, /confederate-state/);
  assert.match(page, /isConfederateFeature/);
  assert.match(page, /reconstructionDistrictForFeature/);
  assert.match(page, /historical-state-overlays/);
  assert.match(page, /tooltip\.labelOnly/);
  assert.match(page, /\$\{name\} \(seceded\)/);
  assert.match(page, /pinnedTooltipRef/);
  assert.match(page, /current\?\.feature === mapFeature/);
  assert.doesNotMatch(page, /const y = pinned\s*\?\s*8/);
  assert.match(page, /tooltip-close/);
  assert.match(page, /historicalStateOverlayPathElements/);
  assert.match(page, /mixedDistrictPatternId/);
  assert.match(page, /Statewide at large/);
  assert.match(page, /mixed-delegation-swatch/);
  assert.match(page, /useState\(currentUsDate\)/);
  assert.match(page, /value=\{dateDraft\}/);
  assert.match(page, /isValidDateInRange\(next, today\)/);
  assert.doesNotMatch(page, /INITIAL_DATE|2004-08-23/);
  assert.doesNotMatch(page, /className="intro"|className="method"|HOW TO READ THE ATLAS/);
  assert.doesNotMatch(page, /<nav|Data through/);
  assert.match(page, /<footer id="sources">/);
  assert.match(page, /const mapPathElements = useMemo/);
  assert.match(page, /zoomLayerRef\.current\?\.setAttribute/);
  assert.match(page, /onPointerDown=\{handleMapPointerDown\}/);
  assert.match(page, /addEventListener\("wheel", handleMapWheel, \{ passive: false \}\)/);
  assert.match(page, /beginPinch/);
  assert.match(page, /officialOfficesForDate/);
  assert.match(page, /official-vacant/);
  assert.match(page, /className="acting-label">\(acting\)/);
  assert.match(page, /<em><a href=\{wikipediaHref\(official\)\}/);
  assert.match(page, /Created offices remain visible while vacant/);
  assert.match(page, /periods when they held Cabinet rank/);
  assert.match(page, /open=\{openOfficialGroups\[group\]\}/);
  assert.match(page, /onToggle=/);
  assert.doesNotMatch(page, /open=\{group !== "Cabinet" \|\| rows\.length < 10\}/);
  assert.match(page, /SENATE CONTROL/);
  assert.match(page, /majority-marker/);
  assert.match(page, /LEADERSHIP_OFFICES/);
  assert.match(page, /leadership-vacant/);
  assert.match(page, /House majority whip", created: "1897-03-04"/);
  assert.match(page, /House majority leader", created: "1899-03-04"/);
  assert.match(page, /official\.p && official\.s \? " – "/);
  assert.match(page, /Independent · \$\{caucus\} caucus/);
  assert.match(page, /Unfilled Senate seat/);
  assert.doesNotMatch(page, /className="portrait"|initials\(/);
  assert.match(layout, /American Atlas/);
  assert.match(layout, /metadataBase: new URL\("https:\/\/americanatlas\.us"\)/);
  assert.match(layout, /american-atlas-social-2026\.png/);
  assert.match(layout, /card: "summary_large_image"/);
  assert.equal(socialPreview.readUInt32BE(16), 1200);
  assert.equal(socialPreview.readUInt32BE(20), 630);
  assert.match(cabinetOffices, /Postmaster General/);
  assert.match(cabinetOffices, /Director of National Drug Control Policy/);
  assert.match(cabinetOffices, /FEMA Administrator/);
  assert.match(cabinetOffices, /Director of the Office of Science & Technology Policy/);
  assert.doesNotMatch(page, /SkeletonPreview|_sites-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
