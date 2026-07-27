export function scrubStepForDuration(milliseconds) {
  if (milliseconds < 700) return 1;
  if (milliseconds < 1_600) return 2;
  if (milliseconds < 3_000) return 5;
  if (milliseconds < 5_000) return 14;
  return 45;
}

export function isEditableKeyboardTarget(target) {
  if (!target || typeof target !== "object") return false;
  const tagName = target.tagName?.toLowerCase();
  return Boolean(target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select");
}
