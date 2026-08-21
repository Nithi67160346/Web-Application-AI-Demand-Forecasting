import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Demandly dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Demandly · AI Demand Forecasting<\/title>/i);
  assert.match(html, /ภาพรวม Demand Forecast/);
  assert.match(html, /Forecast accuracy/);
  assert.match(html, /Test Kit A/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview|react-loading-skeleton/i);
});

test("renders the main journey routes", async () => {
  const routes = [
    "/dashboard",
    "/data/upload",
    "/forecast/new",
    "/products",
    "/products/test-kit-a",
    "/alerts",
    "/alerts/alert-test-kit-a",
    "/monitoring",
    "/settings",
    "/login",
  ];

  for (const route of routes) {
    const response = await render(route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i, route);
  }
});
