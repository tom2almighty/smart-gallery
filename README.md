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
import SmartGallery from 'smart-gallery';
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
const gallery = new SmartGallery('#my-gallery', {
    layout: 'justified', // 'justified' | 'masonry' | 'grid'
    gap: 10,
    targetRowHeight: 300
});

// Add items
// Note: You should provide either `width` and `height`, OR `aspectRatio`.
// This allows the library to calculate layout before images load (preventing layout shift).
// If `aspectRatio` is invalid, SmartGallery will fallback to `width/height`, then finally `1`.
gallery.setItems([
    { src: 'image1.jpg', width: 800, height: 600 },
    { src: 'image2.jpg', width: 1024, height: 768 },
    { src: 'image3.jpg', aspectRatio: 1.5 }, // width/height optional if aspectRatio is known
    // ...
]);

// setItems/addItems automatically update the layout.
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `layout` | String | `'justified'` | Layout mode: `'justified'`, `'masonry'`, `'grid'` |
| `gap` | Number | `10` | Gap between images in pixels |
| `className` | String | `''` | Custom class name added to container |
| `itemClassName` | String | `'sg-item'` | Custom class name added to each item |
| `targetRowHeight` | Number | `300` | (Justified only) Target height of rows |
| `lastRowBehavior` | String | `'left'` | (Justified only) `'left'`, `'center'`, `'right'`, `'fill'` (stretch), `'hide'` |
| `columnWidth` | Number | `300` | (Masonry/Grid only) Width of columns |
| `columns` | Number/String | `'auto'` | (Masonry/Grid only) Fixed number of columns or `'auto'` |
| `virtualize` | Boolean | `true` | Enable virtual scrolling (render only visible items) |
| `buffer` | Number | `500` | Extra render range outside viewport in px when virtualization is enabled |
| `placeholderColor` | String | `'#eee'` | Background color for unloaded images |
| `renderItem` | Function | `null` | Custom render function `(item, index) => HTMLElement` |
| `onItemClick` | Function | `null` | Click handler `({ id, index, item, element, geometry, originalEvent }) => void` |

## Lightbox Integration (Example with PhotoSwipe)

```javascript
const gallery = new SmartGallery('#gallery', {
    onItemClick: ({ index }) => {
        // Open your lightbox here using the index
        // See index.html for full PhotoSwipe example
    }
});
```

## Build
To build the minified version:
```bash
npm run build
# or
pnpm run build
```
