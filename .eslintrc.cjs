/** @type {import("eslint").Linter.Config} */
const config = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
  },
  // @ts-ignore
  plugins: ["@typescript-eslint"],
};

module.exports = config;
