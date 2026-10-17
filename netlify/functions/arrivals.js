import { wmataFetch, isValidStation, UpstreamError } from "./helpers/wmata.js";
import { OK, Error } from "./helpers/response.js";

export default async (_req, context) => {
  const { station } = context.params;
  const codes = station.split(",");

  if (!codes.every(isValidStation)) {
    return Error(400, "Invalid station code list");
  }

  try {
    const json = await wmataFetch(`StationPrediction.svc/json/GetPrediction/${station}`);
    return OK(json.Trains);
  } catch (err) {
    console.error(`arrivals failed for ${station}:`, err.message);
    return Error(err instanceof UpstreamError ? 502 : 500, "Unable to fetch arrivals");
  }
};

export const config = { method: "GET", path: "/api/arrivals/:station" };
