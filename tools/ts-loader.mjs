// Dev-only ESM loader: resolves extensionless relative TS imports (./foo -> ./foo.ts)
// so node --experimental-strip-types can run our shared/*.ts modules directly.
// Used by `npm run test:codec`. Not part of the app build.
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && !/\.[mc]?[jt]s$/.test(spec)) {
    try { return await next(spec + '.ts', ctx); } catch { /* fall through */ }
  }
  return next(spec, ctx);
}
