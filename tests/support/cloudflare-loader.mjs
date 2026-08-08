const CLOUDFLARE_WORKERS_STUB =
  "data:text/javascript," +
  encodeURIComponent("export const env = Object.freeze({});");

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: CLOUDFLARE_WORKERS_STUB, shortCircuit: true };
  }
  if (/^\.{1,2}\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // Fall through to Node's normal resolution so the original diagnostic is
      // preserved when the extensionless import is not a local TypeScript file.
    }
  }
  return nextResolve(specifier, context);
}
