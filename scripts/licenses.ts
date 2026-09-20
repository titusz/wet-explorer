/** Enforce the approved runtime and development dependency license policies. */
interface PackageLicense {
  version?: string;
  license?: string;
  dev?: boolean;
}

const runtimeLicenses = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
]);
const developmentLicenses = new Set([...runtimeLicenses, "ISC", "MPL-2.0"]);

/** Report unapproved or missing metadata without broadening the ISCC package exception. */
export function licenseViolations(
  packages: Record<string, PackageLicense>,
): string[] {
  const violations: string[] = [];
  for (const [path, entry] of Object.entries(packages)) {
    if (!path) continue;
    if (
      path === "node_modules/@iscc/wasm" &&
      entry.version === "0.6.0" &&
      !entry.license
    )
      continue;
    const permitted = entry.dev ? developmentLicenses : runtimeLicenses;
    if (!entry.license?.split(" OR ").some((license) => permitted.has(license)))
      violations.push(
        `${path}: ${entry.license || "missing license"} (${entry.dev ? "development" : "runtime"})`,
      );
  }
  return violations;
}
