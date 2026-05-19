import {
  DEFAULT_ACTIVE_OFFSET,
  DEFAULT_AFTER_FADE_DISTANCE,
  DEFAULT_BEFORE_OFFSET,
  DEFAULT_EDGE_TRANSLATE,
  DEFAULT_TOP_OFFSET
} from "./defaults.js";
import type { InternalTocRailHeading, TocRailOptions, TocRailVisibilityState } from "./types.js";

export interface TocRailMetrics {
  contentRect: DOMRect | { bottom: number; height: number; top: number };
  railRect: DOMRect | { bottom: number; height: number; top: number };
  scrollY: number;
  innerHeight: number;
  scrollHeight: number;
}

export interface TocRailVisualState {
  visibility: TocRailVisibilityState;
  edgeOpacity: number;
  edgeOffset: number;
  progress: number;
}

export function measureRailMetrics(
  content: Element,
  rail: HTMLElement,
  win: Window
): TocRailMetrics {
  return {
    contentRect: content.getBoundingClientRect(),
    railRect: rail.getBoundingClientRect(),
    scrollY: win.scrollY,
    innerHeight: win.innerHeight,
    scrollHeight: Math.max((content as HTMLElement).scrollHeight || 0, 1)
  };
}

export function computeVisualState(
  metrics: TocRailMetrics,
  options: TocRailOptions
): TocRailVisualState {
  const topOffset = options.topOffset ?? DEFAULT_TOP_OFFSET;
  const progress = calculateProgress(metrics, topOffset);

  if (shouldHideBefore(metrics.contentRect, options, topOffset)) {
    return {
      visibility: "hidden-before",
      edgeOpacity: 0,
      edgeOffset: DEFAULT_EDGE_TRANSLATE,
      progress
    };
  }

  const afterFade = calculateAfterFade(metrics, options);
  if (afterFade.opacity <= 0) {
    return {
      visibility: "hidden-after",
      edgeOpacity: 0,
      edgeOffset: afterFade.offset,
      progress
    };
  }

  return {
    visibility: afterFade.opacity < 1 ? "fading-after" : "visible",
    edgeOpacity: afterFade.opacity,
    edgeOffset: afterFade.offset,
    progress
  };
}

export function findActiveHeadingIndex(
  headings: readonly InternalTocRailHeading[],
  win: Window,
  options: TocRailOptions
): number {
  const activePoint =
    win.scrollY + (options.topOffset ?? DEFAULT_TOP_OFFSET) + (options.activeOffset ?? DEFAULT_ACTIVE_OFFSET);
  let activeIndex = -1;

  for (let index = 0; index < headings.length; index += 1) {
    if (headings[index]!.top <= activePoint) activeIndex = index;
    else break;
  }

  return activeIndex;
}

function shouldHideBefore(
  contentRect: TocRailMetrics["contentRect"],
  options: TocRailOptions,
  topOffset: number
): boolean {
  if (options.edge?.hideBefore === false) return false;
  const beforeOffset = options.edge?.beforeOffset ?? DEFAULT_BEFORE_OFFSET;
  return contentRect.top > topOffset + beforeOffset;
}

function calculateAfterFade(
  metrics: TocRailMetrics,
  options: TocRailOptions
): { opacity: number; offset: number } {
  if (options.edge?.hideAfter === false) {
    return { opacity: 1, offset: 0 };
  }

  const railBottom = getRectBottom(metrics.railRect);
  const distance = getRectBottom(metrics.contentRect) - railBottom;
  const fadeDistance = Math.max(options.edge?.afterFadeDistance ?? DEFAULT_AFTER_FADE_DISTANCE, 1);
  const opacity = clamp(distance / fadeDistance, 0, 1);
  return {
    opacity,
    offset: Number(((1 - opacity) * DEFAULT_EDGE_TRANSLATE).toFixed(3))
  };
}

function calculateProgress(metrics: TocRailMetrics, topOffset: number): number {
  const contentTop = metrics.contentRect.top + metrics.scrollY - topOffset;
  const contentEnd = contentTop + Math.max(metrics.scrollHeight || metrics.contentRect.height, 1);
  const midpoint = metrics.scrollY + metrics.innerHeight / 2;
  return clamp((midpoint - contentTop) / Math.max(contentEnd - contentTop, 1), 0, 1);
}

function getRectBottom(rect: { bottom: number; height: number; top: number }): number {
  return Number.isFinite(rect.bottom) ? rect.bottom : rect.top + rect.height;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number(value.toFixed(4))));
}
