import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // ✅ Add this to see real file/line in errors (helps find duplicate createClient calls)
  build: {
    sourcemap: true,             // or: mode === 'development' ? true : 'hidden'
  },
}));
