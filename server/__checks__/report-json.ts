/**
 * Does a report survive the model running out of room?
 *
 *   npm run check:report-json
 *
 * WHY
 *   A life report is one JSON object with an area per key. When a reply is cut
 *   off by the token budget it stops mid-sentence — and the whole report was
 *   then thrown away, including the five areas that were complete, costing the
 *   person a paid report and another minute of waiting. The parser has to keep
 *   what finished.
 */
import { parseJsonLoose } from "../gemini";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) { console.error(`FAIL  ${name}${detail ? " — " + detail : ""}`); failures++; }
};

const area = (n: string) => ({
  summary: `${n} summary, with a comma, a "quote" and a colon: like this.`,
  past: `• **Venus-Saturn (2023–2027)**: work was slow, money was tight, and it asked for patience.`,
  present: `• **Venus-Saturn (2023–2027)**: this is the stretch you are in.`,
  future: `• **Venus-Mercury (2027–2029)**: things open up.`,
  positive: "Real strengths.", caution: "Real cautions.",
  guidance: "Do this, then that.", disclaimer: "Not medical advice.",
});
const full = JSON.stringify({ health: area("health"), wealth: area("wealth"), career: area("career") }, null, 2);

check("a complete report parses", Object.keys(parseJsonLoose(full) ?? {}).length === 3);

// Cut at every point inside the third area: the first two must always survive.
let worst = "";
for (let cut = full.indexOf('"career"'); cut < full.length; cut += 7) {
  const j = parseJsonLoose(full.slice(0, cut));
  if (!j || !j.health || !j.wealth) { worst = `cut at ${cut}`; break; }
}
check("a reply cut off mid-area keeps the areas that finished", !worst, worst);

// The shapes a model actually sends around the JSON.
check("fenced JSON parses", !!parseJsonLoose("```json\n" + full + "\n```")?.health);
check("JSON after a sentence parses", !!parseJsonLoose("Here is the report:\n" + full)?.health);
check("garbage is still null", parseJsonLoose("sorry, I cannot do that") === null);
check("empty is null", parseJsonLoose("") === null);

if (failures) { console.error(`\n${failures} failure(s).`); process.exit(1); }
console.log("PASS — complete, fenced, prefixed and truncated reports all parse; a cut-off reply keeps every area that finished.");
process.exit(0);
