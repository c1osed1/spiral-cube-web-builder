import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import monacoEditorPluginRaw from "vite-plugin-monaco-editor";

const monacoEditorPlugin =
  typeof monacoEditorPluginRaw === "function"
    ? monacoEditorPluginRaw
    : (monacoEditorPluginRaw as { default: typeof monacoEditorPluginRaw }).default;

export default defineConfig({
  plugins: [
    react(),
    monacoEditorPlugin({
      languageWorkers: ["editorWorkerService", "json"]
    })
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true
      }
    }
  }
});
