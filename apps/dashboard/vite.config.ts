import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** The same React app runs in a browser and inside the VS Code webview. */
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "../extension/media", emptyOutDir: true }
});
