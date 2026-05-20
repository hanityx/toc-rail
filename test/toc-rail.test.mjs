import assert from "node:assert/strict";
import test from "node:test";
import { mountTocRail } from "../dist/index.js";

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...values) {
    values.forEach((value) => this.values.add(value));
  }

  remove(...values) {
    values.forEach((value) => this.values.delete(value));
  }

  contains(value) {
    return this.values.has(value);
  }

  toggle(value, force) {
    const shouldAdd = force ?? !this.values.has(value);
    if (shouldAdd) this.values.add(value);
    else this.values.delete(value);
    return shouldAdd;
  }

  toString() {
    return Array.from(this.values).join(" ");
  }
}

class FakeElement {
  constructor(tagName = "div", rect = { top: 0, height: 0 }) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {
      setProperty(name, value) {
        this[name] = String(value);
      }
    };
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.ownerDocument = null;
    this.parentNode = null;
    this._rect = rect;
    this.id = "";
    this.textContent = "";
    this.hidden = false;
    this.scrollHeight = rect.height;
    this.className = "";
    this.href = "";
  }

  append(...nodes) {
    nodes.forEach((node) => {
      node.parentNode = this;
      this.children.push(node);
    });
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  replaceChildren(...nodes) {
    this.children.forEach((child) => {
      child.parentNode = null;
    });
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "href") this.href = String(value);
  }

  getAttribute(name) {
    return this.attributes.get(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  getBoundingClientRect() {
    return this._rect;
  }

  cloneNode() {
    const clone = new FakeElement(this.tagName, this._rect);
    clone.textContent = this.textContent;
    clone.id = this.id;
    return clone;
  }

  querySelectorAll(selector) {
    if (selector === ".heading-anchor, [aria-hidden='true'], [data-toc-ignore]") return [];
    return [];
  }
}

function createDom() {
  const body = new FakeElement("body");
  const article = new FakeElement("article", { top: -300, height: 1400 });
  const h2 = new FakeElement("h2", { top: 120, height: 20 });
  const h3 = new FakeElement("h3", { top: 620, height: 20 });
  h2.id = "intro section";
  h2.textContent = "Intro";
  h3.id = "already%20encoded";
  h3.textContent = "Details";

  const document = {
    body,
    fonts: { ready: Promise.resolve() },
    createElement(tagName) {
      const element = new FakeElement(tagName);
      element.ownerDocument = document;
      return element;
    },
    querySelector(selector) {
      if (selector === "article") return article;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "article h2[id], article h3[id]") return [h2, h3];
      return [];
    },
    getElementById(id) {
      return findById(body, id);
    }
  };

  body.ownerDocument = document;
  article.ownerDocument = document;
  h2.ownerDocument = document;
  h3.ownerDocument = document;
  article.querySelectorAll = (selector) =>
    selector === "h2[id], h3[id]" || selector === "article h2[id], article h3[id]" ? [h2, h3] : [];

  const listeners = new Map();
  const window = {
    innerHeight: 600,
    innerWidth: 1280,
    scrollY: 400,
    document,
    ResizeObserver: class {
      observe() {}
      disconnect() {
        window.resizeObserverDisconnected = true;
      }
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout
  };

  return { article, body, h2, h3, listeners, window };
}

function findByClass(node, className) {
  if (node.className === className || node.classList?.contains(className)) return node;
  for (const child of node.children ?? []) {
    const match = findByClass(child, className);
    if (match) return match;
  }
  return null;
}

function findById(node, id) {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const match = findById(child, id);
    if (match) return match;
  }
  return null;
}

test("mountTocRail mounts an accessible text outline with progress", () => {
  const { body, window } = createDom();

  const handle = mountTocRail({
    content: "article",
    headings: "article h2[id], article h3[id]",
    title: false,
    classes: {
      root: "custom-rail quiet",
      link: "custom-link compact"
    },
    environment: { window }
  });

  assert.equal(body.children.length, 1);
  const rail = body.children[0];
  assert.equal(rail.dataset.tocRail, "true");
  assert.equal(rail.classList.contains("custom-rail"), true);
  assert.equal(rail.classList.contains("quiet"), true);
  assert.equal(rail.getAttribute("role"), undefined);
  assert.equal(rail.children[0].getAttribute("aria-label"), "Table of contents");
  assert.equal(handle.headings.length, 2);
  assert.equal(handle.headings[0].text, "Intro");
  assert.equal(handle.headings[1].depth, 3);

  const list = findByClass(rail, "toc-rail__list");
  assert.equal(list.children.length, 2);
  assert.equal(list.children[0].children[0].textContent, "Intro");
  assert.equal(list.children[0].children[0].classList.contains("custom-link"), true);
  assert.equal(list.children[0].children[0].classList.contains("compact"), true);
  assert.equal(list.children[0].children[0].getAttribute("href"), "#intro%20section");
  assert.equal(list.children[1].children[0].getAttribute("href"), "#already%2520encoded");
  assert.equal(list.children[0].dataset.tocRailDepth, "2");
  assert.equal(list.children[0].children[0].dataset.tocRailLink, "true");

  const fill = findByClass(rail, "toc-rail__progress-fill");
  assert.equal(rail.dataset.tocRailProgress, "0");
  assert.equal(rail.style["--toc-rail-progress"], "0");
  assert.equal(fill.style["--toc-rail-progress"], "0");

  handle.unmount();
  assert.equal(body.children.length, 0);
});

test("mountTocRail updates active heading, min-width visibility, and cleanup", () => {
  const { body, h3, listeners, window } = createDom();
  window.innerWidth = 800;

  const handle = mountTocRail({
    content: "article",
    classes: { activeItem: "is-active current" },
    edge: { hideBefore: false },
    minWidth: 900,
    environment: { window }
  });

  const rail = body.children[0];
  assert.equal(rail.hidden, true);

  window.innerWidth = 1280;
  window.scrollY = 1200;
  h3._rect.top = 20;
  handle.update();

  assert.equal(rail.hidden, false);
  assert.equal(handle.activeId, "already%20encoded");
  const list = findByClass(rail, "toc-rail__list");
  assert.equal(list.children[1].classList.contains("is-active"), true);
  assert.equal(list.children[1].classList.contains("current"), true);
  assert.equal(list.children[1].dataset.tocRailActive, "true");
  assert.equal(list.children[1].children[0].getAttribute("aria-current"), "location");

  assert.equal(listeners.has("scroll"), true);
  handle.unmount();
  assert.equal(listeners.has("scroll"), false);
  assert.equal(window.resizeObserverDisconnected, true);
});

test("mountTocRail clears pending frames, timers, and window listeners on unmount", () => {
  const { listeners, window } = createDom();
  const rafCallbacks = [];
  const cancelledFrames = [];
  const clearedTimers = [];
  let frameId = 0;

  window.requestAnimationFrame = (callback) => {
    rafCallbacks.push(callback);
    frameId += 1;
    return frameId;
  };
  window.cancelAnimationFrame = (id) => {
    cancelledFrames.push(id);
  };
  window.setTimeout = () => 77;
  window.clearTimeout = (id) => {
    clearedTimers.push(id);
  };

  const handle = mountTocRail({
    content: "article",
    edge: { hideBefore: false },
    environment: { window }
  });

  listeners.get("scroll")();
  rafCallbacks.shift()();
  listeners.get("resize")();
  listeners.get("load")();
  listeners.get("scroll")();

  handle.unmount();

  assert.deepEqual(clearedTimers, [77, 77]);
  assert.deepEqual(cancelledFrames, [3, 2]);
  assert.equal(listeners.has("scroll"), false);
  assert.equal(listeners.has("resize"), false);
  assert.equal(listeners.has("load"), false);
});


test("mountTocRail supports progress-only mode without headings", () => {
  const { body, window } = createDom();

  const handle = mountTocRail({
    content: "article",
    headings: false,
    title: false,
    environment: { window }
  });

  const rail = body.children[0];
  const list = findByClass(rail, "toc-rail__list");
  const fill = findByClass(rail, "toc-rail__progress-fill");

  assert.equal(rail.hidden, false);
  assert.equal(rail.dataset.tocRailMode, "progress");
  assert.equal(rail.getAttribute("aria-hidden"), "true");
  assert.equal(rail.inert, true);
  assert.equal(rail.children[0].tagName, "DIV");
  assert.equal(rail.classList.contains("has-outline"), false);
  assert.equal(handle.headings.length, 0);
  assert.equal(handle.activeId, null);
  assert.equal(list, null);
  assert.equal(rail.dataset.tocRailProgress, "0.2514");
  assert.equal(rail.style["--toc-rail-progress"], "0.2514");
  assert.equal(fill.style["--toc-rail-progress"], "0.2514");

  handle.unmount();
});

test("package import is SSR-safe and mountTocRail fails clearly without a window", async () => {
  const mod = await import("../dist/index.js");

  assert.equal(typeof mod.mountTocRail, "function");
  assert.equal(mod.mountReadingRail, mod.mountTocRail);
  assert.throws(
    () => mod.mountTocRail({ content: "article" }),
    /mountTocRail requires a browser window/
  );
});

test("mountTocRail creates unique labelled title ids for multiple instances", () => {
  const { body, window } = createDom();

  const first = mountTocRail({
    content: "article",
    title: "First outline",
    environment: { window }
  });
  const second = mountTocRail({
    content: "article",
    title: "Second outline",
    environment: { window }
  });

  const firstNav = first.element.children[0];
  const secondNav = second.element.children[0];
  assert.equal(firstNav.getAttribute("aria-labelledby"), "toc-rail-title");
  assert.equal(secondNav.getAttribute("aria-labelledby"), "toc-rail-title-2");
  assert.notEqual(firstNav.children[0].id, secondNav.children[0].id);

  first.unmount();
  second.unmount();
  assert.equal(body.children.length, 0);
});

test("mountTocRail applies consistent before-content and after-content visibility states", () => {
  const { article, body, window } = createDom();
  const handle = mountTocRail({
    content: "article",
    environment: { window }
  });

  const rail = body.children[0];
  rail._rect = { top: 196, height: 360, bottom: 556 };
  article._rect = { top: 220, height: 6600, bottom: 6820 };
  handle.update();

  assert.equal(rail.classList.contains("is-before-content"), true);
  assert.equal(rail.dataset.tocRailState, "hidden-before");
  assert.equal(rail.getAttribute("aria-hidden"), "true");
  assert.equal(rail.inert, true);
  let list = findByClass(rail, "toc-rail__list");
  assert.equal(list.children[0].children[0].getAttribute("tabindex"), "-1");

  article._rect = { top: -6720, height: 6600, bottom: -120 };
  handle.update();

  assert.equal(rail.classList.contains("is-after-content"), true);
  assert.equal(rail.dataset.tocRailState, "hidden-after");
  assert.equal(rail.style["--toc-rail-edge-opacity"], "0");
  assert.equal(rail.getAttribute("aria-hidden"), "true");
  assert.equal(rail.inert, true);
  assert.equal(list.children[0].children[0].getAttribute("tabindex"), "-1");

  article._rect = { top: -6600, height: 6600, bottom: 0 };
  handle.update();
  assert.equal(rail.classList.contains("is-after-content"), false);
  assert.equal(rail.dataset.tocRailState, "fading-after");
  assert.equal(Number(rail.style["--toc-rail-edge-opacity"]) > 0, true);
  assert.equal(Number(rail.style["--toc-rail-edge-opacity"]) < 1, true);
  assert.equal(rail.getAttribute("aria-hidden"), undefined);
  assert.equal(rail.inert, false);
  assert.equal(list.children[0].children[0].getAttribute("tabindex"), undefined);

  article._rect = { top: -6540, height: 6600, bottom: 60 };
  handle.update();
  assert.equal(rail.classList.contains("is-before-content"), false);
  assert.equal(rail.classList.contains("is-after-content"), false);
  assert.equal(rail.dataset.tocRailState, "visible");
  assert.equal(rail.style["--toc-rail-edge-opacity"], "1");

  handle.unmount();
});

test("mountTocRail uses cached heading positions until refresh", () => {
  const { body, h3, window } = createDom();
  const handle = mountTocRail({
    content: "article",
    topOffset: 52,
    activeOffset: 32,
    environment: { window }
  });

  window.scrollY = 1200;
  h3._rect.top = 2000;
  handle.update();
  assert.equal(handle.activeId, "already%20encoded");

  handle.refresh();
  assert.equal(handle.activeId, null);

  window.scrollY = 0;
  handle.update();
  assert.equal(handle.activeId, null);

  handle.unmount();
  assert.equal(body.children.length, 0);
});
