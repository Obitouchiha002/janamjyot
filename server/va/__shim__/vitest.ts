/**
 * Just enough of vitest to run the ported VedicAstra tests with tsx, so their
 * own assertions check the port against JanamJyot's engine without adding a
 * test framework to this project.
 */
type Fn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: Fn }> = [];
const stack: string[] = [];
export function describe(name: string, fn: () => void) { stack.push(name); fn(); stack.pop(); }
export function it(name: string, fn: Fn) { tests.push({ name: [...stack, name].join(" › "), fn }); }
export const test = it;
const eq = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
function matchers(v: any, negate = false) {
  const ok = (c: boolean, msg: string) => { if (c === negate) throw new Error((negate ? "NOT " : "") + msg); };
  return {
    toBe: (e: any) => ok(Object.is(v, e), `expected ${JSON.stringify(v)} to be ${JSON.stringify(e)}`),
    toEqual: (e: any) => ok(eq(v, e), `expected ${JSON.stringify(v)} to equal ${JSON.stringify(e)}`),
    toMatch: (r: RegExp | string) => ok(typeof r === "string" ? String(v).includes(r) : r.test(String(v)), `expected ${JSON.stringify(v)} to match ${r}`),
    toContain: (e: any) => ok(Array.isArray(v) ? v.some((x) => eq(x, e) || x === e) : String(v).includes(e), `expected ${JSON.stringify(v)} to contain ${JSON.stringify(e)}`),
    toHaveLength: (n: number) => ok(v?.length === n, `expected length ${v?.length} to be ${n}`),
    toBeLessThanOrEqual: (n: number) => ok(v <= n, `expected ${v} <= ${n}`),
    toBeLessThan: (n: number) => ok(v < n, `expected ${v} < ${n}`),
    toBeGreaterThan: (n: number) => ok(v > n, `expected ${v} > ${n}`),
    toBeGreaterThanOrEqual: (n: number) => ok(v >= n, `expected ${v} >= ${n}`),
    toBeTruthy: () => ok(!!v, `expected ${JSON.stringify(v)} to be truthy`),
    toBeCloseTo: (e: number, digits = 2) => ok(Math.abs(v - e) < Math.pow(10, -digits) / 2, `expected ${v} ≈ ${e}`),
  };
}
export function expect(v: any) { const m: any = matchers(v); m.not = matchers(v, true); return m; }
export async function run() {
  let failed = 0;
  for (const t of tests) {
    try { await t.fn(); } catch (e: any) { failed++; console.log(`FAIL  ${t.name}\n      ${e?.message}`); }
  }
  console.log(`${tests.length - failed}/${tests.length} passed`);
  return failed;
}
