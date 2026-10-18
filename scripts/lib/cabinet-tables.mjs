export function decodeHtml(value) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(Number.parseInt(number, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .trim();
}

// Wikipedia's lists of secretaries shade acting secretaries' rows and explain
// the shade in a legend ("Acting secretary of labor", "Denotes acting HHS
// secretary"). Most of those rows never say "Acting" themselves.
export function actingShades(html) {
  const shades = new Set();
  for (const match of html.matchAll(/class="legend-color[^"]*"\s+style="[^"]*background-color:\s*(#[\da-f]{3,6})/gi)) {
    const end = match.index + match[0].length;
    const label = decodeHtml(html.slice(end, end + 400).replace(/^[^>]*>/, "")).replace(/\s+/g, " ").trim();
    if (/^(?:denotes |indicates )?acting\b/i.test(label)) shades.add(match[1].toLowerCase());
  }
  return shades;
}

export function isActingRow(row, shades) {
  return /\bActing\b/i.test(row)
    || [...row.matchAll(/background(?:-color)?:\s*(#[\da-f]{3,6})/gi)].some((match) => shades.has(match[1].toLowerCase()));
}

// An acting secretary serves until the next secretary takes office, but some
// tables give a later last day (Ingrid Kolb to February 4, 2025, though Chris
// Wright took office on February 3).
export function endActingTenuresAtSuccession(holders) {
  const sorted = [...holders].sort((a, b) => a.a.localeCompare(b.a));
  sorted.forEach((holder, index) => {
    const successor = sorted.slice(index + 1).find((candidate) => candidate.n !== holder.n);
    if (holder.x && successor && holder.a < successor.a && (!holder.z || holder.z > successor.a)) holder.z = successor.a;
  });
  return holders;
}
