require("@testing-library/jest-dom");

if (typeof structuredClone !== "function") {
  global.structuredClone = (value) => JSON.parse(JSON.stringify(value));
}
