const SECESSION_INTERVALS = {
  SC: ["1860-12-20", "1865-06-03"],
  MS: ["1861-01-09", "1865-06-03"],
  FL: ["1861-01-10", "1865-06-03"],
  AL: ["1861-01-11", "1865-06-03"],
  GA: ["1861-01-19", "1865-06-03"],
  LA: ["1861-01-26", "1865-06-03"],
  TX: ["1861-02-01", "1865-06-03"],
  VA: ["1861-04-17", "1865-06-03"],
  AR: ["1861-05-06", "1865-06-03"],
  NC: ["1861-05-20", "1865-06-03"],
  TN: ["1861-06-08", "1865-06-03"],
};

/**
 * Mark the eleven seceded states from their ordinances of secession through
 * the final major Confederate surrender on June 2, 1865.
 *
 * @param {string | undefined} stateCode
 * @param {string} date
 */
export function isConfederateState(stateCode, date) {
  const interval = SECESSION_INTERVALS[stateCode];
  return Boolean(interval && interval[0] <= date && date < interval[1]);
}
