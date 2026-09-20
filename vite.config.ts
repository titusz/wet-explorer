/** Build a static, sub-path-safe application on the project's stable port. */
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { host: "127.0.0.1", port: 43871, strictPort: true },
  preview: { host: "127.0.0.1", port: 43871, strictPort: true },
  build: { target: "es2022" },
});
