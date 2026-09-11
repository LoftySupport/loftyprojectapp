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
 * AND IT TAKES PICTURES NOW. `RESPONSIVE_SHOTS=<dir>` saves one PNG per route per size
 * and the run is otherwise unchanged. Every defect this project has shipped — full-width
 * filter rows, a raw `{{token}}` on a card, unreadable text on a dark rail — was invisible
 * in a diff and obvious in a picture, and this harness was already driving a real browser
 * across every route and throwing the frame away. The two assertions measure geometry;
 * a picture is the only thing that measures whether the screen is right.
 *
 * Three environment variables, all optional, all off by default so CI runs exactly as
 * before:
 *
 *   RESPONSIVE_SHOTS=<dir>     write `<size>__<route>.png` for every page visited
 *   RESPONSIVE_ROUTES=a,b,c    sweep these routes instead of all of them
 *   RESPONSIVE_SIZES=phone,…   sweep these device names instead of all of them
 *
 * The last two exist because a picture run is for looking at one thing: shooting 35
 * routes at 6 widths to see the rail is 210 images nobody opens. Neither narrows what CI
 * checks — CI sets neither.
 *
 * Run it with `npm run responsive`, which starts the server this needs and stops it
 * again. See scripts/README.md for why that server is not the ordinary dev server.
 */
const BASE = process.env.RESPONSIVE_BASE ?? "http://127.0.0.1:5200";

// "/dashboard" as well as "/": "/" is the front door and forwards to whatever the landing
// preference names, so on its own it never measures the dashboard for anybody who has
// chosen a different landing page — which is how the dashboard became unreachable
// entirely without a single check noticing.
const ALL_ROUTES = ["/", "/dashboard",
                // With a query, because that is the only state it has: `/search` on its
                // own is a one-line "type in the box above" and measures nothing. The
                // DROPDOWN is not here and cannot be — it opens on a keystroke and has no
                // URL — so a green line for this route does not mean the popup is
                // responsive; its width is capped against the viewport by hand.
                "/search?q=court",
                "/projects", "/jobs", "/tasks",
                // The tasks board's other three views, for the reason the tracker's
                // table view is here: they are three different layouts on one route —
                // a kanban, a timeline and a month grid — and sweeping only the table
                // measured the other three by assumption. `scope=all` because the
                // signed-in stub is assigned nothing, so "my tasks" is an empty page
                // and an empty page lays nothing out.
                "/tasks?scope=all&view=Board", "/tasks?scope=all&view=Gantt",
                "/tasks?scope=all&view=Calendar",
                // And the projects board's other two, for the same reason. Its calendar
                // is new (it had three views and `?view=Calendar` drew a blank page);
                // its gantt has existed since 26 August and had never been measured.
                "/projects?view=Gantt", "/projects?view=Calendar",
                "/reports", "/setup/properties", "/setup/processes", "/contacts", "/setup/contacts", "/setup/notifications", "/maintenance", "/setup/maintenance",
                "/admin", "/settings", "/setup", "/setup/dictionary", "/setup/wiring",
                // Tools. Three lanes, three layouts, and each is its own URL now — a
                // Get Started grid over a table, with different cards and a different
                // table in each. Sweeping only one of them measured the other two by
                // assumption.
                //
                // The BUILDER is not here and cannot be: it is a portal over the whole
                // viewport that opens on a click, so it has no URL for the sweep to
                // visit. Said rather than implied, because a green line on these three
                // would otherwise read as "the report builder is responsive", and it
                // does not mean that.
                //
                // The retired slug is swept too. It redirects, and a redirect that broke
                // would show up here as a route that measures nothing rather than as a
                // 404 somebody reports.
                "/tools/document-builder", "/tools/template-library", "/tools/section-library",
                "/tools/snippet-library",
                "/tools/template-builder",
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
//
// 1440x900 is the sixth, and it is the one the app is actually used at: Amber's MacBook
// Air, and every desk at Lofty. Its absence is why this sweep has never once caught a
// fault on the width people work at — a 1024 tablet is where things START to have room,
// not where they finally do, and the rail at 224px plus a 460px drawer plus a board
// between them only resolves above it. It is listed LAST so the narrow sizes, which are
// where the failures are, still print first.
const ALL_SIZES = [
  ["phone",      390,  844],
  ["phone-s",    320,  568],
  ["phone-land", 844,  390],
  ["tablet",     768, 1024],
  ["tablet-l",  1024,  768],
  ["desktop",   1440,  900],
];

/**
 * The narrowing knobs. Both take a comma-separated list; both default to everything, so
 * an unset environment is the full sweep CI has always run.
 *
 * An unknown size name is a hard stop rather than an empty run: `RESPONSIVE_SIZES=laptop`
 * silently measuring nothing and exiting 0 is the "passes by not testing" failure this
 * file's own comments warn about twice.
 */
const list = v => (v ?? "").split(",").map(s => s.trim()).filter(Boolean);

const wantRoutes = list(process.env.RESPONSIVE_ROUTES);
const ROUTES = wantRoutes.length ? wantRoutes : ALL_ROUTES;

const wantSizes = list(process.env.RESPONSIVE_SIZES);
const SIZES = wantSizes.length
  ? wantSizes.map(n => {
      const hit = ALL_SIZES.find(s => s[0] === n);
      if (!hit) {
        console.error(`unknown size "${n}" — have: ${ALL_SIZES.map(s => s[0]).join(", ")}`);
        process.exit(2);
      }
      return hit;
    })
  : ALL_SIZES;

/**
 * Where the pictures go, or nowhere.
 *
 * Deliberately a path you pass in rather than a directory in the repo: a screenshot is
 * evidence for one change, not an asset the project carries, and a default inside `app/`
 * would have somebody committing 210 PNGs the first time they ran it.
 */
const SHOTS = process.env.RESPONSIVE_SHOTS || null;
if (SHOTS) await (await import("node:fs/promises")).mkdir(SHOTS, { recursive: true });

/** `/tasks?scope=all&view=Board` → `tasks_scope-all_view-Board`. Stable, and a filename. */
const slug = route =>
  route.replace(/^\//, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "root";

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

  // Nothing off this machine. index.html pulls Figtree and Montserrat from Google Fonts, and
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
    // The picture, before the verdict: a FAILING page is the one most worth looking at,
    // so it is taken whatever the assertions say.
    //
    // Viewport, not `fullPage`. A full-page shot of a board stretches to the content and
    // the rail — which is `position: sticky` and 100dvh tall — draws once at the top and
    // leaves the rest of the image railless, which is the opposite of what these are for.
    if (SHOTS) {
      await page.screenshot({ path: `${SHOTS}/${name}__${slug(route)}.png` });
    }

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
