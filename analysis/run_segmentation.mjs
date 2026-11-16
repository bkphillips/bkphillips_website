// Runs the site's TypeScript segmentation on JSON from stdin:
//   { "y": [...], "model": "level" | "trend", "maxK": 8, "minSize": 5 }
// Node 24 imports the .ts file directly.
import { segment } from "../src/lib/segmentation.ts";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const { y, model, maxK, minSize } = JSON.parse(input);
const out = segment(y, model, maxK, minSize);
process.stdout.write(JSON.stringify({ changePoints: out.changePoints, cost: out.cost }));
