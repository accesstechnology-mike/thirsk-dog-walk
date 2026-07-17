/**
 * Visual UI check — screenshots + assertions on rendered options.
 * Usage: node scripts/check-ui.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const OUT = "/opt/cursor/artifacts/ui-check";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForSelector(".slot-row", { timeout: 60_000 });

await page.screenshot({ path: join(OUT, "desktop.png"), fullPage: false });
await page.screenshot({ path: join(OUT, "desktop-full.png"), fullPage: true });

const multi = page.locator(".slot-row").filter({ has: page.locator(".time-select") }).first();
await multi.waitFor({ timeout: 15_000 });
const options = await multi.locator(".time-select option").allTextContents();
const day = await multi.locator(".day").textContent();
const venue = await multi.locator(".venue").textContent();
const facility = await multi.locator(".facility").textContent();

console.log(
  JSON.stringify(
    {
      day: day?.trim(),
      venue: venue?.trim(),
      facility: facility?.trim(),
      options: options.map((o) => o.trim()),
      optionsAreTimeOnly: options.every((o) => /^\d{2}:\d{2}$/.test(o.trim())),
    },
    null,
    2,
  ),
);

await multi.screenshot({ path: join(OUT, "time-dropdown-row.png") });

await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: join(OUT, "mobile.png"), fullPage: false });

const failures = [];
if (!options.length) failures.push("no dropdown options");
if (!options.every((o) => /^\d{2}:\d{2}$/.test(o.trim()))) {
  // Allow weekday prefix only when spanning days
  const bad = options.filter(
    (o) => !/^\d{2}:\d{2}$/.test(o.trim()) && !/^\w{3} \d{1,2} \w{3} \d{2}:\d{2}$/.test(o.trim()),
  );
  if (bad.length) failures.push(`unexpected option labels: ${bad.join(", ")}`);
}

await browser.close();

if (failures.length) {
  console.error("UI CHECK FAILED", failures);
  process.exit(1);
}
console.log("UI CHECK PASSED — screenshots in", OUT);
