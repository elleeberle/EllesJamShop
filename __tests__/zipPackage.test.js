import { extractZipList, ZIPCODES_US_VERSION } from "../zipPackage.js";

describe("extractZipList", () => {
  test("collects 5-digit ZIPs whose find() result is valid", () => {
    const valid = new Set(["00001", "37919", "99999"]);
    const zips = extractZipList({
      find: (zip) => ({ isValid: valid.has(zip) }),
    });
    expect(zips).toEqual(["00001", "37919", "99999"]);
  });

  test("reads find from a default export", () => {
    const zips = extractZipList({
      default: {
        find: (zip) => ({ isValid: zip === "60601" }),
      },
    });
    expect(zips).toEqual(["60601"]);
  });

  test("returns an empty list when find is missing", () => {
    expect(extractZipList({})).toEqual([]);
    expect(extractZipList(null)).toEqual([]);
  });
});

test("ZIPCODES_US_VERSION matches the installed package", () => {
  expect(ZIPCODES_US_VERSION).toMatch(/^\d+\.\d+\.\d+/);
});
