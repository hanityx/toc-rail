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
  await expect(page.locator(".toc-rail__link")).toHaveCount(17);

  await page.locator(".toc-rail__link[href='#visual-states']").click();
  await expect(page).toHaveURL(/#visual-states$/);
  await expect(page.locator("[data-toc-rail-active='true'] a")).toHaveAttribute(
    "href",
    "#visual-states"
  );

  const progress = await page
    .locator(".toc-rail__progress-fill")
    .evaluate((element) =>
      Number(getComputedStyle(element).getPropertyValue("--toc-rail-progress"))
    );
  expect(progress).toBeGreaterThan(0);

  await page.setViewportSize({ width: 900, height: 780 });
  await expect(rail).toBeHidden();
  await expect(rail).toHaveAttribute("hidden", "");
});

test("browser fixture covers progress-only, encoded fragments, and hidden state a11y", async ({
  page
}) => {
  await page.goto(`${baseUrl}/demo/index.html`);

  await page.evaluate(async () => {
    const { mountTocRail } = await import("/dist/index.js");

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

  const fragmentRail = page.locator(".fragment-fixture-rail");
  await fragmentRail.locator(".toc-rail__link").click();
  await expect(page).toHaveURL(/#encoded%20section$/);
  await expect(fragmentRail.locator("[data-toc-rail-active='true'] a")).toHaveAttribute(
    "href",
    "#encoded%20section"
  );

  const hiddenRail = page.locator(".hidden-fixture-rail");
  await expect(hiddenRail).toHaveAttribute("data-toc-rail-state", "hidden-before");
  await expect(hiddenRail).toHaveAttribute("aria-hidden", "true");
  await expect(hiddenRail.locator(".toc-rail__link")).toHaveAttribute("tabindex", "-1");
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
