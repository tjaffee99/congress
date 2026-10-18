export const FRAME_WIDTH = 1000;
export const FRAME_HEIGHT = 620;

/**
 * The map is projected into a fixed FRAME_WIDTH × FRAME_HEIGHT frame while
 * its SVG covers the whole window. Return the SVG viewBox that fits the frame,
 * centered, into the part of the window left uncovered by the floating panel,
 * timeline and controls. `s` is screen pixels per frame unit.
 *
 * @param {{ width: number, height: number, left: number, top: number, right: number, bottom: number }} area
 * @returns {{ x: number, y: number, w: number, h: number, s: number }}
 */
export function fitMapFrame({ width, height, left, top, right, bottom }) {
  const freeWidth = Math.max(120, width - left - right);
  const freeHeight = Math.max(120, height - top - bottom);
  const s = Math.min(freeWidth / FRAME_WIDTH, freeHeight / FRAME_HEIGHT);
  return {
    x: -(left + (freeWidth - FRAME_WIDTH * s) / 2) / s,
    y: -(top + (freeHeight - FRAME_HEIGHT * s) / 2) / s,
    w: width / s,
    h: height / s,
    s,
  };
}
