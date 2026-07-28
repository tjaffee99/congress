export const OFFICIAL_OFFICES = [
  { title: "President", group: "Executive", created: "1789-03-04", order: 1 },
  { title: "Vice President", group: "Executive", created: "1789-03-04", order: 2 },

  // Permanent and former executive departments, shown for the life of their
  // Cabinet membership rather than for the life of a successor agency.
  { title: "Secretary of State", group: "Cabinet", created: "1789-09-15", order: 10 },
  { title: "Secretary of the Treasury", group: "Cabinet", created: "1789-09-11", order: 11 },
  { title: "Secretary of War", group: "Cabinet", created: "1789-08-07", discontinued: "1947-09-18", order: 12 },
  { title: "Secretary of Defense", group: "Cabinet", created: "1947-09-17", order: 12 },
  { title: "Secretary of the Navy", group: "Cabinet", created: "1798-06-18", discontinued: "1949-08-10", order: 12.1 },
  { title: "Secretary of the Army", group: "Cabinet", created: "1947-09-18", discontinued: "1949-08-10", order: 12.2 },
  { title: "Secretary of the Air Force", group: "Cabinet", created: "1947-09-18", discontinued: "1949-08-10", order: 12.3 },
  { title: "Attorney General", group: "Cabinet", created: "1789-09-24", order: 13 },
  { title: "Postmaster General", group: "Cabinet", created: "1829-03-09", discontinued: "1971-07-01", order: 14 },
  { title: "Secretary of the Interior", group: "Cabinet", created: "1849-03-03", order: 14.1 },
  { title: "Secretary of Agriculture", group: "Cabinet", created: "1889-02-15", order: 15 },
  { title: "Secretary of Commerce and Labor", group: "Cabinet", created: "1903-02-14", discontinued: "1913-03-04", order: 16 },
  { title: "Secretary of Commerce", group: "Cabinet", created: "1913-03-04", order: 16.1 },
  { title: "Secretary of Labor", group: "Cabinet", created: "1913-03-04", order: 17 },
  { title: "Secretary of Health, Education & Welfare", group: "Cabinet", created: "1953-04-11", discontinued: "1980-05-04", order: 18 },
  { title: "Secretary of Health & Human Services", group: "Cabinet", created: "1980-05-04", order: 18.1 },
  { title: "Secretary of Housing & Urban Development", group: "Cabinet", created: "1965-09-09", order: 19 },
  { title: "Secretary of Transportation", group: "Cabinet", created: "1966-10-15", order: 20 },
  { title: "Secretary of Energy", group: "Cabinet", created: "1977-08-04", order: 21 },
  { title: "Secretary of Education", group: "Cabinet", created: "1980-05-04", order: 22 },
  { title: "Secretary of Veterans Affairs", group: "Cabinet", created: "1989-03-15", order: 23 },
  { title: "Secretary of Homeland Security", group: "Cabinet", created: "2003-01-24", order: 24 },

  // A president can elevate additional offices to Cabinet rank. These windows
  // intentionally follow Cabinet status, not the underlying office's lifespan.
  { title: "U.S. Ambassador to the United Nations", group: "Cabinet", created: "1953-01-20", discontinued: "1989-01-20", order: 29 },
  { title: "U.S. Ambassador to the United Nations", group: "Cabinet", created: "1993-01-20", discontinued: "2001-01-20", order: 29 },
  { title: "U.S. Ambassador to the United Nations", group: "Cabinet", created: "2009-01-20", discontinued: "2019-01-01", order: 29 },
  { title: "U.S. Ambassador to the United Nations", group: "Cabinet", created: "2021-01-20", discontinued: "2025-01-20", order: 29 },
  { title: "Director of the Office of Management & Budget", group: "Cabinet", created: "1953-01-20", discontinued: "1961-01-20", order: 27 },
  { title: "Director of the Office of Management & Budget", group: "Cabinet", created: "1969-01-20", order: 27 },
  { title: "White House Chief of Staff", group: "Cabinet", created: "1953-01-20", discontinued: "1961-01-20", order: 25 },
  { title: "White House Chief of Staff", group: "Cabinet", created: "1974-08-09", discontinued: "1977-01-20", order: 25 },
  { title: "White House Chief of Staff", group: "Cabinet", created: "1993-01-20", order: 25 },
  { title: "Counselor to the President", group: "Cabinet", created: "1969-01-20", discontinued: "1977-01-20", order: 25.1 },
  { title: "Counselor to the President", group: "Cabinet", created: "1981-01-20", discontinued: "1985-01-20", order: 25.1 },
  { title: "Counselor to the President", group: "Cabinet", created: "1992-01-01", discontinued: "1993-01-20", order: 25.1 },
  { title: "White House Counsel", group: "Cabinet", created: "1974-08-09", discontinued: "1977-01-20", order: 25.2 },
  { title: "United States Trade Representative", group: "Cabinet", created: "1975-01-01", order: 28 },
  { title: "Chair of the Council of Economic Advisers", group: "Cabinet", created: "1977-01-20", discontinued: "1981-01-20", order: 26.1 },
  { title: "Chair of the Council of Economic Advisers", group: "Cabinet", created: "1993-01-20", discontinued: "2001-01-20", order: 26.1 },
  { title: "Chair of the Council of Economic Advisers", group: "Cabinet", created: "2009-01-20", discontinued: "2017-01-20", order: 26.1 },
  { title: "Chair of the Council of Economic Advisers", group: "Cabinet", created: "2021-01-20", discontinued: "2025-01-20", order: 26.1 },
  { title: "National Security Advisor", group: "Cabinet", created: "1977-01-20", discontinued: "1981-01-20", order: 25.3 },
  { title: "Director of Central Intelligence", group: "Cabinet", created: "1981-01-20", discontinued: "1989-01-20", order: 31.1 },
  { title: "Director of Central Intelligence", group: "Cabinet", created: "1995-05-10", discontinued: "2001-01-20", order: 31.1 },
  { title: "EPA Administrator", group: "Cabinet", created: "1993-01-20", order: 26 },
  { title: "Director of National Drug Control Policy", group: "Cabinet", created: "1993-01-20", discontinued: "2009-01-20", order: 30.1 },
  { title: "Small Business Administrator", group: "Cabinet", created: "1994-01-01", discontinued: "2001-01-20", order: 30 },
  { title: "Small Business Administrator", group: "Cabinet", created: "2012-01-13", order: 30 },
  { title: "FEMA Administrator", group: "Cabinet", created: "1996-02-26", discontinued: "2001-01-20", order: 30.2 },
  { title: "Director of National Intelligence", group: "Cabinet", created: "2017-01-20", order: 31 },
  { title: "Director of the Central Intelligence Agency", group: "Cabinet", created: "2017-01-20", discontinued: "2021-01-20", order: 32 },
  { title: "Director of the Central Intelligence Agency", group: "Cabinet", created: "2023-07-21", order: 32 },
  { title: "Director of the Office of Science & Technology Policy", group: "Cabinet", created: "2021-01-20", discontinued: "2025-01-20", order: 33 },
];

export function officialOfficesForDate(group, date) {
  return OFFICIAL_OFFICES
    .filter((office) => office.group === group && office.created <= date && (!office.discontinued || date < office.discontinued))
    .sort((a, b) => a.order - b.order);
}
