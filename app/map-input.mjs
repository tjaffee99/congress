/**
 * Zoom factor for a wheel event over the map. The atlas fills the window and
 * never scrolls, so every wheel event zooms the map, as in the other atlases:
 * mouse wheels and two-finger trackpad scrolls arrive as plain wheel events,
 * and trackpad pinches arrive as ctrl+wheel events with small pixel deltas.
 * Handling the pinch here is what keeps the browser from zooming the page.
 */
export function wheelZoomFactor({ deltaY = 0, deltaMode = 0, ctrlKey = false }) {
  const pixels = deltaMode === 1 ? deltaY * 33 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const factor = Math.exp(-pixels * (ctrlKey ? 0.01 : 0.002));
  return Math.max(0.5, Math.min(2, factor));
}

export function clampZoom(value) {
  return Math.max(1, Math.min(16, value));
}
