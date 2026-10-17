import { wmataFetch, UpstreamError } from "./helpers/wmata.js";
import { OK, Error } from "./helpers/response.js";

export default async () => {
  try {
    const json = await wmataFetch("TrainPositions/TrainPositions");
    return OK(json.TrainPositions);
  } catch (err) {
    console.error("trains failed:", err.message);
    return Error(err instanceof UpstreamError ? 502 : 500, "Unable to fetch train positions");
  }
};

export const config = { method: "GET", path: "/api/trains" };
