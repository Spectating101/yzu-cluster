import base from "../vite.config.js";

const config = typeof base === "function" ? base({ command: "build", mode: "production" }) : base;
export default {
  ...config,
  build: { ...(config.build || {}), outDir: ".tmp-css-order", emptyOutDir: true, minify: false, cssMinify: false },
  plugins: [
    ...(config.plugins || []),
    {
      name: "css-order-markers",
      enforce: "pre",
      transform(code, id) {
        if (!id.endsWith(".css") || id.includes("node_modules")) return null;
        const rel = id.split("/drive/src/")[1] || id;
        return `.__css_order_marker{--file:"${rel}"}\n${code}`;
      },
    },
  ],
};
