const CLOUDFLARE_WORKERS_STUB =
  "data:text/javascript," +
  encodeURIComponent("export const env = {};");

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: CLOUDFLARE_WORKERS_STUB, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const projectRelative = specifier.slice(2);
    const url = new URL(`../../${projectRelative}`, import.meta.url);
    try {
      return await nextResolve(url.href, context);
    } catch {
      try {
        return await nextResolve(`${url.href}.ts`, context);
      } catch {
        return nextResolve(new URL("index.ts", `${url.href}/`).href, context);
      }
    }
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
