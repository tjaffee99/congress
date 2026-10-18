import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const sourceCacheDir = path.join(root, "work/sources");
export const USER_AGENT = "AmericanAtlas/1.0 (historical civic atlas; https://congress.theojaffee.net)";

// Rebuilds read the copy of each page saved by the first download, so running
// a build twice gives the same JSON and a source that has drifted or broken
// cannot silently change it. Pass --refresh (or REFRESH_SOURCES=1) to download
// every source again.
export const refreshSources = process.argv.includes("--refresh") || process.env.REFRESH_SOURCES === "1";

export function sourceCachePath(url, cacheDir = sourceCacheDir) {
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname).replace(/^\/+|\/+$/g, "").replace(/[^\w.-]+/g, "_") || "index";
  const query = parsed.search ? `-${createHash("sha256").update(parsed.search).digest("hex").slice(0, 12)}` : "";
  return path.join(cacheDir, parsed.hostname, `${name}${query}`);
}

async function download(url, { validate, fetchImpl, retryDelays }) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT } });
      // history.house.gov answers some requests with a 302 to /errorpage.htm.
      // fetch follows it to a 200 page without the table, which the parsers
      // used to read as an office with no holders.
      if (response.redirected && /error/i.test(new URL(response.url).pathname)) {
        throw new Error(`redirected to ${response.url}`);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const fetchedAt = new Date().toISOString();
      validate(text, fetchedAt);
      return { text, fetchedAt };
    } catch (error) {
      if (attempt >= retryDelays.length) throw new Error(`${url}: ${error.message}`, { cause: error });
      console.warn(`${url}: ${error.message}; retrying in ${retryDelays[attempt] / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
    }
  }
}

// Returns the page text and when it was downloaded. `validate(text, fetchedAt)`
// must throw for a response that is not the expected page (an error page, a
// rate-limit notice, a truncated table); such a response is retried and never
// cached.
export async function fetchSource(url, {
  validate = () => {},
  refresh = refreshSources,
  cacheDir = sourceCacheDir,
  fetchImpl = fetch,
  retryDelays = [2000, 4000, 8000, 16000],
} = {}) {
  const file = sourceCachePath(url, cacheDir);
  const metaFile = `${file}.meta.json`;
  if (!refresh) {
    try {
      const [text, meta] = await Promise.all([readFile(file, "utf8"), readFile(metaFile, "utf8").then(JSON.parse)]);
      validate(text, meta.fetchedAt);
      return { text, fetchedAt: meta.fetchedAt, cached: true };
    } catch (error) {
      if (error.code !== "ENOENT") console.warn(`${path.relative(root, file)}: ${error.message}; downloading again`);
    }
  }
  const { text, fetchedAt } = await download(url, { validate, fetchImpl, retryDelays });
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
  await writeFile(metaFile, `${JSON.stringify({ url, fetchedAt }, null, 2)}\n`);
  return { text, fetchedAt, cached: false };
}
