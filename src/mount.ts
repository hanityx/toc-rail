import {
  DEFAULT_ACTIVE_OFFSET,
  DEFAULT_MIN_WIDTH,
  DEFAULT_SCROLLING_CLASS_DURATION,
  DEFAULT_TOP_OFFSET
} from "./defaults.js";
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
    if (!mounted) return;
    markScrolling();
    if (animationFrame) return;
    animationFrame = win.requestAnimationFrame(() => {
      animationFrame = 0;
      update();
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
    syncActiveItemVisibility(view, itemData, activeIndex);
    const progress = getProgress({
      activeIndex,
      headings: headingData,
      items: itemData,
      metrics,
      options,
      fallbackProgress: visualState.progress,
      view,
      win
    });

    currentProgress = progress;
    currentActiveId = applyActiveItem(itemData, activeIndex, options);
    applyVisualState(
      view,
      itemData,
      visualState.visibility,
      visualState.edgeOpacity,
      visualState.edgeOffset
    );
    applyProgress(view, progress);
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

function getViewportContentProgress(
  metrics: ReturnType<typeof measureRailMetrics>,
  options: TocRailOptions
): number {
  const topOffset = options.topOffset ?? DEFAULT_TOP_OFFSET;
  const activeOffset = options.activeOffset ?? DEFAULT_ACTIVE_OFFSET;
  const contentTop = metrics.contentRect.top + metrics.scrollY;
  const contentHeight = Math.max(metrics.scrollHeight || metrics.contentRect.height, 1);
  const contentEnd = contentTop + contentHeight;
  const progressPoint =
    options.activeBoundary === "viewport-end"
      ? metrics.scrollY + metrics.innerHeight - activeOffset
      : metrics.scrollY + topOffset;

  if (contentEnd <= contentTop) return progressPoint >= contentTop ? 1 : 0;
  return clamp((progressPoint - contentTop) / (contentEnd - contentTop), 0, 1);
}

function getProgress({
  activeIndex,
  headings,
  items,
  metrics,
  options,
  fallbackProgress,
  view,
  win
}: {
  activeIndex: number;
  headings: readonly InternalTocRailHeading[];
  items: readonly TocRailItem[];
  metrics: ReturnType<typeof measureRailMetrics>;
  options: TocRailOptions;
  fallbackProgress: number;
  view: ReturnType<typeof createTocRailView>;
  win: Window;
}): number {
  if (options.progressMode === "content") {
    return getViewportContentProgress(metrics, options);
  }

  if (items.length === 0) return fallbackProgress;

  return getOutlineProgress(
    view,
    items,
    headings,
    activeIndex,
    metrics,
    win,
    options,
    fallbackProgress
  );
}

function syncActiveItemVisibility(
  view: ReturnType<typeof createTocRailView>,
  items: readonly TocRailItem[],
  activeIndex: number
): void {
  if (activeIndex < 0) return;

  const activeItem = items[activeIndex]?.item;
  const list = view.list;
  const listHeight = list.clientHeight;
  if (!activeItem || listHeight <= 0 || list.scrollHeight <= listHeight) return;

  const listRect = list.getBoundingClientRect();
  const trackRect = view.progressFill.parentElement?.getBoundingClientRect();
  const itemRect = activeItem.getBoundingClientRect();
  const upperEdge = Math.max(listRect.top, trackRect?.top ?? listRect.top);
  const lowerEdge = Math.min(listRect.bottom, trackRect?.bottom ?? listRect.bottom);
  if (lowerEdge <= upperEdge) return;
  let target = list.scrollTop;

  if (itemRect.top < upperEdge) {
    target -= upperEdge - itemRect.top;
  } else if (itemRect.bottom > lowerEdge) {
    target += itemRect.bottom - lowerEdge;
  } else {
    return;
  }

  list.scrollTop = clamp(target, 0, Math.max(list.scrollHeight - listHeight, 0));
}

function getOutlineProgress(
  view: ReturnType<typeof createTocRailView>,
  items: readonly TocRailItem[],
  headings: readonly InternalTocRailHeading[],
  activeIndex: number,
  metrics: ReturnType<typeof measureRailMetrics>,
  win: Window,
  options: TocRailOptions,
  fallbackProgress: number
): number {
  if (activeIndex < 0) return 0;

  const track = view.progressFill.parentElement;
  const trackRect = track?.getBoundingClientRect();
  const trackHeight = trackRect?.height ?? 0;
  if (!trackRect || trackHeight <= 0) return fallbackProgress;

  const currentCenter = getLinkCenter(items[activeIndex]!.link);
  let targetCenter = currentCenter;
  const activePoint =
    options.activeBoundary === "viewport-end"
      ? win.scrollY + win.innerHeight - (options.activeOffset ?? DEFAULT_ACTIVE_OFFSET)
      : win.scrollY +
        (options.topOffset ?? DEFAULT_TOP_OFFSET) +
        (options.activeOffset ?? DEFAULT_ACTIVE_OFFSET);

  const nextHeading = headings[activeIndex + 1];
  const nextItem = items[activeIndex + 1];
  if (nextHeading && nextItem) {
    const sectionSpan = Math.max(nextHeading.top - headings[activeIndex]!.top, 1);
    const t = clamp((activePoint - headings[activeIndex]!.top) / sectionSpan, 0, 1);
    targetCenter = mix(currentCenter, getLinkCenter(nextItem.link), t);
  } else {
    const contentTop = metrics.contentRect.top + metrics.scrollY;
    const contentEnd = contentTop + Math.max(metrics.scrollHeight || metrics.contentRect.height, 1);
    // Let the final item feel anchored before the line finishes toward the track end.
    const finalStart = headings[activeIndex]!.top + (options.topOffset ?? DEFAULT_TOP_OFFSET);
    const finalSpan = Math.max(contentEnd - finalStart, 1);
    const t = clamp((activePoint - finalStart) / finalSpan, 0, 1);
    targetCenter = mix(currentCenter, trackRect.bottom, t);
  }

  return clamp((targetCenter - trackRect.top) / trackHeight, 0, 1);
}

function getLinkCenter(link: HTMLAnchorElement): number {
  const rect = link.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

function mix(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number(value.toFixed(4))));
}
