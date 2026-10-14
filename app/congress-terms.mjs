import { FEDERAL_CONGRESS_START } from "./preconstitutional.mjs";

// The newest Congress with House district boundaries in public/data/districts.
// A later Congress draws this plan until its own boundaries are built.
export const LATEST_DISTRICT_CONGRESS = 119;

/**
 * The numbered Congress in session on an ISO date, or 0 before the first
 * federal Congress. Terms began on March 4 through the 73rd Congress and on
 * January 3 from the 74th onward.
 *
 * @param {string} date
 * @returns {number}
 */
export function congressFor(date) {
  if (date < FEDERAL_CONGRESS_START) return 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 1;
  const [year, month, day] = date.split("-").map(Number);
  if (date >= "1935-01-03") {
    const start = year % 2 === 1 && (month > 1 || (month === 1 && day >= 3)) ? year : year - (year % 2 === 0 ? 1 : 2);
    return Math.max(1, (start - 1787) / 2);
  }
  const start = year % 2 === 1 && (month > 3 || (month === 3 && day >= 4)) ? year : year - (year % 2 === 0 ? 1 : 2);
  return Math.max(1, Math.min(73, (start - 1787) / 2));
}

/**
 * First day of a Congress and first day of the next one. The 73rd Congress
 * was cut short when the Twentieth Amendment moved the start to January 3.
 *
 * @param {number} congress
 * @returns {readonly [string, string]}
 */
export function congressDates(congress) {
  const startYear = congress <= 73 ? 1787 + congress * 2 : 1935 + (congress - 74) * 2;
  const start = `${startYear}-${congress <= 73 ? "03-04" : "01-03"}`;
  const end = congress >= 73 ? `${startYear + 2}-01-03` : `${startYear + 2}-03-04`;
  return [start, end];
}

/**
 * Which party controls a chamber given its seat counts by governing party.
 * In an evenly split Senate the Vice President's party controls, whichever
 * tied party happens to be counted first.
 *
 * @param {Map<string, number>} controlCounts
 * @param {number} seatTotal
 * @param {string | null | undefined} vicePresidentParty
 * @param {boolean} vicePresidentBreaksTies
 */
export function chamberControl(controlCounts, seatTotal, vicePresidentParty, vicePresidentBreaksTies) {
  const majority = Math.floor(seatTotal / 2) + 1;
  const ranked = [...controlCounts.entries()].sort((a, b) => b[1] - a[1]);
  const leadingSeats = ranked[0]?.[1] ?? 0;
  const tieBreak = vicePresidentBreaksTies
    && leadingSeats === seatTotal / 2
    && ranked.some(([party, seats]) => seats === leadingSeats && party === vicePresidentParty);
  const leadingParty = tieBreak ? vicePresidentParty : ranked[0]?.[0];
  return { majority, leadingParty, leadingSeats, tieBreak, hasControl: leadingSeats >= majority || tieBreak };
}
