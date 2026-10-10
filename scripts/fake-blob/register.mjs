// Points every import of @vercel/blob at the in-memory fake beside this file.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/<test>.ts
//
// Both module systems: tsx runs this repo's .ts files as CommonJS (require),
// which never passes through an ESM resolve hook, so that path is patched too.
// Without it the app's own lib/ files quietly got the REAL SDK.
import Module, { register, createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const fakeUrl = new URL("./vercel-blob.cjs", import.meta.url).href;
const fakePath = fileURLToPath(fakeUrl);

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(spec, ctx, next) {
        if (spec === "@vercel/blob") return { url: ${JSON.stringify(fakeUrl)}, shortCircuit: true };
        return next(spec, ctx);
      }
    `)
);

const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "@vercel/blob") return fakePath;
  return original.call(this, request, ...rest);
};

// Load it once now, so ESM and CJS importers share ONE in-memory store.
createRequire(import.meta.url)(fakePath);
