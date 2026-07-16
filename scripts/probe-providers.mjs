import { chromium } from "playwright";

async function probe(name, url, match) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const hits = [];
  page.on("response", async (res) => {
    const u = res.url();
    if (!match(u)) return;
    let body = "";
    try {
      body = await res.text();
    } catch {
      body = "<unreadable>";
    }
    hits.push({
      url: u,
      status: res.status(),
      body: body.slice(0, 1500),
    });
  });
  console.log("\n====", name, url);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(4000);
    // try clicking a visible day/time if present
    const buttons = page.locator("button, [role=button], a");
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 40); i++) {
      const t = ((await buttons.nth(i).innerText().catch(() => "")) || "").trim();
      if (/^\d{1,2}:\d{2}/.test(t) || /select|book|continue|next/i.test(t)) {
        await buttons.nth(i).click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(1000);
      }
    }
  } catch (e) {
    console.log("nav error", e.message);
  }
  console.log("hits", hits.length);
  for (const h of hits.slice(0, 12)) {
    console.log("---", h.status, h.url);
    console.log(h.body.slice(0, 400));
  }
  await browser.close();
}

await probe(
  "cundall-woodland",
  "https://cundalldogpark.co.uk/make-a-booking/ola/services/1-hour-dog-walk-sole-use",
  (u) => /api|appoint|avail|ola|calendar|slot|schedule|book/i.test(u),
);

await probe(
  "dogzone",
  "https://dogzoneripon.co.uk/book-online/",
  (u) => /amelia|admin-ajax|slot|wp-json|book/i.test(u),
);

await probe(
  "brackenfarg",
  "https://www.brackenfargkennels.co.uk/booking-calendar/55-minute-private-hire-1-3-dogs-1",
  (u) => /book|avail|slot|wix|calendar|schedule|_api/i.test(u),
);
