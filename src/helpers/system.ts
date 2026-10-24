import { fetchJsonData } from "./utils.ts";
import { Circuit, Arrival, Station, Train } from "../models/system.model.ts";
import { ArrivalDTO, RouteDTO, TrainDTO, CircuitDTO, StationDTO } from "../models/wmata.model.ts";

export const REFRESH_RATE = 8000;
export const ARRIVAL_GROUPS = ["1", "2"];
const FORWARD = 1;
const BACKWARD = -1;

class SystemService {
  stationsByCode: Map<string, Station> = new Map<string, Station>();
  stationsById: Map<string, Station> = new Map<string, Station>();
  circuitsByLine: Map<string, Circuit[]> = new Map<string, Circuit[]>();

  constructor() {}

  async init(): Promise<[void, void]> {
    return Promise.all([this.loadStations(), this.loadCircuits()]);
  }

  getLineId(lineCode: string, lineNum: number): string {
    return `${lineCode}-${lineNum}`;
  }

  getStationName(code: string): string {
    const station = this.stationsByCode.get(code);
    if (!station) {
      throw new Error(`Station[${code}] not found`);
    }

    return station.name;
  }

  getStation(id: string): Station {
    const station = this.stationsById.get(id);
    if (!station) {
      throw new Error(`Station[${id}] not found`);
    }

    return station;
  }

  getStations(): Array<Station> {
    return [...this.stationsById.values()];
  }

  getNextStationCircuit(cktId: number, lineCode: string, lineNum: number): Circuit | null {
    const lineId = this.getLineId(lineCode, lineNum);
    const circuits = this.circuitsByLine.get(lineId) || [];

    const start = circuits.findIndex((c) => c.id === cktId);
    if (start === -1) {
      console.warn(`Circuit[${cktId}] not found on line [${lineId}]`);
      return null;
    }

    // TODO: handle circuits beyond terminal station
    const step = lineNum === 1 ? FORWARD : BACKWARD;
    for (let i = start; i >= 0 && i < circuits.length; i += step) {
      if (circuits[i].stnCode !== null) {
        return circuits[i];
      }
    }

    console.error(`Next station circuit for circuit[${cktId}] not found`);
    return null;
  }

  async fetchArrivals(stationId: string): Promise<Map<string, Map<string, Arrival[]>> | null> {
    try {
      const station = this.stationsById.get(stationId);
      if (!station) {
        throw new Error(`Station[${stationId}] not found`);
      }

      const codes = [...new Set(station.codes)].sort().join(",");
      const arrivalData: Array<ArrivalDTO> = await fetchJsonData(`/api/arrivals/${codes}`);

      const arrivals: Arrival[] = arrivalData.map(
        (data: ArrivalDTO) =>
          ({
            numCars: data.Car,
            destName: data.DestinationName,
            line: data.Line,
            min: data.Min,
            stnCode: data.LocationCode,
            group: data.Group,
          }) as Arrival,
      );

      return this.groupArrivals(station.codes, arrivals);
    } catch (error: any) {
      console.error(`Failed to get updated arrivals: ${error.message}`);
      return null;
    }
  }

  // TODO: group by line?
  async fetchTrains(): Promise<Array<Train> | null> {
    try {
      const positionData: Array<TrainDTO> = await fetchJsonData("/api/trains");

      const trains: Train[] = positionData
        .map(
          (data: TrainDTO) =>
            ({
              id: data.TrainId,
              lineCode: data.LineCode,
              destStnCode: data.DestinationStationCode,
              circuitId: data.CircuitId,
              direction: data.DirectionNum,
            }) as Train,
        )
        .filter((t: Train) => t.destStnCode !== null && t.lineCode !== null);
      // .sort((a: Train, b: Train) => a.id - b.id);

      return trains;
    } catch (error: any) {
      console.error(`Failed to get train positions: ${error.message}`);
      return null;
    }
  }

  private groupArrivals(stationCodes: string[], arrivals: Arrival[]): Map<string, Map<string, Arrival[]>> {
    const arrivalsByStation = new Map(
      stationCodes.map((code): [string, Map<string, Arrival[]>] => [
        code,
        new Map(ARRIVAL_GROUPS.map((group): [string, Arrival[]] => [group, []])),
      ]),
    );

    for (const arrival of arrivals) {
      const byGroup = arrivalsByStation.get(arrival.stnCode);
      if (!byGroup) {
        console.warn(`Arrival for unrequested station[${arrival.stnCode}]`);
        continue;
      }

      byGroup.getOrInsert(arrival.group, []).push(arrival);
    }

    return arrivalsByStation;
  }

  private groupTrains() {
    // TODO: group by line, destination
  }

  private async loadStations(): Promise<void> {
    const stationData: Array<StationDTO> = await fetchJsonData("/data/stations.json");

    if (!stationData || stationData.length === 0) {
      throw new Error("Unable to load station information");
    }

    for (const data of stationData) {
      const station = this.stationsById.getOrInsert(data.id, {
        id: data.id,
        name: data.name,
        codes: [],
      });

      station.codes.push(data.code);
      this.stationsByCode.set(data.code, station);
    }
  }

  private async loadCircuits(): Promise<void> {
    const routeData: Array<RouteDTO> = await fetchJsonData("/data/routes.json");

    if (!routeData || routeData.length === 0) {
      throw new Error("Unable to load circuit information");
    }

    for (const data of routeData) {
      const lineId = this.getLineId(data.LineCode, data.TrackNum);
      const circuits = data.TrackCircuits?.map((c: CircuitDTO) => ({ id: c.CircuitId, stnCode: c.StationCode, seqNum: c.SeqNum }));

      this.circuitsByLine.set(lineId, circuits);
    }
  }
}

const metroSystem = new SystemService();

export { metroSystem };
