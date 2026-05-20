import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("README documents the current public option rows", async () => {
  const readme = await readFile(join(packageRoot, "README.md"), "utf8");
  const optionsSection = readme.match(/## Options[\s\S]*?## Styling/)?.[0] ?? "";
  const documentedOptions = Array.from(
    optionsSection.matchAll(/^\| `([^`]+)` \|/gm),
    ([, option]) => option
  );

  assert.deepEqual(documentedOptions, [
    "content",
    "headings",
    "container",
    "title",
    "ariaLabel",
    "minWidth",
    "topOffset",
    "activeOffset",
    "edge.hideBefore",
    "edge.hideAfter",
    "edge.beforeOffset",
    "edge.afterFadeDistance",
    "classes",
    "getHeadingText",
    "idPrefix",
    "scrollingClassDuration",
    "environment.window"
  ]);
});

test("demo documents CSS customization tokens separately from runtime tokens", async () => {
  const [styleCss, demoHtml] = await Promise.all([
    readFile(join(packageRoot, "style.css"), "utf8"),
    readFile(join(packageRoot, "demo/index.html"), "utf8")
  ]);

  const declaredTokens = [
    ...new Set(
      Array.from(
        styleCss.matchAll(/^\s*(--toc-rail-[\w-]+)\s*:/gm),
        ([, token]) => token
      )
    )
  ];
  const publicCustomizationTokens = [
    "--toc-rail-accent",
    "--toc-rail-faint",
    "--toc-rail-font-family",
    "--toc-rail-left",
    "--toc-rail-line",
    "--toc-rail-link-indent",
    "--toc-rail-link-line-height",
    "--toc-rail-link-nested-indent",
    "--toc-rail-link-size",
    "--toc-rail-link-weight",
    "--toc-rail-list-bottom-gap",
    "--toc-rail-list-end-space",
    "--toc-rail-muted",
    "--toc-rail-nav-height",
    "--toc-rail-panel-bottom-gap",
    "--toc-rail-right",
    "--toc-rail-text",
    "--toc-rail-title",
    "--toc-rail-title-size",
    "--toc-rail-top",
    "--toc-rail-width",
    "--toc-rail-z-index"
  ].sort();
  const runtimeTokens = [
    "--toc-rail-edge-opacity",
    "--toc-rail-edge-offset",
    "--toc-rail-progress",
    "--toc-rail-visibility-delay"
  ].sort();
  const documentedTokenAllowlist = [...publicCustomizationTokens, ...runtimeTokens].sort();

  const customizationReference =
    demoHtml.match(/<ul data-token-reference="customization">[\s\S]*?<\/ul>/)?.[0] ?? "";
  const runtimeReference =
    demoHtml.match(/<ul data-token-reference="runtime">[\s\S]*?<\/ul>/)?.[0] ?? "";
  const customizationTokens = extractTokens(customizationReference).sort();
  const documentedRuntimeTokens = extractTokens(runtimeReference).sort();
  const documentedTokens = [...customizationTokens, ...documentedRuntimeTokens].sort();

  for (const token of publicCustomizationTokens) {
    assert.ok(declaredTokens.includes(token), `${token} is documented but not declared`);
  }
  assert.deepEqual(documentedRuntimeTokens, runtimeTokens);
  assert.deepEqual(customizationTokens, publicCustomizationTokens);
  assert.deepEqual(documentedTokens, documentedTokenAllowlist);
});

test("demo package version pins match package.json", async () => {
  const [packageJson, demoHtml] = await Promise.all([
    readFile(join(packageRoot, "package.json"), "utf8"),
    readFile(join(packageRoot, "demo/index.html"), "utf8")
  ]);

  const { version } = JSON.parse(packageJson);
  const cdnVersions = Array.from(
    demoHtml.matchAll(/toc-rail@([0-9]+\.[0-9]+\.[0-9]+)/g),
    ([, matchedVersion]) => matchedVersion
  );
  const demoCacheVersions = Array.from(
    demoHtml.matchAll(/demo-([0-9]+\.[0-9]+\.[0-9]+)/g),
    ([, matchedVersion]) => matchedVersion
  );

  assert.ok(cdnVersions.length > 0);
  assert.ok(demoCacheVersions.length > 0);
  assert.deepEqual([...new Set([...cdnVersions, ...demoCacheVersions])], [version]);
});

function extractTokens(html) {
  return Array.from(html.matchAll(/--toc-rail-[\w-]+/g), ([token]) => token);
}
