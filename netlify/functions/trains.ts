import { wmataFetch, UpstreamError } from "./helpers/wmata.js";
import { OK, Error } from "./helpers/response.js";

export default async () => {
  try {
    const json = await wmataFetch("TrainPositions/TrainPositions");
    return OK(json.TrainPositions);
  } catch (error: any) {
    const errorStr = "Unable to fetch train positions";
    console.error(`${errorStr}: `, error.message);
    return Error(error instanceof UpstreamError ? 502 : 500, errorStr);
  }
};

export const config = { method: "GET", path: "/api/trains" };
