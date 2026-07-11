# SmartGallery

A lightweight, dependency-free JavaScript library for creating beautiful gallery layouts.

## Features

- **3 Layout Modes**: Justified (Flickr-style), Masonry (Pinterest-style), and Grid.
- **Lightweight**: No external dependencies.
- **Lightbox Ready**: Easy integration with PhotoSwipe, FancyBox, etc.
- **Responsive**: Automatically updates when container width changes.

See [API.md](API.md) for the complete API and [MIGRATION.md](MIGRATION.md) when upgrading from 1.x.

## Installation

### 1. ES Module (Recommended)

```bash
npm install smart-gallery
# or
pnpm add smart-gallery
```

```javascript
import SmartGallery from "smart-gallery";
```

### 2. Browser Script (UMD)

```html
<script src="dist/smart-gallery.umd.js"></script>
<!-- SmartGallery is available as a global variable -->
```

### 3. CDN

```html
<!-- jsDelivr -->
<script src="https://cdn.jsdelivr.net/npm/smart-gallery/dist/smart-gallery.umd.js"></script>

<!-- unpkg -->
<script src="https://unpkg.com/smart-gallery/dist/smart-gallery.umd.js"></script>
```

## Quick Start

### 1. HTML Structure

```html
<div id="my-gallery"></div>
```

### 2. Initialize

```javascript
const gallery = new SmartGallery("#my-gallery", {
  layout: "justified", // 'justified' | 'masonry' | 'grid'
  gap: 10,
  targetRowHeight: 300,
});

// Add items
// Note: You should provide either `width` and `height`, OR `aspectRatio`.
// This allows the library to calculate layout before images load (preventing layout shift).
// If `aspectRatio` is invalid, SmartGallery will fallback to `width/height`, then finally `1`.
gallery.setItems([
  { src: "image1.jpg", width: 800, height: 600 },
  { src: "image2.jpg", width: 1024, height: 768 },
  { src: "image3.jpg", aspectRatio: 1.5 }, // width/height optional if aspectRatio is known
  // ...
]);

// setItems/addItems automatically update the layout.
```

## Options

| Option             | Type          | Default       | Description                                                                     |
| ------------------ | ------------- | ------------- | ------------------------------------------------------------------------------- |
| `layout`           | String        | `'justified'` | Layout mode: `'justified'`, `'masonry'`, `'grid'`                               |
| `gap`              | Number        | `10`          | Gap between images in pixels                                                    |
| `className`        | String        | `''`          | Custom class name added to container                                            |
| `itemClassName`    | String        | `'sg-item'`   | Custom class name added to each item                                            |
| `targetRowHeight`  | Number        | `300`         | (Justified only) Target height of rows                                          |
| `lastRowBehavior`  | String        | `'left'`      | (Justified only) `'left'`, `'center'`, `'right'`, `'fill'` (stretch), `'hide'`  |
| `columnWidth`      | Number        | `300`         | (Masonry/Grid only) Width of columns                                            |
| `columns`          | Number/String | `'auto'`      | (Masonry/Grid only) Fixed number of columns or `'auto'`                         |
| `virtualize`       | Boolean       | `true`        | Enable virtual scrolling (render only visible items)                            |
| `buffer`           | Number        | `500`         | Extra render range outside viewport in px when virtualization is enabled        |
| `placeholderColor` | String        | `'#eee'`      | Background color for unloaded images                                            |
| `renderItem`       | Function      | `null`        | Custom render function `(item, index) => HTMLElement`                           |
| `onItemClick`      | Function      | `null`        | Click handler `({ id, index, item, element, geometry, originalEvent }) => void` |

## Lightbox Integration (Example with PhotoSwipe)

```javascript
const gallery = new SmartGallery("#gallery", {
  onItemClick: ({ index }) => {
    // Open your lightbox here using the index
    // See index.html for full PhotoSwipe example
  },
});
```

## Build

Install dependencies and build the minified bundles:

```bash
pnpm install
pnpm run build
```

The generated files are written to `dist/`. Build artifacts are not committed to
the repository; `pnpm pack` and `npm publish` run the build automatically.

To run the local demo after building, open `index.html` in a browser.

## Development

Run the tests and production build before submitting changes:

```bash
pnpm check
```

## Release

Publishing uses npm Trusted Publishing with GitHub Actions OIDC. The trusted
publisher must target this repository, the `publish.yml` workflow, and the `npm`
GitHub Environment; no npm access token is required.

Update `package.json` to a version that has not been published, then commit the
version change:

```bash
pnpm version patch --no-git-tag-version
pnpm check
git add package.json
git commit -m "chore(release): 发布 2.0.1"
git push origin main
```

Use `minor` or `major` instead of `patch` when required. After the main branch CI
passes, create and push a tag that matches the new package version with a `v`
prefix:

```bash
git tag -a v2.0.1 -m "发布 v2.0.1"
git push origin v2.0.1
```

The publish workflow verifies the tag, rebuilds and tests the package, publishes
the generated npm archive through Trusted Publishing with automatic provenance,
and creates the corresponding GitHub Release with generated release notes. The
same `.tgz` archive is attached to the GitHub Release and contains the generated
`dist/` bundles; build artifacts remain excluded from Git.
