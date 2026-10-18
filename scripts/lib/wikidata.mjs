export const sparqlEndpoint = "https://query.wikidata.org/sparql";

// Every "position held" (P39) statement for the given offices, with the
// person's English Wikipedia article.
export function positionHeldQuery(positionIds) {
  return `
SELECT ?person ?personLabel ?position ?start ?end ?article WHERE {
  VALUES ?position { ${positionIds.map((id) => `wd:${id}`).join(" ")} }
  ?person wdt:P31 wd:Q5; p:P39 ?statement .
  # Deprecated statements are ones editors have marked as wrong.
  ?statement ps:P39 ?position; wikibase:rank ?rank .
  FILTER(?rank != wikibase:DeprecatedRank)
  OPTIONAL { ?statement pq:P580 ?start }
  OPTIONAL { ?statement pq:P582 ?end }
  OPTIONAL {
    ?article schema:about ?person;
      schema:isPartOf <https://en.wikipedia.org/>.
  }
  # Wikidata is moving names that read the same in every language from "en"
  # to the language-neutral "mul" label; in 2026 that left Dick Cheney and
  # Kamala Harris without an English label, which dropped them from the query.
  OPTIONAL { ?person rdfs:label ?enLabel . FILTER(LANG(?enLabel) = "en") }
  OPTIONAL { ?person rdfs:label ?mulLabel . FILTER(LANG(?mulLabel) = "mul") }
  BIND(COALESCE(?enLabel, ?mulLabel) AS ?personLabel)
  FILTER(BOUND(?personLabel))
}`;
}

export function positionHeldUrl(positionIds) {
  const url = new URL(sparqlEndpoint);
  url.searchParams.set("query", positionHeldQuery(positionIds));
  url.searchParams.set("format", "json");
  return url.href;
}

// Wikidata also holds announced departures and editors' guesses: in 2026 an
// edit gave Justice Alito, who is still serving, an end date of "2027". Nothing
// after the day the query ran can have happened, so a later end date is
// dropped and a term that has not started yet is left out.
export function positionHeldRows(bindings, asOf) {
  const asOfDate = asOf.slice(0, 10);
  return bindings.flatMap((row) => {
    const start = row.start?.value?.slice(0, 10) ?? null;
    const end = row.end?.value?.slice(0, 10) ?? null;
    if (start && start > asOfDate) return [];
    return [{
      person: row.person.value.split("/").pop(),
      position: row.position.value.split("/").pop(),
      name: row.personLabel.value,
      article: row.article?.value ?? null,
      start,
      end: end && end <= asOfDate ? end : null,
    }];
  });
}
