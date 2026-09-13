import { defineConfig } from "@playwright/test";

// Exercise the deployed asset paths as well as the local development server.
const preview = process.env.SHOWCASE_PREVIEW === "true";
const basePath = process.env.SHOWCASE_BASE_PATH || "/";
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath)) throw new Error("SHOWCASE_BASE_PATH must be a slash-delimited URL path");
const baseURL = `http://127.0.0.1:4173${basePath}`;

export default defineConfig({
  testDir: "./tests/browser",
  use: { baseURL },
  webServer: {
    command: `npm run ${preview ? "example:preview" : "dev"} -- --port 4173 --strictPort --base ${basePath}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI && !preview,
  },
});
