export type ArrivalDTO = {
  Car: string;
  Destination: string;
  DestinationCode: string;
  DestinationName: string;
  Group: string;
  Line: string;
  LocationCode: string;
  LocationName: string;
  Min: string;
};

export type RouteDTO = {
  LineCode: string;
  TrackNum: number;
  TrackCircuits: Array<CircuitDTO>;
};

export type TrainDTO = {
  DestinationStationCode: string;
  TrainId: string;
  TrainNumber: string;
  CarCount: number;
  DirectionNum: number;
  CircuitId: number;
  LineCode: string;
};

export type CircuitDTO = {
  SeqNum: number;
  CircuitId: number;
  StationCode: string | null;
};

export type StationDTO = {
  id: string;
  name: string;
  code: string;
};
