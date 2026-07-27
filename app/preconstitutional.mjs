export const FEDERAL_CONGRESS_START = "1789-03-04";
export const CONFEDERATION_CONGRESS_START = "1781-03-01";
export const VERMONT_REPUBLIC_START = "1777-01-15";

export function vermontPolityForDate(date) {
  return date < VERMONT_REPUBLIC_START ? "New York" : "Vermont Republic";
}

export const PRECONSTITUTIONAL_STATE_NAMES = [
  "Connecticut", "Delaware", "Georgia", "Maryland", "Massachusetts", "New Hampshire",
  "New Jersey", "New York", "North Carolina", "Pennsylvania", "Rhode Island",
  "South Carolina", "Virginia",
];

export function preconstitutionalCongressLabel(date) {
  return date < CONFEDERATION_CONGRESS_START
    ? "Second Continental Congress"
    : "Congress of the Confederation";
}

export const PRECONSTITUTIONAL_PRESIDENTS = [
  ["John Hancock", "MA", "1776-07-04", "1777-11-01", "https://en.wikipedia.org/wiki/John_Hancock"],
  ["Henry Laurens", "SC", "1777-11-01", "1778-12-10", "https://en.wikipedia.org/wiki/Henry_Laurens"],
  ["John Jay", "NY", "1778-12-10", "1779-09-28", "https://en.wikipedia.org/wiki/John_Jay"],
  ["Samuel Huntington", "CT", "1779-09-28", "1781-03-02", "https://en.wikipedia.org/wiki/Samuel_Huntington_(Connecticut_politician)"],
  ["Samuel Huntington", "CT", "1781-03-02", "1781-07-07", "https://en.wikipedia.org/wiki/Samuel_Huntington_(Connecticut_politician)"],
  ["Thomas McKean", "DE", "1781-07-10", "1781-10-24", "https://en.wikipedia.org/wiki/Thomas_McKean"],
  ["John Hanson", "MD", "1781-11-05", "1782-11-04", "https://en.wikipedia.org/wiki/John_Hanson"],
  ["Elias Boudinot", "NJ", "1782-11-04", "1783-11-03", "https://en.wikipedia.org/wiki/Elias_Boudinot"],
  ["Thomas Mifflin", "PA", "1783-11-03", "1784-11-30", "https://en.wikipedia.org/wiki/Thomas_Mifflin"],
  ["Richard Henry Lee", "VA", "1784-11-30", "1785-11-05", "https://en.wikipedia.org/wiki/Richard_Henry_Lee"],
  ["John Hancock", "MA", "1785-11-23", "1786-06-06", "https://en.wikipedia.org/wiki/John_Hancock"],
  ["Nathaniel Gorham", "MA", "1786-06-06", "1787-02-02", "https://en.wikipedia.org/wiki/Nathaniel_Gorham"],
  ["Arthur St. Clair", "PA", "1787-02-02", "1787-10-06", "https://en.wikipedia.org/wiki/Arthur_St._Clair"],
  ["Cyrus Griffin", "VA", "1788-01-22", "1789-03-03", "https://en.wikipedia.org/wiki/Cyrus_Griffin"],
].map(([n, s, a, z, w]) => ({ n, s, a, z, w }));

export function presidentOfCongress(date) {
  return PRECONSTITUTIONAL_PRESIDENTS.find((president) => president.a <= date && president.z > date) ?? null;
}
