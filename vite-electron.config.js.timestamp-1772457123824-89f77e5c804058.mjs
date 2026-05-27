// vite-electron.config.ts
import { defineConfig } from "file:///D:/Downloads/bolt.diy-main/bolt.diy-main/node_modules/.pnpm/vite@5.4.19_@types+node@24.1.0_sass-embedded@1.89.2/node_modules/vite/dist/node/index.js";
import { vitePlugin as remixVitePlugin } from "file:///D:/Downloads/bolt.diy-main/bolt.diy-main/node_modules/.pnpm/@remix-run+dev@2.16.8_@remix-run+react@2.16.8_react-dom@18.3.1_react@18.3.1__react@18.3.1_typ_uozynh2jdinnz6binv6akofmd4/node_modules/@remix-run/dev/dist/index.js";
import UnoCSS from "file:///D:/Downloads/bolt.diy-main/bolt.diy-main/node_modules/.pnpm/unocss@0.61.9_postcss@8.5.6_rollup@4.45.1_vite@5.4.19_@types+node@24.1.0_sass-embedded@1.89.2_/node_modules/unocss/dist/vite.mjs";
import { nodePolyfills } from "file:///D:/Downloads/bolt.diy-main/bolt.diy-main/node_modules/.pnpm/vite-plugin-node-polyfills@0.25.0_rollup@4.45.1_vite@5.4.19_@types+node@24.1.0_sass-embedded@1.89.2_/node_modules/vite-plugin-node-polyfills/dist/index.js";
import { optimizeCssModules } from "file:///D:/Downloads/bolt.diy-main/bolt.diy-main/node_modules/.pnpm/vite-plugin-optimize-css-modules@1.2.0_vite@5.4.19_@types+node@24.1.0_sass-embedded@1.89.2_/node_modules/vite-plugin-optimize-css-modules/dist/index.mjs";
import tsconfigPaths from "file:///D:/Downloads/bolt.diy-main/bolt.diy-main/node_modules/.pnpm/vite-tsconfig-paths@4.3.2_typescript@5.8.3_vite@5.4.19_@types+node@24.1.0_sass-embedded@1.89.2_/node_modules/vite-tsconfig-paths/dist/index.mjs";
import { execSync } from "child_process";
var getGitHash = () => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "no-git-info";
  }
};
var vite_electron_config_default = defineConfig((config) => {
  return {
    define: {
      __COMMIT_HASH: JSON.stringify(getGitHash()),
      __APP_VERSION: JSON.stringify(process.env.npm_package_version)
    },
    build: {
      target: "esnext"
    },
    plugins: [
      nodePolyfills({
        include: ["path", "buffer", "process"]
      }),
      remixVitePlugin({
        future: {
          v3_fetcherPersist: true,
          v3_relativeSplatPath: true,
          v3_throwAbortReason: true,
          v3_lazyRouteDiscovery: true
        },
        serverModuleFormat: "esm"
      }),
      UnoCSS(),
      tsconfigPaths(),
      config.mode === "production" && optimizeCssModules({ apply: "build" }),
      {
        name: "replaceReactDomServerImport",
        enforce: "pre",
        transform(code, id) {
          if (id.endsWith("entry.server.tsx")) {
            return code.replace(/from 'react-dom\/server';?/g, "from 'react-dom/server.browser';");
          }
          return void 0;
        }
      }
    ],
    envPrefix: [
      "VITE_",
      "OPENAI_LIKE_API_BASE_URL",
      "OPENAI_LIKE_API_MODELS",
      "OLLAMA_API_BASE_URL",
      "LMSTUDIO_API_BASE_URL",
      "TOGETHER_API_BASE_URL"
    ],
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler"
        }
      }
    }
  };
});
export {
  vite_electron_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS1lbGVjdHJvbi5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxEb3dubG9hZHNcXFxcYm9sdC5kaXktbWFpblxcXFxib2x0LmRpeS1tYWluXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJEOlxcXFxEb3dubG9hZHNcXFxcYm9sdC5kaXktbWFpblxcXFxib2x0LmRpeS1tYWluXFxcXHZpdGUtZWxlY3Ryb24uY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9EOi9Eb3dubG9hZHMvYm9sdC5kaXktbWFpbi9ib2x0LmRpeS1tYWluL3ZpdGUtZWxlY3Ryb24uY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgeyB2aXRlUGx1Z2luIGFzIHJlbWl4Vml0ZVBsdWdpbiB9IGZyb20gJ0ByZW1peC1ydW4vZGV2JztcbmltcG9ydCBVbm9DU1MgZnJvbSAndW5vY3NzL3ZpdGUnO1xuaW1wb3J0IHsgbm9kZVBvbHlmaWxscyB9IGZyb20gJ3ZpdGUtcGx1Z2luLW5vZGUtcG9seWZpbGxzJztcbmltcG9ydCB7IG9wdGltaXplQ3NzTW9kdWxlcyB9IGZyb20gJ3ZpdGUtcGx1Z2luLW9wdGltaXplLWNzcy1tb2R1bGVzJztcbmltcG9ydCB0c2NvbmZpZ1BhdGhzIGZyb20gJ3ZpdGUtdHNjb25maWctcGF0aHMnO1xuXG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuXG4vLyBHZXQgZ2l0IGhhc2ggd2l0aCBmYWxsYmFja1xuY29uc3QgZ2V0R2l0SGFzaCA9ICgpID0+IHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZXhlY1N5bmMoJ2dpdCByZXYtcGFyc2UgLS1zaG9ydCBIRUFEJykudG9TdHJpbmcoKS50cmltKCk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiAnbm8tZ2l0LWluZm8nO1xuICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKGNvbmZpZykgPT4ge1xuICByZXR1cm4ge1xuICAgIGRlZmluZToge1xuICAgICAgX19DT01NSVRfSEFTSDogSlNPTi5zdHJpbmdpZnkoZ2V0R2l0SGFzaCgpKSxcbiAgICAgIF9fQVBQX1ZFUlNJT046IEpTT04uc3RyaW5naWZ5KHByb2Nlc3MuZW52Lm5wbV9wYWNrYWdlX3ZlcnNpb24pLFxuICAgIH0sXG4gICAgYnVpbGQ6IHtcbiAgICAgIHRhcmdldDogJ2VzbmV4dCcsXG4gICAgfSxcbiAgICBwbHVnaW5zOiBbXG4gICAgICBub2RlUG9seWZpbGxzKHtcbiAgICAgICAgaW5jbHVkZTogWydwYXRoJywgJ2J1ZmZlcicsICdwcm9jZXNzJ10sXG4gICAgICB9KSxcbiAgICAgIHJlbWl4Vml0ZVBsdWdpbih7XG4gICAgICAgIGZ1dHVyZToge1xuICAgICAgICAgIHYzX2ZldGNoZXJQZXJzaXN0OiB0cnVlLFxuICAgICAgICAgIHYzX3JlbGF0aXZlU3BsYXRQYXRoOiB0cnVlLFxuICAgICAgICAgIHYzX3Rocm93QWJvcnRSZWFzb246IHRydWUsXG4gICAgICAgICAgdjNfbGF6eVJvdXRlRGlzY292ZXJ5OiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBzZXJ2ZXJNb2R1bGVGb3JtYXQ6ICdlc20nLFxuICAgICAgfSksXG4gICAgICBVbm9DU1MoKSxcbiAgICAgIHRzY29uZmlnUGF0aHMoKSxcbiAgICAgIGNvbmZpZy5tb2RlID09PSAncHJvZHVjdGlvbicgJiYgb3B0aW1pemVDc3NNb2R1bGVzKHsgYXBwbHk6ICdidWlsZCcgfSksXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdyZXBsYWNlUmVhY3REb21TZXJ2ZXJJbXBvcnQnLFxuICAgICAgICBlbmZvcmNlOiAncHJlJyxcbiAgICAgICAgdHJhbnNmb3JtKGNvZGUsIGlkKSB7XG4gICAgICAgICAgaWYgKGlkLmVuZHNXaXRoKCdlbnRyeS5zZXJ2ZXIudHN4JykpIHtcbiAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgKiBIYWNrOiBmaXggdGhlIGlzc3VlIHdpdGggcmVhY3QtZG9tL3NlcnZlciBub3QgYmVpbmcgZm91bmQgaW4gZWxlY3Ryb25cbiAgICAgICAgICAgICAqIFJlcGxhY2UgdGhlIGltcG9ydCBmcm9tICdyZWFjdC1kb20vc2VydmVyJyB3aXRoICdyZWFjdC1kb20vc2VydmVyLmJyb3dzZXInLCBvbmx5IGZvciBlbGVjdHJvbiBidWlsZFxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICByZXR1cm4gY29kZS5yZXBsYWNlKC9mcm9tICdyZWFjdC1kb21cXC9zZXJ2ZXInOz8vZywgXCJmcm9tICdyZWFjdC1kb20vc2VydmVyLmJyb3dzZXInO1wiKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICBdLFxuICAgIGVudlByZWZpeDogW1xuICAgICAgJ1ZJVEVfJyxcbiAgICAgICdPUEVOQUlfTElLRV9BUElfQkFTRV9VUkwnLFxuICAgICAgJ09QRU5BSV9MSUtFX0FQSV9NT0RFTFMnLFxuICAgICAgJ09MTEFNQV9BUElfQkFTRV9VUkwnLFxuICAgICAgJ0xNU1RVRElPX0FQSV9CQVNFX1VSTCcsXG4gICAgICAnVE9HRVRIRVJfQVBJX0JBU0VfVVJMJyxcbiAgICBdLFxuICAgIGNzczoge1xuICAgICAgcHJlcHJvY2Vzc29yT3B0aW9uczoge1xuICAgICAgICBzY3NzOiB7XG4gICAgICAgICAgYXBpOiAnbW9kZXJuLWNvbXBpbGVyJyxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFvVSxTQUFTLG9CQUFvQjtBQUNqVyxTQUFTLGNBQWMsdUJBQXVCO0FBQzlDLE9BQU8sWUFBWTtBQUNuQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDBCQUEwQjtBQUNuQyxPQUFPLG1CQUFtQjtBQUUxQixTQUFTLGdCQUFnQjtBQUd6QixJQUFNLGFBQWEsTUFBTTtBQUN2QixNQUFJO0FBQ0YsV0FBTyxTQUFTLDRCQUE0QixFQUFFLFNBQVMsRUFBRSxLQUFLO0FBQUEsRUFDaEUsUUFBUTtBQUNOLFdBQU87QUFBQSxFQUNUO0FBQ0Y7QUFFQSxJQUFPLCtCQUFRLGFBQWEsQ0FBQyxXQUFXO0FBQ3RDLFNBQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxNQUNOLGVBQWUsS0FBSyxVQUFVLFdBQVcsQ0FBQztBQUFBLE1BQzFDLGVBQWUsS0FBSyxVQUFVLFFBQVEsSUFBSSxtQkFBbUI7QUFBQSxJQUMvRDtBQUFBLElBQ0EsT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNQLGNBQWM7QUFBQSxRQUNaLFNBQVMsQ0FBQyxRQUFRLFVBQVUsU0FBUztBQUFBLE1BQ3ZDLENBQUM7QUFBQSxNQUNELGdCQUFnQjtBQUFBLFFBQ2QsUUFBUTtBQUFBLFVBQ04sbUJBQW1CO0FBQUEsVUFDbkIsc0JBQXNCO0FBQUEsVUFDdEIscUJBQXFCO0FBQUEsVUFDckIsdUJBQXVCO0FBQUEsUUFDekI7QUFBQSxRQUNBLG9CQUFvQjtBQUFBLE1BQ3RCLENBQUM7QUFBQSxNQUNELE9BQU87QUFBQSxNQUNQLGNBQWM7QUFBQSxNQUNkLE9BQU8sU0FBUyxnQkFBZ0IsbUJBQW1CLEVBQUUsT0FBTyxRQUFRLENBQUM7QUFBQSxNQUNyRTtBQUFBLFFBQ0UsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFFBQ1QsVUFBVSxNQUFNLElBQUk7QUFDbEIsY0FBSSxHQUFHLFNBQVMsa0JBQWtCLEdBQUc7QUFLbkMsbUJBQU8sS0FBSyxRQUFRLCtCQUErQixrQ0FBa0M7QUFBQSxVQUN2RjtBQUVBLGlCQUFPO0FBQUEsUUFDVDtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsSUFDQSxXQUFXO0FBQUEsTUFDVDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUFBLElBQ0EsS0FBSztBQUFBLE1BQ0gscUJBQXFCO0FBQUEsUUFDbkIsTUFBTTtBQUFBLFVBQ0osS0FBSztBQUFBLFFBQ1A7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
