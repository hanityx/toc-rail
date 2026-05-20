import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = await mkdtemp(join(tmpdir(), "toc-rail-consumer-"));
const packDir = join(workspace, "pack");
const consumerDir = join(workspace, "consumer");
const childEnv = { ...process.env };
delete childEnv.npm_config_dry_run;

try {
  await mkdir(packDir, { recursive: true });
  await mkdir(consumerDir, { recursive: true });
  const sourcePackage = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));

  const { stdout: packStdout } = await execFile(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", packDir],
    { cwd: packageRoot, env: childEnv }
  );
  const [packResult] = JSON.parse(packStdout);
  assert.equal(packResult.name, "toc-rail");
  assert.equal(packResult.version, sourcePackage.version);
  assert.equal(packResult.files.some((file) => file.path.startsWith("demo/")), false);
  assert.equal(packResult.files.some((file) => file.path.startsWith("src/")), false);
  assert.equal(packResult.files.some((file) => file.path.startsWith("test/")), false);
  assert.equal(packResult.files.some((file) => file.path === "index.html"), false);

  const tarballPath = join(packDir, packResult.filename);
  await writeFile(join(consumerDir, "package.json"), '{"private":true,"type":"module"}\n');
  await execFile(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballPath],
    { cwd: consumerDir, env: childEnv }
  );

  const smokeScript = `
    import { mountTocRail, mountReadingRail } from "toc-rail";
    const cssUrl = import.meta.resolve("toc-rail/style.css");
    if (typeof mountTocRail !== "function") throw new Error("mountTocRail missing");
    if (mountReadingRail !== mountTocRail) throw new Error("mountReadingRail alias mismatch");
    if (!cssUrl.endsWith("/node_modules/toc-rail/style.css")) throw new Error(cssUrl);
    console.log(JSON.stringify({ ok: true, cssUrl }));
  `;
  const { stdout: smokeStdout } = await execFile("node", ["--input-type=module", "-e", smokeScript], {
    cwd: consumerDir
  });
  const smoke = JSON.parse(smokeStdout);
  assert.equal(smoke.ok, true);

  const installedPackage = JSON.parse(
    await readFile(join(consumerDir, "node_modules/toc-rail/package.json"), "utf8")
  );
  assert.equal(installedPackage.files.includes("dist"), true);
  assert.equal(installedPackage.files.includes("style.css"), true);
  assert.match(await readFile(join(consumerDir, "node_modules/toc-rail/style.css"), "utf8"), /\.toc-rail/);
  assert.match(
    await readFile(join(consumerDir, "node_modules/toc-rail/dist/index.d.ts"), "utf8"),
    /TocRailOptions/
  );

  await writeFile(
    join(consumerDir, "index.ts"),
    `
      import { mountReadingRail, mountTocRail, type TocRailHeading, type TocRailInstance, type TocRailOptions } from "toc-rail";
      import "toc-rail/style.css";

      const options: TocRailOptions = { content: document.body, headings: false };
      const rail: TocRailInstance = mountTocRail(options);
      const alias: typeof mountTocRail = mountReadingRail;
      const headings: readonly TocRailHeading[] = rail.headings;

      alias({ content: "article" });
      rail.unmount();
      headings[0]?.element.getBoundingClientRect();
    `
  );
  await writeFile(
    join(consumerDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          lib: ["DOM", "ES2022"],
          module: "ES2022",
          moduleResolution: "Bundler",
          noEmit: true,
          strict: true,
          target: "ES2022",
          types: []
        },
        include: ["index.ts"]
      },
      null,
      2
    )
  );
  await execFile(join(packageRoot, "node_modules/.bin/tsc"), ["-p", consumerDir, "--pretty", "false"], {
    cwd: consumerDir
  });
} finally {
  await rm(workspace, { recursive: true, force: true });
}
