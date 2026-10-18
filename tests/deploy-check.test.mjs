import assert from "node:assert/strict";
import test from "node:test";
import { newerPageChunk } from "../app/deploy-check.mjs";

const loaded = [
  "https://congress.theojaffee.net/assets/framework-CXnKph_e.js",
  "https://congress.theojaffee.net/assets/page-BKJsDNxh.js",
];

test("a page cached from an earlier deploy finds the newer bundle", () => {
  const html = '<link rel="modulepreload" href="/assets/page-Zx9_Qe12.js"/>';
  assert.equal(newerPageChunk(loaded, html), "/assets/page-Zx9_Qe12.js");
});

test("the current build, development builds and failed fetches never reload", () => {
  assert.equal(newerPageChunk(loaded, '<link href="/assets/page-BKJsDNxh.js"/>'), null);
  assert.equal(newerPageChunk(["http://localhost:5173/app/page.tsx"], '<link href="/assets/page-Zx9_Qe12.js"/>'), null);
  assert.equal(newerPageChunk(loaded, ""), null);
});
