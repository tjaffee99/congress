const DISTRICT_LABELS = {
  1: "First Military District",
  2: "Second Military District",
  3: "Third Military District",
  4: "Fourth Military District",
  5: "Fifth Military District",
};

const STATE_DISTRICTS = {
  VA: { number: 1, intervals: [["1867-03-02", "1870-01-26"]] },
  NC: { number: 2, intervals: [["1867-03-02", "1868-06-25"]] },
  SC: { number: 2, intervals: [["1867-03-02", "1868-06-25"]] },
  AL: { number: 3, intervals: [["1867-03-02", "1868-06-25"]] },
  FL: { number: 3, intervals: [["1867-03-02", "1868-06-25"]] },
  GA: {
    number: 3,
    intervals: [
      ["1867-03-02", "1868-06-25"],
      ["1869-12-24", "1870-07-15"],
    ],
  },
  AR: { number: 4, intervals: [["1867-03-02", "1868-06-22"]] },
  MS: { number: 4, intervals: [["1867-03-02", "1870-02-23"]] },
  LA: { number: 5, intervals: [["1867-03-02", "1868-06-25"]] },
  TX: { number: 5, intervals: [["1867-03-02", "1870-03-30"]] },
};

/**
 * Return the military government district applying to a former Confederate
 * state on a date, ending the layer as each state regained representation.
 * Georgia's second interval reflects its renewed military administration.
 *
 * @param {string | undefined} stateCode
 * @param {string} date
 */
export function reconstructionDistrictForState(stateCode, date) {
  const district = STATE_DISTRICTS[stateCode];
  if (!district || !district.intervals.some(([start, end]) => start <= date && date < end)) return null;
  return { number: district.number, label: DISTRICT_LABELS[district.number] };
}

export function reconstructionDistrictLabel(number) {
  return DISTRICT_LABELS[number] ?? null;
}
