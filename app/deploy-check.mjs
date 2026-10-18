const PAGE_CHUNK = /\/assets\/page-[\w-]+\.js/;

/**
 * GitHub Pages lets browsers reuse the page for ten minutes, so a visit soon
 * after a deploy can run the previous build. Given the URLs of the scripts
 * this page loaded and the HTML the server returns now, return the newer page
 * bundle, or null when the running build is current or can't be compared.
 *
 * @param {string[]} loadedUrls
 * @param {string} latestHtml
 * @returns {string | null}
 */
export function newerPageChunk(loadedUrls, latestHtml) {
  const loaded = loadedUrls.map((url) => url.match(PAGE_CHUNK)?.[0]).find(Boolean);
  const latest = latestHtml.match(PAGE_CHUNK)?.[0];
  return loaded && latest && loaded !== latest ? latest : null;
}
