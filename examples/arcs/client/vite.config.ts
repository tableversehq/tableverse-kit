import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { port: Number(process.env.ARCS_CLIENT_PORT ?? 5173) },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          motion: ["motion/react"],
        },
      },
    },
  },
});
