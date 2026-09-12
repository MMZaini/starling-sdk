import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  target: "es2022",
  platform: "neutral",
  external: ["react", "react/jsx-runtime"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
});
