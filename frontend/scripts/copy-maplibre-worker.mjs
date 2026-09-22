// Puts the MapLibre worker into the site's statics — without it the map does not work at all.
//
// Why: MapLibre parses vector tiles in a WORKER, and since version 6 its code ships as separate
// files (`maplibre-gl-worker.mjs` + the neighbouring `maplibre-gl-shared.mjs`, which the worker
// imports RELATIVE TO ITSELF). Next's bundler cannot see this graph: it moves one worker
// file into statics under a hashed name, the neighbour stays in node_modules, the import 404s — and
// the worker dies silently. From outside it looks like "the map does not work": the style's background is drawn,
// there are no streets, not a single tile request, the `load` event never fires, zero errors in the console
// (docs/pitfalls.md).
//
// So both files are placed side by side UNDER THEIR OWN NAMES — then the relative
// import inside the worker lands where it was aimed.
//
// A copy from node_modules rather than a file in the repository: a copy in git would go stale on the very first
// library update, and silently — the bundled version would move on while the worker stayed old.
// The destination directory is in `.gitignore`; the script is run by the `predev`/`prebuild` hooks.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "maplibre-gl", "dist");
const to = join(root, "public", "maplibre");

// The list grows if the library splits the worker into more files: the sign is a 404 in the network
// on something under `/maplibre/` and an empty map.
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(to, { recursive: true });
for (const file of files) copyFileSync(join(from, file), join(to, file));
console.log(`maplibre: the worker and its neighbour were copied to public/maplibre (${files.length} files)`);
