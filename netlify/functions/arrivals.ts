import { wmataFetch, UpstreamError } from "./helpers/wmata.js";
import { OK, Error } from "./helpers/response.js";
import type { Context } from "@netlify/functions";

export default async (_req: Request, context: Context) => {
  const { station } = context.params;

  try {
    const json = await wmataFetch(`StationPrediction.svc/json/GetPrediction/${station}`);
    return OK(json.Trains);
  } catch (error: any) {
    const errorStr = `Unable to fetch arrivals for station[${station}]`;
    console.error(`${errorStr}: `, error.message);
    return Error(error instanceof UpstreamError ? 502 : 500, errorStr);
  }
};

export const config = { method: "GET", path: "/api/arrivals/:station" };
