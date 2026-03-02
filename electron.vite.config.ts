import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["execa"] })],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "electron/main.ts"),
        output: { entryFileNames: "index.js" },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "electron/preload.ts"),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "electron/renderer"),
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "electron/renderer/index.html"),
      },
    },
  },
});
