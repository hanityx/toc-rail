import { DEFAULT_ACTIVE_CLASS } from "./defaults.js";
import type {
  InternalTocRailHeading,
  TocRailItem,
  TocRailOptions,
  TocRailVisibilityState
} from "./types.js";

export interface TocRailView {
  root: HTMLElement;
  panel: HTMLElement;
  list: HTMLOListElement;
  progressFill: HTMLElement;
  progressOnly: boolean;
}

export function createTocRailView(doc: Document, options: TocRailOptions): TocRailView {
  const progressOnly = options.headings === false;
  const root = doc.createElement("aside");
  const panel = doc.createElement(progressOnly ? "div" : "nav");
  const wrap = doc.createElement("div");
  const progress = doc.createElement("span");
  const progressFill = doc.createElement("span");
  const list = doc.createElement("ol");

  root.className = "toc-rail is-initializing";
  addClassNames(root, options.classes?.root);
  root.dataset.tocRail = "true";
  root.dataset.tocRailState = "visible";
  if (progressOnly) {
    root.dataset.tocRailMode = "progress";
    root.setAttribute("aria-hidden", "true");
  }

  panel.className = "toc-rail__panel";
  if (!progressOnly) applyNavigationLabel(panel, doc, options);

  wrap.className = "toc-rail__wrap";
  progress.className = "toc-rail__progress";
  progress.setAttribute("aria-hidden", "true");
  progressFill.className = "toc-rail__progress-fill";
  list.className = "toc-rail__list";

  progress.append(progressFill);
  wrap.append(progress);
  if (!progressOnly) wrap.append(list);
  panel.append(wrap);
  root.append(panel);

  return { root, panel, list, progressFill, progressOnly };
}

export function renderHeadingItems(
  view: TocRailView,
  doc: Document,
  headings: readonly InternalTocRailHeading[],
  options: TocRailOptions
): TocRailItem[] {
  const items: TocRailItem[] = [];
  view.list.replaceChildren();
  view.root.classList.toggle("has-outline", headings.length > 0);

  for (const heading of headings) {
    const item = doc.createElement("li");
    const link = doc.createElement("a");

    item.className = `toc-rail__item toc-rail__item--h${heading.depth}`;
    item.dataset.tocRailDepth = String(heading.depth);
    link.className = "toc-rail__link";
    link.dataset.tocRailLink = "true";
    addClassNames(link, options.classes?.link);
    link.setAttribute("href", `#${encodeFragmentId(heading.id)}`);
    link.textContent = heading.text;

    item.append(link);
    view.list.append(item);
    items.push({ item, link, heading });
  }

  return items;
}

export function applyVisualState(
  view: TocRailView,
  items: readonly TocRailItem[],
  visibility: TocRailVisibilityState,
  edgeOpacity: number,
  edgeOffset: number
): void {
  const isHidden =
    visibility === "hidden-breakpoint" ||
    visibility === "hidden-before" ||
    visibility === "hidden-after";

  view.root.hidden = visibility === "hidden-breakpoint";
  view.root.dataset.tocRailState = visibility;
  view.root.style.setProperty("--toc-rail-edge-opacity", String(edgeOpacity));
  view.root.style.setProperty("--toc-rail-edge-offset", `${edgeOffset}px`);
  view.root.classList.toggle("is-before-content", visibility === "hidden-before");
  view.root.classList.toggle("is-after-content", visibility === "hidden-after");
  setRailInteractive(view.root, items, !isHidden && !view.progressOnly);

  if (isHidden || view.progressOnly) {
    view.root.setAttribute("aria-hidden", "true");
  } else {
    view.root.removeAttribute("aria-hidden");
  }
}

export function applyProgress(view: TocRailView, progress: number): void {
  view.progressFill.style.setProperty("--toc-rail-progress", String(progress));
}

export function applyActiveItem(
  items: readonly TocRailItem[],
  activeIndex: number,
  options: TocRailOptions
): string | null {
  const activeClassName = options.classes?.activeItem ?? DEFAULT_ACTIVE_CLASS;
  let activeId: string | null = null;

  items.forEach(({ item, link, heading }, index) => {
    const isActive = index === activeIndex;
    toggleClassNames(item, activeClassName, isActive);
    if (isActive) {
      item.dataset.tocRailActive = "true";
      link.setAttribute("aria-current", "location");
      activeId = heading.id;
    } else {
      delete item.dataset.tocRailActive;
      link.removeAttribute("aria-current");
    }
  });

  return activeId;
}

export function finishInitialRender(view: TocRailView): void {
  view.root.classList.remove("is-initializing");
}

function applyNavigationLabel(panel: HTMLElement, doc: Document, options: TocRailOptions): void {
  if (options.title === false) {
    panel.setAttribute("aria-label", options.ariaLabel ?? "Table of contents");
    return;
  }

  const title = doc.createElement("p");
  const titleId = createUniqueTitleId(doc, options.idPrefix ?? "toc-rail");
  title.className = "toc-rail__title";
  title.id = titleId;
  title.textContent = options.title ?? "On this page";
  panel.append(title);

  if (options.ariaLabel) {
    panel.setAttribute("aria-label", options.ariaLabel);
  } else {
    panel.setAttribute("aria-labelledby", titleId);
  }
}

function setRailInteractive(
  root: HTMLElement,
  items: readonly TocRailItem[],
  isInteractive: boolean
): void {
  (root as HTMLElement & { inert?: boolean }).inert = !isInteractive;
  items.forEach(({ link }) => {
    if (isInteractive) {
      link.removeAttribute("tabindex");
    } else {
      link.setAttribute("tabindex", "-1");
    }
  });
}

function addClassNames(element: Element, classNames?: string): void {
  for (const className of splitClassNames(classNames)) {
    element.classList.add(className);
  }
}

function toggleClassNames(element: Element, classNames: string, force: boolean): void {
  for (const className of splitClassNames(classNames)) {
    element.classList.toggle(className, force);
  }
}

function splitClassNames(classNames?: string): string[] {
  return classNames?.split(/\s+/).filter(Boolean) ?? [];
}

function encodeFragmentId(id: string): string {
  return encodeURIComponent(id);
}

function createUniqueTitleId(doc: Document, prefix: string): string {
  let index = 1;
  let candidate = `${prefix}-title`;
  while (doc.getElementById?.(candidate)) {
    index += 1;
    candidate = `${prefix}-title-${index}`;
  }
  return candidate;
}
