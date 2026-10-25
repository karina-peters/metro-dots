import stations from "../../../source-data/stations.json" with { type: "json" };

const TIMEOUT_LENGTH = 5000;
const stationCodes = new Set(stations.map((s) => s.Code));

export class UpstreamError extends Error {}

export async function wmataFetch(route: string) {
  const { WMATA_HOST, WMATA_API_KEY } = process.env;
  if (!WMATA_HOST || !WMATA_API_KEY) {
    throw new Error("Missing WMATA_HOST or WMATA_API_KEY in the function environment");
  }

  const url = new URL(`${WMATA_HOST}/${route}`);
  url.searchParams.set("contentType", "json");

  const response = await fetch(url, {
    headers: { api_key: WMATA_API_KEY },
    signal: AbortSignal.timeout(TIMEOUT_LENGTH),
  });

  if (!response.ok) {
    throw new UpstreamError(`WMATA responded with ${response.status}`);
  }

  return response.json();
}

export const isValidStation = (code: string) => stationCodes.has(code);
