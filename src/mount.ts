import { DEFAULT_MIN_WIDTH, DEFAULT_SCROLLING_CLASS_DURATION } from "./defaults.js";
import { computeVisualState, findActiveHeadingIndex, measureRailMetrics } from "./geometry.js";
import { collectHeadings, refreshHeadingPositions } from "./headings.js";
import type { InternalTocRailHeading, TocRailInstance, TocRailItem, TocRailOptions } from "./types.js";
import {
  applyActiveItem,
  applyProgress,
  applyVisualState,
  createTocRailView,
  finishInitialRender,
  renderHeadingItems
} from "./view.js";

export function mountTocRail(options: TocRailOptions): TocRailInstance {
  const globalWindow = typeof globalThis.window === "undefined" ? undefined : globalThis.window;
  const maybeWindow = options.environment?.window ?? globalWindow;
  if (!maybeWindow?.document) {
    throw new Error("mountTocRail requires a browser window.");
  }

  const win: Window = maybeWindow;
  const doc = win.document;
  const resolvedContent = resolveElement(options.content, doc);
  if (!resolvedContent) {
    throw new Error("mountTocRail could not find the content element.");
  }

  const content = resolvedContent;
  const container = options.container ?? doc.body;
  const view = createTocRailView(doc, options);
  let headingData: InternalTocRailHeading[] = [];
  let itemData: TocRailItem[] = [];
  let animationFrame = 0;
  let refreshFrame = 0;
  let currentProgress = 0;
  let currentActiveId: string | null = null;
  let mounted = true;
  let scrollIdleTimer: number | undefined;
  const imageLoadCleanups: Array<() => void> = [];

  container.append(view.root);

  const handle: TocRailInstance = {
    element: view.root,
    get activeId() {
      return currentActiveId;
    },
    get headings() {
      return headingData;
    },
    get progress() {
      return currentProgress;
    },
    refresh,
    update,
    unmount
  };

  type ResizeObserverConstructor = new (callback: ResizeObserverCallback) => ResizeObserver;
  const ResizeObserverCtor = (win as Window & { ResizeObserver?: ResizeObserverConstructor })
    .ResizeObserver;
  const resizeObserver =
    typeof ResizeObserverCtor === "function" ? new ResizeObserverCtor(() => scheduleRefresh()) : null;

  // Keep measurements fresh after layout shifts. Images are the fallback for older DOMs.
  resizeObserver?.observe(content);
  if (!resizeObserver) {
    content.querySelectorAll("img").forEach((image) => {
      const handleImageLoad = () => scheduleRefresh();
      image.addEventListener("load", handleImageLoad, { once: true });
      imageLoadCleanups.push(() => image.removeEventListener("load", handleImageLoad));
    });
  }

  win.addEventListener("scroll", scheduleUpdate, { passive: true });
  win.addEventListener("resize", scheduleRefresh, { passive: true });
  win.addEventListener("load", handleLoad, { once: true });
  (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.then(() => {
    // Web fonts can move headings after first paint, so take one more pass when they settle.
    if (mounted) scheduleRefresh();
  });

  refresh();

  return handle;

  function scheduleUpdate(): void {
    if (!mounted || animationFrame) return;
    animationFrame = win.requestAnimationFrame(() => {
      animationFrame = 0;
      update();
      markScrolling();
    });
  }

  function scheduleRefresh(): void {
    if (!mounted || refreshFrame) return;
    refreshFrame = win.requestAnimationFrame(() => {
      refreshFrame = 0;
      refresh();
    });
  }

  function handleLoad(): void {
    scheduleRefresh();
  }

  function refresh(): void {
    if (!mounted) return;
    // Rebuild the outline only on refresh; scroll updates reuse cached heading positions.
    headingData = refreshHeadingPositions(collectHeadings(content, options, win), win);
    itemData = renderHeadingItems(view, doc, headingData, options);
    update();
    finishInitialRender(view);
  }

  function update(): void {
    if (!mounted) return;
    if (win.innerWidth < (options.minWidth ?? DEFAULT_MIN_WIDTH)) {
      applyVisualState(view, itemData, "hidden-breakpoint", 0, 0);
      currentProgress = 0;
      currentActiveId = null;
      return;
    }

    if (view.root.hidden) view.root.hidden = false;
    const metrics = measureRailMetrics(content, view.root, win);
    const visualState = computeVisualState(metrics, options);
    const activeIndex = findActiveHeadingIndex(headingData, win, options);

    currentProgress = visualState.progress;
    currentActiveId = applyActiveItem(itemData, activeIndex, options);
    applyVisualState(
      view,
      itemData,
      visualState.visibility,
      visualState.edgeOpacity,
      visualState.edgeOffset
    );
    applyProgress(view, currentProgress);
  }

  function markScrolling(): void {
    if (view.root.hidden) return;
    view.root.classList.add("is-scrolling");
    if (scrollIdleTimer) win.clearTimeout(scrollIdleTimer);
    scrollIdleTimer = win.setTimeout(() => {
      scrollIdleTimer = undefined;
      if (mounted) view.root.classList.remove("is-scrolling");
    }, options.scrollingClassDuration ?? DEFAULT_SCROLLING_CLASS_DURATION);
  }

  function unmount(): void {
    if (!mounted) return;
    mounted = false;
    if (animationFrame) win.cancelAnimationFrame(animationFrame);
    if (refreshFrame) win.cancelAnimationFrame(refreshFrame);
    if (scrollIdleTimer) win.clearTimeout(scrollIdleTimer);
    resizeObserver?.disconnect();
    imageLoadCleanups.splice(0).forEach((cleanup) => cleanup());
    win.removeEventListener("scroll", scheduleUpdate);
    win.removeEventListener("resize", scheduleRefresh);
    win.removeEventListener("load", handleLoad);
    view.root.remove();
  }
}

function resolveElement(target: string | Element, doc: Document): Element | null {
  return typeof target === "string" ? doc.querySelector(target) : target;
}
