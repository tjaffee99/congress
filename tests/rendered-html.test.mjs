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

test("server-renders the finished American State atlas shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>American State/);
  assert.match(html, /DATE IN VIEW/);
  assert.match(html, /House districts/);
  assert.match(html, /aria-label="Map zoom controls"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("the product source contains the historical map and no starter preview", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /historical-polities\.json/);
  assert.doesNotMatch(page, /scroll to zoom/);
  assert.match(page, /drag to pan · \+\/− to zoom/);
  assert.match(page, /\[chamber\]\);/);
  assert.match(page, /\["1977-01-20", "1977"\]/);
  assert.match(page, /wikipediaHref/);
  assert.match(page, /Cabinet-level/);
  assert.match(page, /confederate-state/);
  assert.match(page, /isConfederateFeature/);
  assert.match(page, /reconstructionDistrictForFeature/);
  assert.match(page, /historical-state-overlays/);
  assert.match(page, /tooltip\.labelOnly/);
  assert.match(page, /\$\{name\} \(seceded\)/);
  assert.match(page, /pinnedTooltipRef/);
  assert.match(page, /tooltip-close/);
  assert.match(page, /historicalStateOverlayPathElements/);
  assert.match(page, /useState\(currentUsDate\)/);
  assert.match(page, /value=\{dateDraft\}/);
  assert.match(page, /isValidDateInRange\(next, today\)/);
  assert.doesNotMatch(page, /INITIAL_DATE|2004-08-23/);
  assert.doesNotMatch(page, /className="intro"|className="method"|HOW TO READ THE ATLAS/);
  assert.doesNotMatch(page, /<nav|Data through/);
  assert.match(page, /<footer id="sources">/);
  assert.match(page, /const mapPathElements = useMemo/);
  assert.match(page, /zoomLayerRef\.current\?\.setAttribute/);
  assert.match(page, /SENATE CONTROL/);
  assert.match(page, /majority-marker/);
  assert.match(page, /Independent · \$\{caucus\} caucus/);
  assert.match(page, /Unfilled Senate seat/);
  assert.doesNotMatch(page, /className="portrait"|initials\(/);
  assert.match(layout, /American State/);
  assert.doesNotMatch(page, /SkeletonPreview|_sites-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
