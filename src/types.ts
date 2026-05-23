export interface TocRailHeading {
  id: string;
  text: string;
  depth: number;
  element: Element;
}

export interface TocRailInstance {
  readonly element: HTMLElement;
  readonly activeId: string | null;
  readonly headings: readonly TocRailHeading[];
  readonly progress: number;
  refresh: () => void;
  update: () => void;
  unmount: () => void;
}

export interface TocRailOptions {
  content: string | Element;
  headings?: string | Iterable<Element> | false;
  container?: Element;
  title?: string | false;
  ariaLabel?: string;
  minWidth?: number;
  topOffset?: number;
  activeBoundary?: "viewport-start" | "viewport-end";
  activeOffset?: number;
  progressMode?: "outline" | "content";
  edge?: {
    hideBefore?: boolean;
    hideAfter?: boolean;
    afterBoundary?: "viewport-start" | "viewport-end";
    afterOffset?: number;
    beforeOffset?: number;
    afterFadeDistance?: number;
  };
  classes?: {
    root?: string;
    link?: string;
    activeItem?: string;
  };
  getHeadingText?: (heading: Element) => string;
  idPrefix?: string;
  scrollingClassDuration?: number;
  environment?: {
    window?: Window;
  };
}

export type TocRailVisibilityState =
  | "hidden-breakpoint"
  | "hidden-before"
  | "visible"
  | "fading-after"
  | "hidden-after";

export interface InternalTocRailHeading extends TocRailHeading {
  top: number;
}

export interface TocRailItem {
  item: HTMLElement;
  link: HTMLAnchorElement;
  heading: InternalTocRailHeading;
}
