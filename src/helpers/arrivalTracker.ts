import { Arrival } from "@models/system.model";

export type TrackedArrivalMap = Map<string, Map<string, TrackedArrival[]>>;
export type ArrivalMap = Map<string, Map<string, Arrival[]>>;

export interface TrackedArrival extends Arrival {
  id: number;
}

export class ArrivalTracker {
  private nextId = 0;
  private previousArrivals: TrackedArrivalMap = new Map();

  public update(arrivals: ArrivalMap | null): TrackedArrivalMap {
    const updated: TrackedArrivalMap = new Map();

    if (!arrivals) {
      return updated;
    }

    for (const [stationCode, tracks] of arrivals.entries()) {
      const updatedTracks = new Map<string, TrackedArrival[]>();

      for (const [track, trackArrivals] of tracks) {
        const previous = this.previousArrivals.get(stationCode)?.get(track) || [];
        const unmatched = previous;

        const tracked = trackArrivals?.map((arrival) => {
          const key = this.getKey(arrival);
          const min = this.parseStatus(arrival.min);

          const candidates = unmatched
            .filter((previous) => this.getKey(previous) === key)
            .map((previous) => ({
              previous,
              difference: Math.abs(this.parseStatus(previous.min) - min),
            }))
            .filter((candidate) => Number.isFinite(candidate.difference) && candidate.difference <= 1)
            .sort((a, b) => a.difference - b.difference);

          const match = candidates[0];

          if (match) {
            unmatched.splice(unmatched.indexOf(match.previous), 1);
            return { ...arrival, id: match.previous.id };
          }

          return { ...arrival, id: this.nextId++ };
        });

        if (tracked) {
          updatedTracks.set(track, tracked);
        }
      }

      updated.set(stationCode, updatedTracks);
    }

    this.previousArrivals = updated;

    return updated;
  }

  public reset(): void {
    this.previousArrivals = new Map();
  }

  private getKey(arrival: Arrival): string {
    return [arrival.numCars, arrival.destName, arrival.line, arrival.stnCode, arrival.group].join("|");
  }

  private parseStatus(status: string): number {
    switch (status.toUpperCase()) {
      case "ARR":
        return 0;
      case "BRD":
        return -1;
      case "---":
        return -2;
      default:
        return parseInt(status);
    }
  }
}
