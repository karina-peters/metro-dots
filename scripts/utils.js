import "dotenv/config";

export async function fetchStandardRoutes() {
  const url = new URL(`${process.env.WMATA_HOST}/TrainPositions/StandardRoutes`);
  url.searchParams.set("contentType", "json");

  try {
    const response = await fetch(url, {
      headers: { api_key: process.env.WMATA_API_KEY },
    });

    if (!response.ok) {
      throw new Error(`WMATA responded with ${response.status}`);
    }

    const json = await response.json();

    return json.StandardRoutes;
  } catch (err) {
    throw new Error(`Could not fetch StandardRoutes: ${err.message}`);
  }
}

export const getLineId = (lineCode, trackNum) => `${lineCode}-${trackNum}`;

export function deriveLines(routes) {
  const lines = new Map();

  for (const { LineCode, TrackNum, TrackCircuits } of routes) {
    const lineId = getLineId(LineCode, TrackNum);

    if (lines.has(lineId)) {
      throw new Error(`Duplicate route for line ${lineId}`);
    }

    const circuits = [...TrackCircuits]
      .sort((a, b) => a.SeqNum - b.SeqNum)
      .map(({ SeqNum, StationCode, CircuitId }) => ({
        id: CircuitId,
        seqNum: SeqNum,
        stnCode: StationCode,
      }));

    lines.set(lineId, circuits);
  }

  return lines;
}

export function deriveCircuitsByRegion(regions, lines) {
  const circuits = {};

  for (const { Id, Lines } of regions) {
    circuits[Id] = {};

    for (const { Code, Track, Origin, Terminus } of Lines) {
      const lineId = getLineId(Code, Track);
      circuits[Id][lineId] = lines.get(lineId).slice(Origin, Terminus);
    }
  }

  return circuits;
}
