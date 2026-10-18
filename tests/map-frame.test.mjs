import assert from "node:assert/strict";
import test from "node:test";
import { FRAME_HEIGHT, FRAME_WIDTH, fitMapFrame } from "../app/map-frame.mjs";

// Screen position of a frame point, given the viewBox.
function toScreen(frame, x, y) {
  return [(x - frame.x) * frame.s, (y - frame.y) * frame.s];
}

test("the map frame fills the area beside the panel and above the timeline", () => {
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  for (const area of [
    { width: 1440, height: 900, left: 396, top: 16, right: 72, bottom: 100 },
    { width: 1920, height: 760, left: 396, top: 16, right: 72, bottom: 100 },
  ]) {
    const frame = fitMapFrame(area);
    const [left, top] = toScreen(frame, 0, 0);
    const [right, bottom] = toScreen(frame, FRAME_WIDTH, FRAME_HEIGHT);
    const freeRight = area.width - area.right;
    const freeBottom = area.height - area.bottom;
    assert.ok(left >= area.left - 1e-9 && right <= freeRight + 1e-9);
    assert.ok(top >= area.top - 1e-9 && bottom <= freeBottom + 1e-9);
    // The frame spans the tighter dimension and is centered in the other.
    const spansWidth = close(left, area.left) && close(right, freeRight);
    const spansHeight = close(top, area.top) && close(bottom, freeBottom);
    assert.ok(spansWidth || spansHeight);
    assert.ok(close(left - area.left, freeRight - right));
    assert.ok(close(top - area.top, freeBottom - bottom));
  }
});

test("the viewBox covers the whole window without distortion", () => {
  const frame = fitMapFrame({ width: 390, height: 844, left: 8, top: 110, right: 8, bottom: 430 });
  assert.ok(Math.abs(frame.w * frame.s - 390) < 1e-9);
  assert.ok(Math.abs(frame.h * frame.s - 844) < 1e-9);
  const [left] = toScreen(frame, 0, 0);
  const [right] = toScreen(frame, FRAME_WIDTH, 0);
  assert.ok(Math.abs(left - 8) < 1e-9 && Math.abs(right - 382) < 1e-9);
});

test("a fully covered window still yields a usable frame", () => {
  const frame = fitMapFrame({ width: 400, height: 300, left: 380, top: 290, right: 30, bottom: 40 });
  assert.ok(frame.s > 0 && Number.isFinite(frame.x) && Number.isFinite(frame.y));
});
