import { getOrInitializeMapValue, fetchJsonData } from "./utils.js";

export const REFRESH_RATE = 8000;
export const REGIONS = {
  ALL: "All",
  DC: "DC",
};

class SystemService {
  constructor() {
    this.dataPromise = null;
    this.dataLoaded = false;

    this.stnCodeToName = new Map(); // Map<string, string>
    this.cktListCache = new Map(); // Map<string, Map<string, Array<string>>
  }

  async init() {
    this.dataPromise = Promise.all([this._loadStationNames(), this._loadCircuits()]).then(() => (this.dataLoaded = true));
  }

  getLineId = (lineCode, lineNum) => `${lineCode}-${lineNum}`;

  async getStationName(code) {
    if (!this.dataLoaded) await this.dataPromise;

    const name = this.stnCodeToName.get(code);
    if (!name) {
      throw new Error(`Station code${code} not found`);
    }

    return name;
  }

  async getNextStationCkt(cktId, lineCode, lineNum) {
    if (!this.dataLoaded) await this.dataPromise;

    const entries = this.cktListCache.get(REGIONS.ALL);
    const lineId = this.getLineId(lineCode, lineNum);
    const circuits = lineNum === 1 ? entries?.get(lineId) : Array.from(entries.get(lineId)).reverse();

    const currentCkt = circuits?.find((c) => c.id === cktId);
    if (!currentCkt) {
      console.warn(`Circuit[${cktId}] is undefined`);
      return null;
    }

    // TODO: handle circuits beyond terminal station
    const nextStnCkt = circuits.find((c) => {
      let hasStation = c.stnCode !== null;
      if (lineNum === 1) {
        return hasStation && c.seqNum >= currentCkt.seqNum;
      } else {
        return hasStation && c.seqNum <= currentCkt.seqNum;
      }
    });

    if (!nextStnCkt) {
      console.error(`Next station circuit for circuit[${cktId}] not found`);
    }

    return nextStnCkt;
  }

  async getCircuits(regionId) {
    if (!this.dataLoaded) await this.dataPromise;

    const circuits = this.cktListCache.get(regionId);
    if (!circuits) {
      throw new Error(`Circuits for region[${regionId}] not found`);
    }

    return Array.from(circuits.entries().map(([key, value]) => ({ lineId: key, circuits: value })));
  }

  fetchStations = () => fetchJsonData("/data/stations.json");

  fetchines = () => fetchJsonData("/data/lines.json");

  fetchRoutes = () => fetchJsonData("/data/routes.json");

  fetchCircuits = (regionId) => fetchJsonData(`/data/circuits/${regionId}.json`);

  fetchArrivals = (stations) => fetchJsonData(`/api/arrivals/${[...new Set(stations)].sort().join(",")}`);

  fetchTrainPositions = async () => {
    return (await fetchJsonData("/api/trains")).filter((t) => t.DestinationStationCode !== null).sort((a, b) => a.TrainId - b.TrainId);
  };

  async _loadStationNames() {
    const stations = await this.fetchStations();

    if (stations === null || stations.length === 0) {
      console.error("Station information is missing!");
      return;
    }

    // Populate map with station codes and names
    for (const { code, name } of stations) {
      this.stnCodeToName.set(code, name);
    }
  }

  async _loadCircuits() {
    for (const regionId of Object.values(REGIONS)) {
      const cktsByLine = await this.fetchCircuits(regionId);

      if (!cktsByLine || cktsByLine.length === 0) {
        console.error(`Circuit information for region ${regionId} is missing!`);
        return;
      }

      // Populate region map with lines and their circuits
      const regionToLines = getOrInitializeMapValue(this.cktListCache, regionId, new Map());
      for (const { lineId, circuits } of cktsByLine) {
        regionToLines.set(lineId, circuits);
      }
    }
  }
}

const metroSystem = new SystemService();

export { metroSystem };
