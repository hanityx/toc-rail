import assert from "node:assert/strict";
import test from "node:test";

test("package exports resolve the public JavaScript and CSS surface", async () => {
  const pkg = await import("toc-rail");
  assert.equal(typeof pkg.mountTocRail, "function");
  assert.equal(typeof pkg.mountReadingRail, "function");
  assert.equal(pkg.mountReadingRail, pkg.mountTocRail);

  const cssUrl = import.meta.resolve("toc-rail/style.css");
  assert.match(cssUrl, /toc-rail\/style\.css$/);
});
