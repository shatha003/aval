import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildWorld } from "../src";

const out = resolve(process.argv[2] ?? "../../apps/web/public/world.json");
mkdirSync(dirname(out), { recursive: true });
const world = buildWorld();
writeFileSync(out, JSON.stringify(world.toFixture()));
console.log(`wrote ${out}: ${world.ledger.receipts.length} receipts, ${Object.keys(world.actors).length} actors`);
