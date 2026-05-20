# toc-rail

Sticky reading rail for long articles — TOC links, scroll progress, and active heading state. Vanilla TypeScript, ESM-only, zero dependencies.

![toc-rail demo](https://raw.githubusercontent.com/hanityx/toc-rail/main/demo/demo.png)

```sh
npm install toc-rail
```

```js
import { mountTocRail } from "toc-rail";
import "toc-rail/style.css";

const rail = mountTocRail({ content: "article" });

rail.refresh(); // call after headings or layout change
rail.unmount(); // call before leaving the page
```

`mountReadingRail` is an alias for `mountTocRail`.

## Options

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `content` | `string \| Element` | required | Article element or selector. |
| `headings` | `string \| Iterable<Element> \| false` | `h2[id], h3[id]` | Pass `false` for progress-only mode. |
| `minWidth` | `number` | `1140` | Hide below this viewport width (px). |
| `topOffset` | `number` | `52` | Fixed header height for scroll math. |
| `title` | `string \| false` | `"On this page"` | Rail heading; `false` hides it. |
| `edge.hideBefore` | `boolean` | `true` | Hide before the article enters the viewport. |
| `edge.hideAfter` | `boolean` | `true` | Hide after the article leaves the viewport. |
| `edge.afterFadeDistance` | `number` | `160` | Fade distance (px) near the article end. |
| `classes` | `object` | — | Extra class hooks: `root`, `link`, `activeItem`. |

Full option reference and live examples: [demo](https://hanityx.github.io/toc-rail/)

## Styling

Override CSS tokens:

```css
.toc-rail {
  --toc-rail-accent: #0066cc;
  --toc-rail-width: 184px;
  --toc-rail-right: 2rem;
  --toc-rail-top: max(96px, 18vh);
}
```

The package ships a `[data-theme='dark']` token block; `prefers-color-scheme` is intentionally not wired so the site controls when dark tokens apply.

Add `scroll-margin-top` to headings if you use a fixed header.

## Framework usage

```js
// React
useEffect(() => {
  const rail = mountTocRail({ content: "article" });
  return () => rail.unmount();
}, []);

// Vue
onMounted(() => (rail = mountTocRail({ content: "article" })));
onUnmounted(() => rail?.unmount());

// Svelte
onMount(() => {
  const rail = mountTocRail({ content: "article" });
  return () => rail.unmount();
});
```

## License

MIT
