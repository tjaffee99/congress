# American Atlas

The U.S. House, Senate, executive branch, Supreme Court and congressional
leadership on any date since July 4, 1776. Live at
[congress.theojaffee.net](https://congress.theojaffee.net).

## Deploying

Every push to `main` runs the tests, builds the site as static files
(`npm run build:static`, which writes `dist/client`), and publishes it with
GitHub Pages via `.github/workflows/deploy-pages.yml`. The page loads all of its
data from `public/data/` in the browser, so it needs no server.

`npm run build` still produces the Cloudflare Worker build the site was created
with; `npm test` builds it and checks the rendered page.

## Commands

- `npm run dev`: local development server
- `npm test`: build, then run the data and rendering tests in `tests/`
- `npm run build:static`: static site in `dist/client`
- `npm run lint`: ESLint

## Updating the data

The JSON in `public/data/` is generated and committed; nothing is fetched from
third parties at runtime. Rebuild it whenever officeholders change (special
elections, appointments, resignations, Cabinet turnover) and at the start of
each Congress.

Members of Congress come from
[unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators),
with party labels from Voteview and dated House seat corrections from
Wikipedia's per-Congress "Changes in membership" tables:

```bash
mkdir -p work
for file in legislators-current.yaml legislators-historical.yaml; do
  curl -fsSL -o "work/$file" \
    "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/$file"
done
npm run data:house-tenures   # scripts/data/house-tenure-corrections.json + public/data/members.json
```

Executive, judicial and leadership offices come from Wikidata, Wikipedia's
Cabinet tables, senate.gov and history.house.gov:

```bash
node scripts/scrape-cabinet-officeholders.mjs   # data/cabinet-officeholders.json
node scripts/build-officials.mjs                # public/data/officials.json
```

Upstream sources lag real events by days or weeks. Hand corrections live next
to the code that applies them: `TERM_OVERRIDES` in `scripts/build-data.mjs` for
member dates, and `currentOfficeholderCorrections` in
`scripts/build-officials.mjs` for recent executive changes. Review the diff of
the generated JSON before committing; Wikidata and Wikipedia edits can
introduce regressions, and `npm test` checks the known ones.

House district maps are TopoJSON per Congress in `public/data/districts/` and
`public/data/districts-high/`, built with mapshaper from GeoJSON in
`work/congressional-district-boundaries/GeoJson`:

```bash
node scripts/build-data.mjs districts 120 --detail=both
```

Until a Congress has its own boundaries, the map draws the newest plan listed
as `LATEST_DISTRICT_CONGRESS` in `app/congress-terms.mjs`; raise it once the
new files exist.
