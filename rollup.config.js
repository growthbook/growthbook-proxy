// eslint-disable-next-line import/no-named-as-default
import babel from "@rollup/plugin-babel";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";

const extensions = [".js", ".ts", ".tsx", ".jsx"];

export default {
  input: "src/app.ts",
  output: [
    {
      file: "dist/esm/index.js",
      format: "esm",
      sourcemap: true,
    },
    {
      file: "dist/cjs/index.js",
      format: "cjs",
      name: "growthbook-proxy",
      sourcemap: true,
    },
  ],
  plugins: [
    json(),
    resolve({ extensions, jsnext: true }),
    commonjs(),
    replace({
      "process.env.NODE_ENV": JSON.stringify("production"),
      preventAssignment: true,
    }),
    babel({
      babelHelpers: "bundled",
      extensions,
    }),
  ],
};
