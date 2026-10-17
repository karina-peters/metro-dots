import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchStandardRoutes, deriveCircuitsByRegion, deriveLines } from "./utils.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DATA = path.join(root, "public", "data");

const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));

const writeJson = async (file, data) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
};

async function main() {
  const [stations, regions, routes] = await Promise.all([
    readJson("source-data/stations.json"),
    readJson("source-data/regions.json"),
    fetchStandardRoutes(),
  ]);

  const lines = deriveLines(routes);
  const circuitsByRegion = deriveCircuitsByRegion(regions, lines);

  const circuits = Object.entries(circuitsByRegion).map(([regionId, byLine]) => [
    path.join(PUBLIC_DATA, "circuits", `${regionId}.json`),
    {
      data: Object.entries(byLine).map(([lineId, circuits]) => ({ lineId, regionId, circuits })),
    },
  ]);

  const outputsFiles = [
    [path.join(PUBLIC_DATA, "stations.json"), { data: stations.map((s) => ({ code: s.Code, name: s.Name })) }],
    [path.join(PUBLIC_DATA, "lines.json"), { data: [...lines.keys()] }],
    [path.join(PUBLIC_DATA, "routes.json"), { data: routes }],
    ...regions.map((r) => [path.join(PUBLIC_DATA, "regions", `${r.Id}.json`), { data: r }]),
    ...circuits,
  ];

  await rm(PUBLIC_DATA, { recursive: true, force: true });
  await Promise.all(outputsFiles.map(([file, data]) => writeJson(file, data)));

  console.log(`Built ${outputsFiles.length} files: ${lines.size} lines, ${regions.length} regions, ${routes.length} routes.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
