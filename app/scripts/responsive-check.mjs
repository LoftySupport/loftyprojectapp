/**
 * Does the app fit on a phone and a tablet?
 *
 * Two things are asserted on every page at every size, because both are objective and
 * both were failing:
 *
 *   1. THE PAGE DOES NOT SCROLL SIDEWAYS. `scrollWidth > clientWidth` means something
 *      is wider than the screen and the whole layout slides under your thumb. It was
 *      11px on an iPhone and 81px on a 320px phone — enough to clip the avatar off the
 *      header, turn "Automations" into "Automa" and cut the last word off the banner,
 *      on every screen in the app. One flex item that would not shrink did all of it.
 *
 *   2. NOTHING TAPPABLE IS UNDER 24x24. That is the WCAG 2.2 AA floor (2.5.8). The
 *      footer's three links were 16px tall.
 *
 * Deliberately not asserted: an element wider than the viewport *inside something that
 * scrolls*. A data table and a kanban board are supposed to be wider than the screen —
 * that is what the scroll container is for. Only the page itself must not move.
 *
 * Run it with `npm run responsive`, which starts the server this needs and stops it
 * again. See scripts/README.md for why that server is not the ordinary dev server.
 */
const BASE = process.env.RESPONSIVE_BASE ?? "http://127.0.0.1:5200";

// "/dashboard" as well as "/": "/" is the front door and forwards to whatever the landing
// preference names, so on its own it never measures the dashboard for anybody who has
// chosen a different landing page — which is how the dashboard became unreachable
// entirely without a single check noticing.
const ROUTES = ["/", "/dashboard", "/projects", "/jobs", "/reports", "/processes", "/setup/properties", "/setup/processes",
                "/admin", "/settings", "/setup", "/setup/dictionary", "/setup/wiring",
                // The tracker. All three tabs, because they are three different layouts
                // sharing one route — a five-column board, a list of dated phases, and a
                // changelog — and only the board has ever been measured by proxy.
                "/updates/requests", "/updates/roadmap", "/updates/changelog",
                // …and the table view of the two tabs that have one, because a wide
                // table is the thing most likely to push the page sideways.
                //
                // This is why the view lives in the query string rather than in component
                // state: with it in state these URLs would all render the board, and the
                // sweep would report green on a layout it had never drawn. A check that
                // passes by not testing is the kind this repo trusts least. (A gantt and
                // a calendar were here on 31 Aug and removed on 1 Sep — see
                // UpdatesViews.tsx for why they are not coming back in that shape.)
                "/updates/requests?view=table", "/updates/roadmap?view=table",
                // The standalone report form, which is a page somebody is SENT — so it
                // is the one most likely to be opened on a phone.
                "/report"];

// Real devices, not round numbers. 320 is the narrowest still in use; 390 is the
// iPhone most people have; the landscape row is the same phone turned sideways, which
// is where the dialogs failed and no portrait size caught it.
const SIZES = [
  ["phone",      390,  844],
  ["phone-s",    320,  568],
  ["phone-land", 844,  390],
  ["tablet",     768, 1024],
  ["tablet-l",  1024,  768],
];

const { chromium } = await import("playwright");

// LOFTY_CHROMIUM lets a container point at a browser build the pinned Playwright does not
// know about. Without it this fails with "Executable doesn't exist" and the instruction to
// run `npx playwright install`, which in a sandbox with no network is a dead end — the
// browser is already on disk under a different version number.
const browser = await chromium.launch(
  process.env.LOFTY_CHROMIUM ? { executablePath: process.env.LOFTY_CHROMIUM } : {}
);
let failed = 0, checks = 0;

for (const [name, width, height] of SIZES) {
  // Printed as it goes. A silent run looks exactly like a hung one, and this takes a
  // couple of minutes against a cold dev server.
  process.stdout.write(`${name} (${width}x${height}) `);
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true });

  // Nothing off this machine. index.html pulls Figtree and Poppins from Google Fonts, and
  // waiting on them cost 12 seconds per page here — fifty pages is ten minutes of network
  // for a check that measures geometry. A check that needs the internet is a check that
  // fails in CI for reasons that have nothing to do with the code.
  //
  // The trade-off, stated because it is real: without the webfonts the text is measured in
  // the fallback stack, which is not exactly what a user sees. It errs the safe way — the
  // fallbacks here are wider than Figtree at the same size, so a layout that does not
  // overflow with them will not overflow with the real thing.
  await ctx.route(url => url.hostname !== "127.0.0.1" && url.hostname !== "localhost",
                  route => route.abort());

  const page = await ctx.newPage();
  for (const route of ROUTES) {
    process.stdout.write(".");
    await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-main", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const de = document.documentElement;
      const small = [];
      for (const el of document.querySelectorAll("a[href], button, [role=button], [role=tab], summary")) {
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        if (b.width < 24 || b.height < 24) {
          const label = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 22);
          small.push(`${label} ${Math.round(b.width)}x${Math.round(b.height)}`);
        }
      }
      return { overflow: de.scrollWidth - de.clientWidth, small };
    });
    checks++;
    if (r.overflow > 1 || r.small.length) {
      failed++;
      console.log(`\nFAIL: ${name.padEnd(11)} ${route.padEnd(20)} ` +
        (r.overflow > 1 ? `page scrolls sideways by ${r.overflow}px  ` : "") +
        (r.small.length ? `targets under 24px: ${r.small.join(", ")}` : ""));
    }
  }
  await ctx.close();
  process.stdout.write("\n");
}
await browser.close();

if (failed) {
  console.log(`\n${failed} of ${checks} page/size combinations FAILED — see above.`);
  process.exit(1);
}
console.log(`ok  ${checks} page/size combinations across ${SIZES.length} devices: ` +
            `no page scrolls sideways, no tap target under 24px`);
