import { build } from 'esbuild';

// ESM bundles need `require` for packages that call require() at runtime
// (dotenv → require('fs'), pg, etc.). esbuild's ESM output otherwise emits a
// stub that throws "Dynamic require of X is not supported". This banner brings
// a real require back via createRequire.
const banner = { js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" };

// CJS bundle (used by `npm start` locally; node_modules present, so external).
await build({
  entryPoints: ['server.ts'], bundle: true, platform: 'node',
  format: 'cjs', packages: 'external', sourcemap: true, outfile: 'dist/server.cjs',
});

// ESM bundle (Vercel serverless). Everything bundled in, with the require shim.
await build({
  entryPoints: ['server.ts'], bundle: true, platform: 'node',
  format: 'esm', outfile: 'server-bundle.mjs', banner,
});

console.log('server bundles built (cjs + esm with require shim)');
