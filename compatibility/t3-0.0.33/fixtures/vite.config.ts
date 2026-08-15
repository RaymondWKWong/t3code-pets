import { defineConfig } from "vite-plus";

export default defineConfig(() => ({
  optimizeDeps: {
    include: ["react-dom/client"],
  },
}));
