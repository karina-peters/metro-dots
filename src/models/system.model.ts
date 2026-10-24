export type Station = {
  id: string;
  codes: string[];
  name: string;
};

export type Circuit = {
  id: number;
  seqNum: number;
  stnCode: string | null;
};

export type Line = {
  lineId: string;
  circuits: Circuit[];
};

export type Arrival = {
  numCars: string;
  destName: string;
  line: string;
  min: string;
  group: string;
  stnCode: string;
};

export type Train = {
  id: string;
  lineCode: string;
  destStnCode: string;
  circuitId: number;
  direction: number;
};
