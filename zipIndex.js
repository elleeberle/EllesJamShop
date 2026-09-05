let zipSet = null;

export function getZipSet() {
  return zipSet;
}

export function setZipIndex(zips) {
  zipSet = zips == null ? null : new Set(zips);
}

export function setZipIndexForTests(zips) {
  setZipIndex(zips);
}

export function zipIndexHas(digits) {
  return zipSet != null && zipSet.has(digits);
}
