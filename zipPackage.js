import zipcodesUsPackage from "./node_modules/zipcodes-us/package.json";

export const ZIPCODES_US_VERSION = zipcodesUsPackage.version;

export function extractZipList(moduleOrApi) {
  const api =
    typeof moduleOrApi?.find === "function"
      ? moduleOrApi
      : moduleOrApi?.default;
  if (typeof api?.find !== "function") return [];

  const zips = [];
  for (let i = 0; i < 100000; i += 1) {
    const zip = String(i).padStart(5, "0");
    if (api.find(zip)?.isValid) zips.push(zip);
  }
  return zips;
}
