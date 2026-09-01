#!/usr/bin/env node
/**
 * One-off snapshot of the Pokémon TCG API's /v2/sets, written to
 * src/data/tcgSets.json. Never run at build or request time — re-run by hand
 * with `npm run fetch:sets` to pick up newly released sets.
 *
 * Keyless auth is sufficient (1,000 requests/day, 30/min) for an occasional
 * manual run, so no API key is read or required.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_URL = 'https://api.pokemontcg.io/v2/sets';
const PAGE_SIZE = 250;
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 500;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'tcgSets.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fetch one page, retrying on 5xx/network errors with exponential backoff. */
async function fetchPage(page) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${API_URL}?page=${page}&pageSize=${PAGE_SIZE}`);
      if (res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} fetching page ${page}`);
      } else if (!res.ok) {
        // Non-5xx failures (e.g. 4xx) are not transient — fail fast.
        throw new Error(`HTTP ${res.status} fetching page ${page}: ${await res.text()}`);
      } else {
        return await res.json();
      }
    } catch (err) {
      lastErr = err;
    }
    if (attempt < MAX_ATTEMPTS) {
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      console.error(`Attempt ${attempt} for page ${page} failed (${lastErr.message}); retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  throw new Error(`Failed to fetch page ${page} after ${MAX_ATTEMPTS} attempts: ${lastErr.message}`);
}

async function fetchAllSets() {
  const all = [];
  let page = 1;
  let totalCount = Infinity;

  while (all.length < totalCount) {
    const body = await fetchPage(page);
    const data = body.data ?? [];
    totalCount = body.totalCount ?? data.length;
    all.push(...data);
    if (data.length < PAGE_SIZE) break; // last page
    page += 1;
  }

  return all;
}

function mapSet(raw) {
  return {
    id: raw.id,
    name: raw.name,
    series: raw.series,
    releaseDate: raw.releaseDate,
    symbol: raw.images?.symbol,
    logo: raw.images?.logo,
  };
}

function validate(sets) {
  if (!Array.isArray(sets)) throw new Error('Result is not an array');
  if (sets.length < 100 || sets.length > 500) {
    throw new Error(`Set count ${sets.length} is outside the plausible range [100, 500]`);
  }
  for (const s of sets) {
    if (!s.id || !s.name || !s.symbol || !s.logo) {
      throw new Error(`Set entry missing required field(s): ${JSON.stringify(s)}`);
    }
  }
}

async function main() {
  const rawSets = await fetchAllSets();
  const sets = rawSets.map(mapSet);

  validate(sets);

  sets.sort((a, b) => (a.releaseDate < b.releaseDate ? -1 : a.releaseDate > b.releaseDate ? 1 : 0));

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(sets, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${sets.length} sets to src/data/tcgSets.json`);
}

main().catch((err) => {
  console.error(`fetch-tcg-sets failed: ${err.message}`);
  process.exit(1);
});
