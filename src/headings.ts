import { DEFAULT_HEADING_SELECTOR, DEFAULT_ID_PREFIX } from "./defaults.js";
import type { InternalTocRailHeading, TocRailOptions } from "./types.js";

export function collectHeadings(
  content: Element,
  options: TocRailOptions,
  win: Window
): InternalTocRailHeading[] {
  if (options.headings === false) return [];

  const headings =
    typeof options.headings === "string"
      ? Array.from(content.querySelectorAll(options.headings))
      : options.headings
        ? Array.from(options.headings)
        : Array.from(content.querySelectorAll(DEFAULT_HEADING_SELECTOR));

  return headings
    .map((heading, index) => toHeadingData(heading, index, options, win))
    .filter((heading): heading is InternalTocRailHeading => Boolean(heading));
}

export function refreshHeadingPositions(
  headings: InternalTocRailHeading[],
  win: Window
): InternalTocRailHeading[] {
  return headings.map((heading) => ({
    ...heading,
    top: heading.element.getBoundingClientRect().top + win.scrollY
  }));
}

function toHeadingData(
  heading: Element,
  index: number,
  options: TocRailOptions,
  win: Window
): InternalTocRailHeading | null {
  const text = (options.getHeadingText?.(heading) ?? getHeadingText(heading)).trim();
  if (!text) return null;

  const element = heading as HTMLElement;
  if (!element.id) {
    // Generated ids keep anchors working; stable author-provided ids are still safer for hydrated apps.
    element.id = createUniqueId(options.idPrefix ?? DEFAULT_ID_PREFIX, index, win.document);
  }

  return {
    id: element.id,
    text,
    depth: getHeadingDepth(heading),
    element,
    top: element.getBoundingClientRect().top + win.scrollY
  };
}

function createUniqueId(prefix: string, index: number, doc: Document): string {
  let candidate = `${prefix}-${index + 1}`;
  let suffix = 2;
  while (doc.getElementById?.(candidate)) {
    candidate = `${prefix}-${index + 1}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function getHeadingText(heading: Element): string {
  const clone = heading.cloneNode(true) as Element;
  clone
    .querySelectorAll(".heading-anchor, [aria-hidden='true'], [data-toc-ignore]")
    .forEach((node) => node.remove());
  return clone.textContent ?? "";
}

function getHeadingDepth(heading: Element): number {
  const match = heading.tagName.match(/^H([1-6])$/i);
  return match ? Number(match[1]) : 2;
}
