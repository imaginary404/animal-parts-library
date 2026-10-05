import { defineConfig, loadEnv } from "vite";
import { smithsonianMiddleware } from "./server/smithsonian.ts";
import { inaturalistMiddleware } from "./server/inaturalist.ts";

export default defineConfig(({ mode }) => {
  // loadEnv's empty prefix is server-side only; Vite still exposes only VITE_*
  // variables to browser code. Never give the API key a VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), "");
  const middleware = smithsonianMiddleware(process.env.SMITHSONIAN_API_KEY ?? env.SMITHSONIAN_API_KEY);
  const inaturalist = inaturalistMiddleware();
  return {
    plugins: [{
      name: "source-apis",
      configureServer(server) { server.middlewares.use(middleware); server.middlewares.use(inaturalist); },
      configurePreviewServer(server) { server.middlewares.use(middleware); server.middlewares.use(inaturalist); },
    }],
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
    preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  };
});
