/**
 * Match House roster district conventions to the boundary dataset. Historical
 * member records use both 0 and -1 for at-large seats, while map boundaries
 * consistently use 0.
 *
 * @template {{ s: string, d: number | null }} T
 * @param {T[]} members
 * @param {string | undefined} state
 * @param {number} district
 * @param {boolean} hasNumberedDistricts
 * @returns {T[]}
 */
export function houseMembersForDistrict(members, state, district, hasNumberedDistricts) {
  if (!state || district < 0) return [];
  if (district === 0) {
    const atLarge = members.filter((member) => member.s === state && (member.d === 0 || member.d === -1));
    return atLarge.length || hasNumberedDistricts
      ? atLarge
      : members.filter((member) => member.s === state);
  }
  return members.filter((member) => member.s === state && member.d === district);
}

/**
 * Return statewide at-large members only when they served alongside numbered
 * districts. These seats should supplement each local district rather than
 * replace the internal map with a full-state polygon.
 *
 * @template {{ s: string, d: number | null }} T
 * @param {T[]} members
 * @param {string | undefined} state
 * @param {boolean} hasNumberedDistricts
 * @returns {T[]}
 */
export function houseStatewideAtLargeMembers(members, state, hasNumberedDistricts) {
  if (!state || !hasNumberedDistricts) return [];
  return members.filter((member) => member.s === state && (member.d === 0 || member.d === -1));
}

/**
 * Some historical all-at-large elections have a delegation in the roster but
 * no corresponding statewide geometry in the boundary source. Return those
 * states so the atlas can render the historical state outline as one clickable
 * at-large House seat instead of leaving it as the grey background.
 *
 * @template {{ s: string, d: number | null }} T
 * @param {T[]} members
 * @param {Set<string>} statesWithBoundary
 * @returns {Set<string>}
 */
export function houseStatesNeedingAtLargeFallback(members, statesWithBoundary) {
  const fallbackStates = new Set();
  for (const state of new Set(members.map((member) => member.s))) {
    const delegation = members.filter((member) => member.s === state);
    if (
      delegation.length
      && !statesWithBoundary.has(state)
      && delegation.every((member) => (member.d ?? 0) <= 0)
    ) fallbackStates.add(state);
  }
  return fallbackStates;
}

/**
 * Some source files reuse an at-large outline across a broad range that also
 * contains district-based elections. Keep that outline only when it describes
 * the whole plan or the congressional roster confirms an at-large seat.
 *
 * @param {{ s: string, d: number | null }[]} planMembers
 * @param {string | undefined} state
 * @param {number} district
 * @param {boolean} hasNumberedDistricts
 */
export function houseBoundaryBelongsToPlan(planMembers, state, district, hasNumberedDistricts) {
  if (!state || district < 0) return false;
  if (district > 0 || !hasNumberedDistricts) return true;
  return planMembers.some((member) => member.s === state && (member.d === 0 || member.d === -1));
}
