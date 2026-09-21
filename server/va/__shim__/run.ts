import { run } from "./vitest";
const files = process.argv.slice(2);
for (const f of files) await import(f);
const failed = await run();
process.exit(failed ? 1 : 0);
