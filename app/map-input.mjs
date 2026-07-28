export function isLikelyMouseWheel({ deltaX = 0, deltaY = 0, deltaMode = 0, ctrlKey = false }) {
  if (ctrlKey || Math.abs(deltaX) > 1) return false;
  if (deltaMode === 1 || deltaMode === 2) return Math.abs(deltaY) > 0;

  const magnitude = Math.abs(deltaY);
  return magnitude >= 40 && Number.isInteger(deltaY);
}

export function clampZoom(value) {
  return Math.max(1, Math.min(16, value));
}
