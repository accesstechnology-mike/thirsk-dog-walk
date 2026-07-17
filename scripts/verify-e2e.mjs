/**
 * End-to-end verification for Thirsk Dog Walk aggregator.
 * Run against a local server: node scripts/verify-e2e.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const ARTIFACTS = "/opt/cursor/artifacts/verify-e2e";
mkdirSync(ARTIFACTS, { recursive: true });

const failures = [];
const notes = [];

function assert(cond, msg) {
  if (!cond) failures.push(msg);
  else notes.push(`OK: ${msg}`);
}

function acuityDatetimeOk(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("acuityscheduling.com")) return false;
    // /schedule/{owner}/appointment/{type}/calendar/{cal}/datetime/{iso}
    const m = u.pathname.match(
      /\/schedule\/[^/]+\/appointment\/\d+\/calendar\/\d+\/datetime\/([^/]+)$/,
    );
    if (!m) return false;
    const decoded = decodeURIComponent(m[1]);
    // Must have colon in offset: +01:00 not +0100
    if (!/[+-]\d{2}:\d{2}$/.test(decoded) && !decoded.endsWith("Z")) return false;
    if (!u.searchParams.get("appointmentTypeIds[]") && !u.searchParams.getAll("appointmentTypeIds[]").length) {
      // URLSearchParams may decode [] differently
      if (!u.search.includes("appointmentTypeIds")) return false;
    }
    if (!u.searchParams.get("calendarIds") && !u.search.includes("calendarIds=")) return false;
    return true;
  } catch {
    return false;
  }
}

async function checkApi() {
  const leaveAt = new Date();
  leaveAt.setMinutes(leaveAt.getMinutes() + 30, 0, 0);
  const params = new URLSearchParams({
    leaveAt: leaveAt.toISOString(),
    includeTomorrow: "0",
  });
  const res = await fetch(`${BASE}/api/availability?${params}`, {
    cache: "no-store",
  });
  assert(res.ok, `API /availability returns ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.slots), "API slots is array");
  assert(data.slots.length > 0, `API returned slots (${data.slots.length})`);
  assert(
    typeof data.filterSummary === "string" && data.filterSummary.length > 0,
    "API has filterSummary",
  );
  assert(Array.isArray(data.errors), "API errors is array");

  const venues = new Set(data.slots.map((s) => s.venueId));
  assert(venues.size >= 4, `at least 4 venues in results (got ${venues.size})`);

  const acuity = data.slots.filter((s) => s.provider === "acuity");
  assert(acuity.length > 0, `Acuity slots present (${acuity.length})`);
  const badAcuity = acuity.filter((s) => !acuityDatetimeOk(s.bookingUrl));
  if (badAcuity.length) {
    failures.push(
      `Acuity deep links missing datetime/query (${badAcuity.length}/${acuity.length}). Sample: ${badAcuity[0]?.bookingUrl}`,
    );
  } else {
    notes.push(`OK: all ${acuity.length} Acuity deep links match working SPA form`);
  }
  const notPre = acuity.filter((s) => !s.timePreselected);
  assert(
    notPre.length === 0,
    `all Acuity slots timePreselected (bad=${notPre.length})`,
  );

  // leave later → fewer or equal slots
  const later = new Date(leaveAt);
  later.setHours(later.getHours() + 6);
  const params2 = new URLSearchParams({
    leaveAt: later.toISOString(),
    includeTomorrow: "0",
  });
  const res2 = await fetch(`${BASE}/api/availability?${params2}`, {
    cache: "no-store",
  });
  const data2 = await res2.json();
  assert(
    data2.slots.length <= data.slots.length,
    `later leave reduces/equal slots (${data.slots.length} -> ${data2.slots.length})`,
  );

  // include tomorrow → more or equal
  const params3 = new URLSearchParams({
    leaveAt: leaveAt.toISOString(),
    includeTomorrow: "1",
  });
  const res3 = await fetch(`${BASE}/api/availability?${params3}`, {
    cache: "no-store",
  });
  const data3 = await res3.json();
  assert(
    data3.slots.length >= data.slots.length,
    `includeTomorrow expands/equal slots (${data.slots.length} -> ${data3.slots.length})`,
  );

  // slot starts after leave+drive
  const leaveMs = leaveAt.getTime();
  const unreachable = data.slots.filter((s) => {
    const start = new Date(s.start).getTime();
    const earliest = leaveMs + s.driveMinutes * 60_000;
    return start < earliest - 60_000; // 1 min slack for rounding
  });
  assert(
    unreachable.length === 0,
    `no slots before leave+drive (bad=${unreachable.length})`,
  );

  writeFileSync(
    join(ARTIFACTS, "api-sample.json"),
    JSON.stringify(
      {
        slotCount: data.slots.length,
        venues: [...venues],
        acuitySample: acuity.slice(0, 3).map((s) => ({
          venue: s.venueName,
          url: s.bookingUrl,
          timePreselected: s.timePreselected,
        })),
        nonAcuitySample: data.slots
          .filter((s) => s.provider !== "acuity")
          .slice(0, 4)
          .map((s) => ({
            venue: s.venueName,
            provider: s.provider,
            url: s.bookingUrl,
          })),
        errors: data.errors,
      },
      null,
      2,
    ),
  );

  return data;
}

async function checkLiveAcuityDeepLink(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const res = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForTimeout(2000);
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const finalUrl = page.url();
    assert(res?.ok() || res?.status() === 200, `Acuity deep link HTTP ${res?.status()}`);
    assert(finalUrl.includes("/datetime/"), "Acuity kept /datetime/ in URL");
    assert(
      /your information|first name|email/i.test(body),
      "Acuity landed on info form (time locked)",
    );
    assert(
      !/select a time|choose a time|available times/i.test(body),
      "Acuity did not ask to pick a time again",
    );
  } finally {
    await browser.close();
  }
}

async function checkUi(apiData) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForSelector(".slot-row, .banner.error, h2", { timeout: 60_000 });

  const brand = await page.locator(".brand").textContent();
  assert(brand?.includes("Thirsk Dog Walk"), "brand visible");

  const ledeColor = await page.locator(".lede").evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.color, opacity: s.opacity };
  });
  // Expect light text on dark hero (rgb high values)
  const rgb = ledeColor.color.match(/\d+/g)?.map(Number) || [];
  assert(
    rgb[0] > 180 && rgb[1] > 180 && rgb[2] > 180,
    `lede is light-colored for dark hero (got ${ledeColor.color})`,
  );

  // Hero panel must wrap the form — compare bottoms
  const layout = await page.evaluate(() => {
    const hero = document.querySelector(".hero");
    const form = document.querySelector(".leave-form");
    const meta = document.querySelector(".meta");
    const tomorrow = document.querySelector(".tomorrow-field");
    if (!hero || !form) return null;
    const hb = hero.getBoundingClientRect();
    const fb = form.getBoundingClientRect();
    const mb = meta?.getBoundingClientRect();
    const tb = tomorrow?.getBoundingClientRect();
    const heroBg = getComputedStyle(hero).backgroundImage || getComputedStyle(hero).backgroundColor;
    const tomorrowColor = tomorrow ? getComputedStyle(tomorrow).color : null;
    return {
      heroBottom: hb.bottom,
      formBottom: fb.bottom,
      metaBottom: mb?.bottom ?? null,
      tomorrowBottom: tb?.bottom ?? null,
      formInsideHero: fb.bottom <= hb.bottom + 1,
      metaInsideHero: mb ? mb.bottom <= hb.bottom + 1 : true,
      heroBg: heroBg.slice(0, 80),
      tomorrowColor,
    };
  });
  assert(!!layout, "hero/form layout measurable");
  assert(layout.formInsideHero, `leave form inside dark hero panel (formBottom=${layout?.formBottom}, heroBottom=${layout?.heroBottom})`);
  assert(layout.metaInsideHero, `filter meta inside dark hero panel`);

  // Contrast: tomorrow label should be light on dark
  if (layout.tomorrowColor) {
    const trgb = layout.tomorrowColor.match(/\d+/g)?.map(Number) || [];
    assert(
      trgb[0] > 180 && trgb[1] > 180 && trgb[2] > 180,
      `Include tomorrow label is light (${layout.tomorrowColor})`,
    );
  }

  await page.screenshot({
    path: join(ARTIFACTS, "home-desktop.png"),
    fullPage: false,
  });
  await page.screenshot({
    path: join(ARTIFACTS, "home-full.png"),
    fullPage: true,
  });

  // Mobile viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(ARTIFACTS, "home-mobile.png"),
    fullPage: false,
  });
  await page.setViewportSize({ width: 1280, height: 900 });

  const heading = await page.locator(".slot-section h2").textContent();
  assert(/field/i.test(heading || ""), `UI heading lists fields (${heading})`);
  const fieldCount = Number(heading?.match(/(\d+)/)?.[1] || 0);
  assert(fieldCount > 0, `UI shows field count (${fieldCount})`);
  const rowCount = await page.locator(".slot-row").count();
  assert(
    rowCount === fieldCount,
    `one row per field (rows=${rowCount}, heading=${fieldCount})`,
  );
  const rowKeys = await page.evaluate(() =>
    [...document.querySelectorAll(".slot-row")].map(
      (r) =>
        `${r.querySelector(".venue")?.textContent?.trim()}|${r.querySelector(".facility")?.textContent?.trim()}`,
    ),
  );
  assert(
    new Set(rowKeys).size === rowKeys.length,
    `venue+facility rows unique (${rowKeys.length})`,
  );
  const hopewellAreas = rowKeys.filter((k) => k.includes("Hopewell"));
  if (hopewellAreas.length) {
    notes.push(`Hopewell areas: ${hopewellAreas.join(" ; ")}`);
  }
  notes.push(
    `UI fields=${fieldCount}; API slots=${apiData.slots.length}; unique areas in API=${new Set(apiData.slots.map((s) => `${s.venueId}|${s.facility}`)).size}`,
  );

  const bgFixed = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return {
      attachment: s.backgroundAttachment,
      repeat: s.backgroundRepeat,
    };
  });
  assert(
    bgFixed.attachment.includes("fixed"),
    `page background is fixed (got ${bgFixed.attachment})`,
  );
  assert(
    !bgFixed.repeat.split(",").some((p) => p.trim() === "repeat"),
    `page background does not tile (got ${bgFixed.repeat})`,
  );

  const multiRow = page.locator(".slot-row").filter({ has: page.locator(".time-select") }).first();
  if (await multiRow.count()) {
    const select = multiRow.locator(".time-select");
    const options = await select.locator("option").count();
    assert(options > 1, `time dropdown has multiple options (${options})`);
    const beforeHref = await multiRow.locator(".book").getAttribute("href");
    const values = await select.locator("option").evaluateAll((opts) =>
      opts.map((o) => o.value),
    );
    if (values[1]) {
      await select.selectOption(values[1]);
      const afterHref = await multiRow.locator(".book").getAttribute("href");
      assert(
        !!afterHref && afterHref !== beforeHref,
        `changing time updates Book URL`,
      );
      notes.push(`OK: time dropdown updates Book (${options} options)`);
    }
  } else {
    notes.push("no multi-time row to exercise dropdown (skipped)");
  }

  const firstBook = page.locator(".slot-row .book").first();
  const href = await firstBook.getAttribute("href");
  assert(!!href && href.startsWith("http"), `Book href is absolute URL (${href})`);
  if (href?.includes("acuityscheduling.com")) {
    assert(acuityDatetimeOk(href), `first Book Acuity URL has datetime (${href})`);
  }

  // Toggle include tomorrow — more fields or same
  const before = fieldCount;
  await page.locator(".tomorrow-field input").check();
  await page.locator("button.refresh").click();
  await page.waitForFunction(
    () => {
      const t = document.querySelector(".slot-section h2")?.textContent || "";
      return /field/i.test(t) || /No reachable/.test(t);
    },
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(500);
  const afterText = await page.locator(".slot-section h2").textContent();
  const after = Number(afterText?.match(/(\d+)/)?.[1] || 0);
  assert(after >= before, `include tomorrow fields >= before (${before} -> ${after})`);

  await page.screenshot({
    path: join(ARTIFACTS, "home-tomorrow.png"),
    fullPage: false,
  });

  assert(
    consoleErrors.length === 0,
    `no browser console errors (${consoleErrors.join(" | ") || "none"})`,
  );

  await browser.close();
}

const apiData = await checkApi();
const sampleAcuity = apiData.slots.find((s) => s.provider === "acuity")?.bookingUrl;
if (sampleAcuity) {
  await checkLiveAcuityDeepLink(sampleAcuity);
} else {
  failures.push("no Acuity sample URL for live deep-link check");
}
await checkUi(apiData);

const report = { failures, notes, artifacts: ARTIFACTS };
writeFileSync(join(ARTIFACTS, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(`\nFAILED: ${failures.length} issue(s)`);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
