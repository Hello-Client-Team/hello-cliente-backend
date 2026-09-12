import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Router } from "express";
import helmet from "helmet";
import { env } from "../config/env.js";

const require = createRequire(import.meta.url);
const assets = dirname(require.resolve("swagger-ui-dist/package.json"));
const specification = JSON.parse(
  readFileSync(new URL("../../docs/openapi.json", import.meta.url), "utf8"),
);

export const docsRoutes = Router();
docsRoutes.use(
  helmet.contentSecurityPolicy({
    directives: {
      "script-src": ["'self'"],
      "connect-src": ["'self'"],
      "upgrade-insecure-requests": env.NODE_ENV === "production" ? [] : null,
    },
  }),
);
docsRoutes.get("/openapi.json", (_req, res) => {
  res.json({ ...specification, servers: [{ url: "/api/v1" }] });
});
docsRoutes.get("/swagger-initializer.js", (_req, res) => {
  res.type("application/javascript").send(`
window.onload = function () {
  window.ui = SwaggerUIBundle({
    url: "/docs/openapi.json",
    dom_id: "#swagger-ui",
    deepLinking: true,
    persistAuthorization: false,
    validatorUrl: null,
    presets: [SwaggerUIBundle.presets.apis],
    layout: "BaseLayout"
  });
};
`);
});
for (const asset of ["swagger-ui.css", "swagger-ui-bundle.js"]) {
  docsRoutes.get(`/${asset}`, (_req, res) => res.sendFile(join(assets, asset)));
}
docsRoutes.get("/", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hello Cliente API — Swagger</title>
  <link rel="stylesheet" href="/docs/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/docs/swagger-ui-bundle.js"></script>
  <script src="/docs/swagger-initializer.js"></script>
</body>
</html>`);
});
