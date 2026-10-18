import assert from "node:assert/strict";
import test from "node:test";

import { clampZoom, wheelZoomFactor } from "../app/map-input.mjs";

test("mouse wheels zoom the map a step per notch in either direction", () => {
  const zoomIn = wheelZoomFactor({ deltaY: -100, deltaMode: 0 });
  const zoomOut = wheelZoomFactor({ deltaY: 100, deltaMode: 0 });
  assert.ok(zoomIn > 1.15 && zoomIn < 1.35);
  assert.ok(Math.abs(zoomIn * zoomOut - 1) < 1e-9);
  // Firefox reports wheel notches in lines.
  assert.ok(wheelZoomFactor({ deltaY: -3, deltaMode: 1 }) > 1.15);
});

test("trackpad pinches zoom the map instead of the page", () => {
  // Browsers report a pinch as ctrl+wheel with small deltas; spreading the
  // fingers gives negative deltaY.
  const spread = wheelZoomFactor({ deltaY: -4, deltaMode: 0, ctrlKey: true });
  const pinch = wheelZoomFactor({ deltaY: 4, deltaMode: 0, ctrlKey: true });
  assert.ok(spread > 1.02 && spread < 1.1);
  assert.ok(pinch < 1);
  // A two-finger scroll zooms gently rather than jumping.
  const scroll = wheelZoomFactor({ deltaY: -3.25, deltaMode: 0 });
  assert.ok(scroll > 1 && scroll < 1.02);
});

test("a single wheel event never more than doubles or halves the zoom", () => {
  assert.equal(wheelZoomFactor({ deltaY: -5000, deltaMode: 0 }), 2);
  assert.equal(wheelZoomFactor({ deltaY: 5000, deltaMode: 0 }), 0.5);
});

test("map zoom remains inside its supported range", () => {
  assert.equal(clampZoom(0.2), 1);
  assert.equal(clampZoom(3.5), 3.5);
  assert.equal(clampZoom(30), 16);
});
