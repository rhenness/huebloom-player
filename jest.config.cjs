module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/scanner", "<rootDir>/ui/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  clearMocks: true,
};
