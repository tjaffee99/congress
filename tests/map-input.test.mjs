import assert from "node:assert/strict";
import test from "node:test";

import { clampZoom, isLikelyMouseWheel } from "../app/map-input.mjs";

test("mouse wheels zoom while desktop trackpad gestures pass through", () => {
  assert.equal(isLikelyMouseWheel({ deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false }), true);
  assert.equal(isLikelyMouseWheel({ deltaX: 0, deltaY: -3.25, deltaMode: 0, ctrlKey: false }), false);
  assert.equal(isLikelyMouseWheel({ deltaX: 8, deltaY: 24, deltaMode: 0, ctrlKey: false }), false);
  assert.equal(isLikelyMouseWheel({ deltaX: 0, deltaY: -80, deltaMode: 0, ctrlKey: true }), false);
  assert.equal(isLikelyMouseWheel({ deltaX: 0, deltaY: 3, deltaMode: 1, ctrlKey: false }), true);
});

test("map zoom remains inside its supported range", () => {
  assert.equal(clampZoom(0.2), 1);
  assert.equal(clampZoom(3.5), 3.5);
  assert.equal(clampZoom(30), 16);
});
