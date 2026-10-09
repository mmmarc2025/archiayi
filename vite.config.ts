import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages project site: BASE_PATH=/archiayi/
// Local dev and other hosts leave this unset and use relative asset URLs.
const base = process.env.BASE_PATH?.trim() || "./";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base,
  server: { host: "0.0.0.0", port: 4179, strictPort: true, allowedHosts: true },
  preview: { host: "0.0.0.0", port: 4179, strictPort: true, allowedHosts: true },
});
