import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const packageRoot = normalize(join(dirname(fileURLToPath(import.meta.url)), ".."));
let server: Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname === "/" ? "/demo/index.html" : url.pathname;
    const filePath = normalize(join(packageRoot, pathname));

    if (!filePath.startsWith(packageRoot)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    try {
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": contentType(filePath) });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start smoke server.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("demo mounts, scrolls, navigates, and hides on narrow viewports", async ({ page }) => {
  await page.goto(`${baseUrl}/demo/index.html`);

  const rail = page.locator("[data-toc-rail='true']");
  await expect(rail).toBeVisible();
  await expect(rail).toHaveAttribute("data-toc-rail-state", /visible|fading-after/);
  await expect(page.locator(".toc-rail__link")).toHaveCount(15);

  await page.locator(".toc-rail__link[href='#style']").click();
  await expect(page).toHaveURL(/#style$/);
  await expect(page.locator("[data-toc-rail-active='true'] a")).toHaveAttribute(
    "href",
    "#style"
  );

  const progress = await rail.evaluate((element) => ({
    data: Number(element.getAttribute("data-toc-rail-progress")),
    root: Number(getComputedStyle(element).getPropertyValue("--toc-rail-progress")),
    fill: Number(
      getComputedStyle(element.querySelector(".toc-rail__progress-fill")!).getPropertyValue(
        "--toc-rail-progress"
      )
    )
  }));
  expect(progress.data).toBeGreaterThan(0);
  expect(progress.root).toBe(progress.data);
  expect(progress.fill).toBe(progress.data);

  await page.evaluate(() => {
    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    document.body.style.setProperty("scroll-behavior", "auto", "important");
  });
  for (const id of [
    "install",
    "install-css",
    "mount",
    "mount-headings",
    "reader-state",
    "reader-progress",
    "style",
    "style-color",
    "dynamic-pages",
    "dynamic-unmount",
    "progress-only",
    "final-check"
  ]) {
    const sync = await page.evaluate((sectionId) => {
      const heading = document.getElementById(sectionId);
      if (!heading) throw new Error(`Missing heading ${sectionId}`);
      window.scrollTo(0, Math.max(0, heading.getBoundingClientRect().top + window.scrollY - 68));

      return new Promise<{
        activeHref: string | null;
        delta: number;
        progress: number;
        state: string | null;
        activeBottomGap: number | null;
      }>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const active = document.querySelector<HTMLAnchorElement>(
              "[data-toc-rail-active='true'] a"
            );
            const list = document.querySelector<HTMLElement>(".toc-rail__list");
            const fill = document.querySelector<HTMLElement>(".toc-rail__progress-fill");
            const track = document.querySelector<HTMLElement>(".toc-rail__progress");
            const rail = document.querySelector<HTMLElement>("[data-toc-rail='true']");
            if (!active || !list || !fill || !track) {
              throw new Error("Rail sync elements are missing.");
            }

            const activeRect = active.getBoundingClientRect();
            const listRect = list.getBoundingClientRect();
            const trackRect = track.getBoundingClientRect();
            const progress = Number(
              getComputedStyle(fill).getPropertyValue("--toc-rail-progress")
            );
            const fillEnd = trackRect.top + trackRect.height * progress;
            const activeCenter = activeRect.top + activeRect.height / 2;
            resolve({
              activeHref: active.getAttribute("href"),
              delta: fillEnd - activeCenter,
              progress,
              state: rail?.getAttribute("data-toc-rail-state") ?? null,
              activeBottomGap: listRect.bottom - activeRect.bottom
            });
          });
        });
      });
    }, id);

    expect(sync.activeHref).toBe(`#${id}`);
    expect(Math.abs(sync.delta)).toBeLessThanOrEqual(8);
    expect(sync.progress).toBeGreaterThan(0);
    if (id === "final-check") {
      expect(sync.state).toBe("visible");
      expect(sync.activeBottomGap).toBeGreaterThan(24);
    }
  }

  await page.mouse.wheel(0, 240);
  await expect(rail).toHaveClass(/is-scrolling/);
  await expect(page.locator(".toc-rail__progress-fill")).toHaveCSS(
    "transition-duration",
    "0s"
  );
  await page.waitForTimeout(100);

  await page.setViewportSize({ width: 1280, height: 680 });
  const constrainedRailScroll = await page.evaluate(async () => {
    const samples: Array<{ id: string; listTop: number }> = [];

    for (const id of ["dynamic-pages", "dynamic-refresh", "dynamic-unmount"]) {
      const heading = document.getElementById(id);
      if (!heading) throw new Error(`Missing heading ${id}`);
      window.scrollTo(0, Math.max(0, heading.getBoundingClientRect().top + window.scrollY - 68));
      window.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const list = document.querySelector<HTMLElement>(".toc-rail__list");
      samples.push({ id, listTop: Math.round(list?.scrollTop ?? 0) });
    }

    return samples;
  });
  expect(
    Math.max(...constrainedRailScroll.map((sample) => sample.listTop)) -
      Math.min(...constrainedRailScroll.map((sample) => sample.listTop))
  ).toBeLessThanOrEqual(64);

  const railFitSamples: Array<{
    listOverWrap: number;
    rootBottomGap: number;
    scrollbarWidth: string;
  }> = [];
  for (const height of [600, 560]) {
    await page.setViewportSize({ width: 1280, height });
    railFitSamples.push(
      await page.evaluate(async (sampleHeight) => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const rail = document.querySelector<HTMLElement>("[data-toc-rail='true']");
        const wrap = document.querySelector<HTMLElement>(".toc-rail__wrap");
        const list = document.querySelector<HTMLElement>(".toc-rail__list");
        if (!rail || !wrap || !list) {
          throw new Error("Rail fit elements are missing.");
        }

        const railRect = rail.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        return {
          listOverWrap: Math.round(listRect.bottom - wrapRect.bottom),
          rootBottomGap: Math.round(window.innerHeight - railRect.bottom),
          scrollbarWidth: getComputedStyle(list).scrollbarWidth
        };
      }, height)
    );
  }
  for (const sample of railFitSamples) {
    expect(sample.rootBottomGap).toBeGreaterThanOrEqual(0);
    expect(sample.listOverWrap).toBeLessThanOrEqual(0);
    expect(sample.scrollbarWidth).toBe("none");
  }

  await page.setViewportSize({ width: 1280, height: 780 });

  const edgeStates = await page.evaluate(async () => {
    const article = document.querySelector("article");
    if (!article) throw new Error("Missing article.");
    const contentBottom = article.getBoundingClientRect().bottom + window.scrollY;
    const states: Array<{
      bottom: number;
      opacity: number;
      state: string | null;
    }> = [];

    for (const bottom of [60, 0, -120]) {
      window.scrollTo(0, contentBottom - bottom);
      window.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise((resolve) => setTimeout(resolve, 50));
      const rail = document.querySelector<HTMLElement>("[data-toc-rail='true']");
      states.push({
        bottom,
        opacity: Number(rail?.style.getPropertyValue("--toc-rail-edge-opacity")),
        state: rail?.getAttribute("data-toc-rail-state") ?? null
      });
    }

    return states;
  });

  expect(edgeStates[0]).toEqual({ bottom: 60, opacity: 1, state: "visible" });
  expect(edgeStates[1]?.bottom).toBe(0);
  expect(edgeStates[1]?.state).toBe("fading-after");
  expect(edgeStates[1]?.opacity).toBeGreaterThan(0.64);
  expect(edgeStates[1]?.opacity).toBeLessThan(0.66);
  expect(edgeStates[2]).toEqual({ bottom: -120, opacity: 0, state: "hidden-after" });

  const afterContent = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);

    return new Promise<{ progress: number; state: string | null; ariaHidden: string | null }>(
      (resolve) => {
        setTimeout(() => {
          const rail = document.querySelector<HTMLElement>("[data-toc-rail='true']");
          const fill = document.querySelector<HTMLElement>(".toc-rail__progress-fill");
          resolve({
            progress: Number(getComputedStyle(fill!).getPropertyValue("--toc-rail-progress")),
            state: rail?.getAttribute("data-toc-rail-state") ?? null,
            ariaHidden: rail?.getAttribute("aria-hidden") ?? null
          });
        }, 550);
      }
    );
  });

  expect(afterContent.progress).toBe(1);
  expect(afterContent.state).toBe("hidden-after");
  expect(afterContent.ariaHidden).toBe("true");

  await page.setViewportSize({ width: 1024, height: 780 });
  await expect(rail).toBeVisible();

  await page.setViewportSize({ width: 900, height: 780 });
  await expect(rail).toBeVisible();

  await page.setViewportSize({ width: 760, height: 780 });
  await expect(rail).toBeHidden();
  await expect(rail).toHaveAttribute("hidden", "");
});

test("browser fixture covers progress-only, encoded fragments, and hidden state a11y", async ({
  page
}) => {
  await page.goto(`${baseUrl}/demo/index.html`);

  await page.evaluate(() => {
    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    document.body.style.setProperty("scroll-behavior", "auto", "important");
  });

  await page.evaluate(async () => {
    const { mountTocRail } = (await window.eval('import("/dist/index.js")')) as typeof import("../dist/index.js");
    const fixtureStyles = document.createElement("style");
    fixtureStyles.textContent = `
      .progress-fixture-rail { --toc-rail-right: 560px; }
      .fragment-fixture-rail { --toc-rail-right: 340px; }
      .hidden-fixture-rail { --toc-rail-right: 120px; }
    `;
    document.head.append(fixtureStyles);

    const progressArticle = document.createElement("article");
    progressArticle.id = "progress-fixture";
    progressArticle.style.minHeight = "1200px";
    progressArticle.innerHTML = "<h2 id='progress-start'>Progress fixture</h2><p>Body</p>";
    document.body.append(progressArticle);
    mountTocRail({
      content: progressArticle,
      headings: false,
      classes: { root: "progress-fixture-rail" },
      edge: { hideBefore: false }
    });

    const fragmentArticle = document.createElement("article");
    fragmentArticle.id = "fragment-fixture";
    fragmentArticle.style.minHeight = "1200px";
    fragmentArticle.innerHTML = "<h2 id='encoded section'>Encoded section</h2><p>Body</p>";
    document.body.append(fragmentArticle);
    mountTocRail({
      content: fragmentArticle,
      headings: "#fragment-fixture h2[id]",
      classes: { root: "fragment-fixture-rail" },
      edge: { hideBefore: false }
    });

    const hiddenArticle = document.createElement("article");
    hiddenArticle.id = "hidden-fixture";
    hiddenArticle.style.marginTop = "600px";
    hiddenArticle.style.minHeight = "1200px";
    hiddenArticle.innerHTML = "<h2 id='hidden-start'>Hidden fixture</h2><p>Body</p>";
    document.body.append(hiddenArticle);
    mountTocRail({
      content: hiddenArticle,
      headings: "#hidden-fixture h2[id]",
      classes: { root: "hidden-fixture-rail" }
    });
  });

  const progressRail = page.locator(".progress-fixture-rail");
  await expect(progressRail).toHaveAttribute("data-toc-rail-mode", "progress");
  await expect(progressRail).toHaveAttribute("aria-hidden", "true");
  await expect(progressRail.locator("nav")).toHaveCount(0);
  await expect(progressRail.locator(".toc-rail__link")).toHaveCount(0);
  const progressOnlyBox = await progressRail.locator(".toc-rail__progress").boundingBox();
  expect(progressOnlyBox?.height ?? 0).toBeGreaterThan(80);

  const progressOnlyState = await page.evaluate(async () => {
    const article = document.querySelector<HTMLElement>("#progress-fixture");
    if (!article) throw new Error("Missing progress fixture.");
    window.scrollTo(0, article.getBoundingClientRect().top + window.scrollY + 520);
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const rail = document.querySelector<HTMLElement>(".progress-fixture-rail");
    const fill = rail?.querySelector<HTMLElement>(".toc-rail__progress-fill");
    const track = rail?.querySelector<HTMLElement>(".toc-rail__progress");
    if (!rail || !fill || !track) throw new Error("Missing progress-only rail elements.");

    return {
      data: Number(rail.getAttribute("data-toc-rail-progress")),
      root: Number(getComputedStyle(rail).getPropertyValue("--toc-rail-progress")),
      fill: Number(getComputedStyle(fill).getPropertyValue("--toc-rail-progress")),
      trackHeight: track.getBoundingClientRect().height
    };
  });
  expect(progressOnlyState.trackHeight).toBeGreaterThan(80);
  expect(progressOnlyState.data).toBeGreaterThan(0);
  expect(progressOnlyState.root).toBe(progressOnlyState.data);
  expect(progressOnlyState.fill).toBe(progressOnlyState.data);

  const fragmentRail = page.locator(".fragment-fixture-rail");
  await fragmentRail.locator(".toc-rail__link").click();
  await expect(page).toHaveURL(/#encoded%20section$/);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.dispatchEvent(new Event("scroll"));
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
  await expect(fragmentRail.locator("[data-toc-rail-active='true'] a")).toHaveAttribute(
    "href",
    "#encoded%20section"
  );

  const hiddenRail = page.locator(".hidden-fixture-rail");
  await expect(hiddenRail).toHaveAttribute("data-toc-rail-state", "hidden-before");
  await expect(hiddenRail).toHaveAttribute("aria-hidden", "true");
  await expect(hiddenRail.locator(".toc-rail__link")).toHaveAttribute("tabindex", "-1");
});

test("viewport-end content progress stays synced in a real browser layout", async ({ page }) => {
  await page.goto(`${baseUrl}/demo/index.html`);

  await page.evaluate(async () => {
    document.body.innerHTML =
      '<main style="width:min(100%,1120px);margin:0 auto;padding:64px 24px 120vh"><article id="viewport-content" style="width:min(100%,680px)"><h1>Viewport content</h1></article></main>';
    const article = document.querySelector("#viewport-content");
    if (!article) throw new Error("Missing viewport content article.");

    for (let index = 1; index <= 8; index += 1) {
      const heading = document.createElement("h2");
      heading.id = `viewport-section-${index}`;
      heading.textContent = `Viewport section ${index}`;
      heading.style.marginTop = index === 1 ? "96px" : "420px";
      heading.style.scrollMarginTop = "84px";

      const paragraph = document.createElement("p");
      paragraph.textContent = "Body ".repeat(140);
      article.append(heading, paragraph);
    }

    const { mountTocRail } = (await window.eval('import("/dist/index.js")')) as typeof import("../dist/index.js");
    mountTocRail({
      content: "#viewport-content",
      headings: "#viewport-content h2[id]",
      title: false,
      minWidth: 800,
      topOffset: 56,
      activeBoundary: "viewport-end",
      activeOffset: 120,
      progressMode: "content",
      edge: {
        hideBefore: false,
        afterBoundary: "viewport-end",
        afterOffset: 120,
        afterFadeDistance: 160
      }
    });

    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    document.body.style.setProperty("scroll-behavior", "auto", "important");
  });

  const rail = page.locator("[data-toc-rail='true']");
  await expect(rail).toBeVisible();

  const samples = await page.evaluate(async () => {
    const article = document.querySelector<HTMLElement>("#viewport-content");
    if (!article) throw new Error("Missing viewport content article.");
    const articleTop = article.getBoundingClientRect().top + window.scrollY;
    const articleEnd = articleTop + Math.max(article.scrollHeight, article.getBoundingClientRect().height);
    const results: Array<{
      expected: number;
      progress: number;
      activeHref: string | null;
      state: string | null;
    }> = [];

    for (const sectionId of ["viewport-section-1", "viewport-section-4", "viewport-section-8"]) {
      const heading = document.getElementById(sectionId);
      if (!heading) throw new Error(`Missing heading ${sectionId}`);
      window.scrollTo(0, Math.max(0, heading.getBoundingClientRect().top + window.scrollY - window.innerHeight + 120));
      window.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const rail = document.querySelector<HTMLElement>("[data-toc-rail='true']");
      const active = document.querySelector<HTMLAnchorElement>("[data-toc-rail-active='true'] a");
      const progress = Number(rail?.getAttribute("data-toc-rail-progress"));
      const progressPoint = window.scrollY + window.innerHeight - 120;
      const expected = Math.min(1, Math.max(0, Number(((progressPoint - articleTop) / (articleEnd - articleTop)).toFixed(4))));
      results.push({
        expected,
        progress,
        activeHref: active?.getAttribute("href") ?? null,
        state: rail?.getAttribute("data-toc-rail-state") ?? null
      });
    }

    return results;
  });

  for (const sample of samples) {
    expect(sample.state).toBe("visible");
    expect(sample.progress).toBeCloseTo(sample.expected, 3);
  }
  expect(samples.map((sample) => sample.activeHref)).toEqual([
    "#viewport-section-1",
    "#viewport-section-4",
    "#viewport-section-8"
  ]);

  const afterContent = await page.evaluate(async () => {
    const article = document.querySelector<HTMLElement>("#viewport-content");
    if (!article) throw new Error("Missing viewport content article.");
    const articleBottom = article.getBoundingClientRect().bottom + window.scrollY;
    window.scrollTo(0, articleBottom - window.innerHeight + 240);
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const rail = document.querySelector<HTMLElement>("[data-toc-rail='true']");
    return {
      progress: Number(rail?.getAttribute("data-toc-rail-progress")),
      state: rail?.getAttribute("data-toc-rail-state") ?? null,
      opacity: Number(rail?.style.getPropertyValue("--toc-rail-edge-opacity"))
    };
  });

  expect(afterContent.progress).toBe(1);
  expect(afterContent.state).toBe("fading-after");
  expect(afterContent.opacity).toBeGreaterThan(0);
  expect(afterContent.opacity).toBeLessThan(1);
});

test("long outlines keep the active item visible and synced", async ({ page }) => {
  await page.goto(`${baseUrl}/demo/index.html`);

  await page.evaluate(async () => {
    document.body.innerHTML =
      '<main style="width:min(100%,1120px);margin:0 auto;padding:64px 24px 120vh"><article id="stress" style="width:min(100%,680px)"><h1>Stress article</h1></article></main>';
    const article = document.querySelector("#stress");
    if (!article) throw new Error("Missing stress article.");

    for (let index = 1; index <= 42; index += 1) {
      const heading = document.createElement(index % 3 === 0 ? "h3" : "h2");
      heading.id = `section-${index}`;
      heading.textContent = `Section ${index}`;
      heading.style.marginTop = index === 1 ? "80px" : "180px";
      heading.style.scrollMarginTop = "84px";

      const paragraph = document.createElement("p");
      paragraph.textContent = "Body ".repeat(80);
      article.append(heading, paragraph);
    }

    const { mountReadingRail } = (await window.eval('import("/dist/index.js")')) as typeof import("../dist/index.js");
    mountReadingRail({
      content: "#stress",
      headings: "#stress h2[id], #stress h3[id]",
      title: "Contents",
      minWidth: 1140,
      topOffset: 56,
      activeOffset: 40,
      edge: { hideBefore: false }
    });

    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    document.body.style.setProperty("scroll-behavior", "auto", "important");
  });

  for (const index of [1, 10, 20, 30, 40, 42]) {
    const sync = await page.evaluate((sectionIndex) => {
      const heading = document.getElementById(`section-${sectionIndex}`);
      if (!heading) throw new Error(`Missing section ${sectionIndex}`);
      window.scrollTo(0, heading.getBoundingClientRect().top + window.scrollY - 68);

      return new Promise<{
        activeHref: string | null;
        activeVisible: boolean;
        delta: number;
      }>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const active = document.querySelector<HTMLAnchorElement>(
              "[data-toc-rail-active='true'] a"
            );
            const list = document.querySelector<HTMLElement>(".toc-rail__list");
            const fill = document.querySelector<HTMLElement>(".toc-rail__progress-fill");
            const track = document.querySelector<HTMLElement>(".toc-rail__progress");
            if (!active || !list || !fill || !track) {
              throw new Error("Rail sync elements are missing.");
            }

            const activeRect = active.getBoundingClientRect();
            const listRect = list.getBoundingClientRect();
            const trackRect = track.getBoundingClientRect();
            const progress = Number(
              getComputedStyle(fill).getPropertyValue("--toc-rail-progress")
            );
            const fillEnd = trackRect.top + trackRect.height * progress;
            const activeCenter = activeRect.top + activeRect.height / 2;
            resolve({
              activeHref: active.getAttribute("href"),
              activeVisible:
                activeRect.top >= listRect.top && activeRect.bottom <= listRect.bottom,
              delta: fillEnd - activeCenter
            });
          });
        });
      });
    }, index);

    expect(sync.activeHref).toBe(`#section-${index}`);
    expect(sync.activeVisible).toBe(true);
    expect(Math.abs(sync.delta)).toBeLessThanOrEqual(8);
  }
});

function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css";
    case ".html":
      return "text/html";
    case ".js":
      return "text/javascript";
    default:
      return "text/plain";
  }
}
