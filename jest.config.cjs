module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/scanner"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  clearMocks: true,
};