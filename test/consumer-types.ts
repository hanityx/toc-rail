// Checks local dist declarations directly; consumer-smoke checks the packed package.
import {
  mountReadingRail,
  mountTocRail,
  type TocRailHeading,
  type TocRailInstance,
  type TocRailOptions
} from "../dist/index.js";

const options: TocRailOptions = {
  content: "article",
  headings: false,
  activeOffset: 40,
  ariaLabel: "Article progress",
  container: document.body,
  edge: {
    afterFadeDistance: 120,
    beforeOffset: 80,
    hideAfter: true,
    hideBefore: false
  },
  environment: { window },
  getHeadingText: (heading) => heading.textContent ?? "",
  idPrefix: "docs",
  minWidth: 1024,
  scrollingClassDuration: 120,
  title: false,
  topOffset: 56
};

const rail: TocRailInstance = mountTocRail(options);
const aliasRail: TocRailInstance = mountReadingRail(options);
const alias: typeof mountTocRail = mountReadingRail;
const firstHeading: TocRailHeading | undefined = rail.headings[0];

alias({ content: document.body });
aliasRail.unmount();
firstHeading?.element.getBoundingClientRect();
