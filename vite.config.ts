import { resolve } from "pathe";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "GbfrActWsPackage",
      fileName: "gbfr-act-ws-package",
      formats: ["es", "cjs", "umd", "iife"],
    },
  },
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
});
