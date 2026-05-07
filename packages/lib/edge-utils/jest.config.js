const path = require("path");

module.exports = {
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          target: "es2017",
          module: "commonjs",
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          moduleResolution: "node",
          typeRoots: [
            path.resolve(__dirname, "node_modules/@types"),
            path.resolve(__dirname, "../../../node_modules/@types"),
          ],
          types: ["jest", "node"],
        },
      },
    ],
  },
};
