import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: { "^.+\\.ts$": ["ts-jest", { useESM: false }] },
  // If you keep mocks in node_modules that must be transformed, tweak:
  // transformIgnorePatterns: ["/node_modules/"]
};

export default config;
