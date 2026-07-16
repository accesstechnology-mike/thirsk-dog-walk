import { chromium } from "playwright";

async function capture(name, url, interact) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const apiHits = [];
  page.on("response", async (res) => {
    const u = res.url();
    if (!/admin-ajax|wpamelia|_api|bookings|availability|slots|schedule|calendar/i.test(u))
      return;
    if (/\.(js|css|png|jpg|svg|woff)/i.test(u)) return;
    let body = "";
    try {
      body = await res.text();
    } catch {
      body = "";
    }
    if (body.length < 20) return;
    apiHits.push({ url: u, status: res.status(), body: body.slice(0, 2500) });
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(5000);
  if (interact) await interact(page);
  await page.waitForTimeout(5000);

  console.log("\n====", name, "hits", apiHits.length);
  for (const h of apiHits.slice(0, 15)) {
    console.log("---", h.status, h.url.slice(0, 180));
    console.log(h.body.slice(0, 500));
  }
  await browser.close();
  return apiHits;
}

await capture("dogzone", "https://dogzoneripon.co.uk/book-online/", async (page) => {
  // Click through Amelia step form if present
  const texts = [
    "Continue",
    "Next",
    "Select",
    "Private",
    "Field",
    "1 Hour",
    "60",
    "Hour",
  ];
  for (const t of texts) {
    const loc = page.getByText(t, { exact: false }).first();
    if (await loc.count()) {
      await loc.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }
  }
  // click any service card
  const cards = page.locator(".amelia-v2-booking, .am-service, [class*=service], button");
  const n = await cards.count();
  for (let i = 0; i < Math.min(n, 25); i++) {
    const txt = (await cards.nth(i).innerText().catch(() => "")) || "";
    if (/hour|60|private|field|paddock/i.test(txt)) {
      await cards.nth(i).click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  }
});

await capture(
  "brackenfarg",
  "https://www.brackenfargkennels.co.uk/booking-calendar/55-minute-private-hire-1-3-dogs-1",
  async (page) => {
    await page.waitForTimeout(8000);
    // click a day cell
    const days = page.locator('[data-testid*=day], [class*=day], button, [role=gridcell]');
    const n = await days.count();
    for (let i = 0; i < Math.min(n, 40); i++) {
      const txt = ((await days.nth(i).innerText().catch(() => "")) || "").trim();
      if (/^\d{1,2}$/.test(txt)) {
        await days.nth(i).click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(1000);
      }
    }
  },
);
