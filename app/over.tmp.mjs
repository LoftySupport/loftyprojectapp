import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [w, h] of [[320, 568], [390, 844], [1024, 768]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  for (const route of ["/setup/processes", "/jobs", "/setup/properties"]) {
    await p.goto("http://127.0.0.1:8099" + route, { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    console.log(w, route, "overflow:", await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
  }
  await p.close();
}
await b.close();
