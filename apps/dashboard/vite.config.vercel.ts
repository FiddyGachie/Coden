import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vercel build config — identical to the default config except:
 *   - outDir points to dist/ (not the extension's media folder)
 *   - base is "/" (absolute paths work on Vercel, unlike the VS Code webview)
 */
export default defineConfig({
  base: "/",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true }
});
