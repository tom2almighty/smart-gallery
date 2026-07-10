import {
    computeGridLayout,
    computeJustifiedLayout,
    computeMasonryLayout
} from './layouts.js';

/**
 * SmartGallery - A lightweight, dependency-free gallery layout library.
 * Supports Justified, Masonry, and Grid layouts with virtualization.
 */
const DEFAULT_OPTIONS = Object.freeze({
    layout: 'justified',
    gap: 10,
    targetRowHeight: 300,
    lastRowBehavior: 'left',
    columnWidth: 300,
    columns: 'auto',
    className: '',
    itemClassName: 'sg-item',
    virtualize: true,
    buffer: 500,
    scrollContainer: 'auto',
    placeholderColor: '#eee',
    errorClassName: 'sg-item-error',
    renderItem: null,
    onItemClick: null,
    onImageLoad: null,
    onImageError: null
});

const LAYOUTS = new Set(['justified', 'masonry', 'grid']);
const LAST_ROW_BEHAVIORS = new Set(['left', 'center', 'right', 'fill', 'hide']);

function assertFiniteNumber(value, name, { min = -Infinity, exclusiveMin = false } = {}) {
    if (!Number.isFinite(value) || (exclusiveMin ? value <= min : value < min)) {
        const comparison = exclusiveMin ? `大于 ${min}` : `不小于 ${min}`;
        throw new TypeError(`SmartGallery: "${name}" 必须是${comparison}的有限数字。`);
    }
}

function normalizeOptions(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('SmartGallery: options 必须是对象。');
    }

    const normalized = { ...DEFAULT_OPTIONS, ...options };
    if (!LAYOUTS.has(normalized.layout)) {
        throw new TypeError(`SmartGallery: 不支持布局 "${normalized.layout}"。`);
    }
    if (!LAST_ROW_BEHAVIORS.has(normalized.lastRowBehavior)) {
        throw new TypeError(`SmartGallery: 不支持最后一行行为 "${normalized.lastRowBehavior}"。`);
    }

    assertFiniteNumber(normalized.gap, 'gap', { min: 0 });
    assertFiniteNumber(normalized.targetRowHeight, 'targetRowHeight', { min: 0, exclusiveMin: true });
    assertFiniteNumber(normalized.columnWidth, 'columnWidth', { min: 0, exclusiveMin: true });
    assertFiniteNumber(normalized.buffer, 'buffer', { min: 0 });

    if (normalized.columns !== 'auto'
        && (!Number.isInteger(normalized.columns) || normalized.columns <= 0)) {
        throw new TypeError('SmartGallery: "columns" 必须是 "auto" 或正整数。');
    }
    if (typeof normalized.virtualize !== 'boolean') {
        throw new TypeError('SmartGallery: "virtualize" 必须是布尔值。');
    }
    if (normalized.scrollContainer !== 'auto'
        && normalized.scrollContainer !== window
        && (!normalized.scrollContainer
            || normalized.scrollContainer.nodeType !== Node.ELEMENT_NODE)) {
        throw new TypeError('SmartGallery: "scrollContainer" 必须是 "auto"、window 或 DOM 元素。');
    }
    if (typeof normalized.className !== 'string' || /\s/.test(normalized.className)) {
        throw new TypeError('SmartGallery: "className" 必须是单个 CSS 类名。');
    }
    if (typeof normalized.itemClassName !== 'string'
        || normalized.itemClassName.length === 0
        || /\s/.test(normalized.itemClassName)) {
        throw new TypeError('SmartGallery: "itemClassName" 必须是单个非空 CSS 类名。');
    }
    if (typeof normalized.placeholderColor !== 'string') {
        throw new TypeError('SmartGallery: "placeholderColor" 必须是字符串。');
    }
    if (typeof normalized.errorClassName !== 'string'
        || normalized.errorClassName.length === 0
        || /\s/.test(normalized.errorClassName)) {
        throw new TypeError('SmartGallery: "errorClassName" 必须是单个非空 CSS 类名。');
    }
    for (const callbackName of ['renderItem', 'onItemClick', 'onImageLoad', 'onImageError']) {
        const callback = normalized[callbackName];
        if (callback !== null && typeof callback !== 'function') {
            throw new TypeError(`SmartGallery: "${callbackName}" 必须是函数或 null。`);
        }
    }

    return normalized;
}

class SmartGallery {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this.container || this.container.nodeType !== Node.ELEMENT_NODE) {
            throw new TypeError('SmartGallery: container 必须是存在的 DOM 元素或有效选择器。');
        }

        this._options = normalizeOptions(options);

        this._items = [];
        this._nextItemId = 1;
        this.contentNeedsReset = true;
        this.geometry = []; // Calculated layout positions {left, top, width, height, itemIndex}
        this.renderedIndices = new Set(); // Track rendered items for virtualization
        this.mountedItemElements = new Map();
        this.topSortedGeometryIndices = [];
        this.topSortedStarts = [];
        this.maxGeometryHeight = 0;
        this.currentVisibleStartPos = -1;
        this.currentVisibleEndPos = -1;

        this.resizeObserver = null;
        this.scrollHandler = null;
        this.scrollContainer = window;
        this.isResizing = false;
        this.isDestroyed = false;
        this.resizeTimer = null;
        this.animationFrame = null;
        this.lastObservedWidth = this.container.clientWidth;
        this.originalContainerPosition = this.container.style.position;
        this.originalContainerHeight = this.container.style.height;
        this.hadSmartGalleryClass = this.container.classList.contains('smart-gallery');
        this.hadCustomClass = this._options.className
            ? this.container.classList.contains(this._options.className)
            : false;

        this._init();
    }

    _init() {
        this.container.style.position = 'relative';
        this.container.classList.add('smart-gallery');
        if (this._options.className) {
            this.container.classList.add(this._options.className);
        }
        
        // Debounced resize handler
        this.resizeObserver = new ResizeObserver(() => {
            if (this.isDestroyed || this.isResizing) return;
            const currentWidth = this.container.clientWidth;
            if (Math.abs(currentWidth - this.lastObservedWidth) < 1) return;
            this.lastObservedWidth = currentWidth;
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                this.resizeTimer = null;
                this.render();
            }, 100);
        });
        this.resizeObserver.observe(this.container);

        // Scroll handler for virtualization
        this._bindScrollListener();
    }

    _getScrollParent(el) {
        let parent = el.parentElement;
        while (parent) {
            const style = window.getComputedStyle(parent);
            const overflowY = style.overflowY;
            const isScrollable = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
            if (isScrollable) {
                return parent;
            }
            parent = parent.parentElement;
        }
        return window;
    }

    _bindScrollListener() {
        if (!this._options.virtualize) return;
        this.scrollContainer = this._options.scrollContainer === 'auto'
            ? this._getScrollParent(this.container)
            : this._options.scrollContainer;
        this.scrollHandler = this._throttle(this._handleScroll.bind(this), 50);
        this.scrollContainer.addEventListener('scroll', this.scrollHandler, { passive: true });
    }

    _unbindScrollListener() {
        if (this.scrollHandler && this.scrollContainer) {
            this.scrollContainer.removeEventListener('scroll', this.scrollHandler);
            this.scrollHandler.cancel();
        }
        this.scrollHandler = null;
        this.scrollContainer = window;
    }

    _normalizeItems(items, existingIds = new Set()) {
        if (!Array.isArray(items)) {
            throw new TypeError('SmartGallery: items 必须是数组。');
        }

        const seenIds = new Set(existingIds);
        return items.map((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                throw new TypeError(`SmartGallery: items[${index}] 必须是对象。`);
            }
            if (this._options.renderItem === null
                && (typeof item.src !== 'string' || item.src.length === 0)) {
                throw new TypeError(`SmartGallery: 默认渲染要求 items[${index}].src 是非空字符串。`);
            }

            let id = item.id;
            if (id === undefined || id === null) {
                do {
                    id = `sg-${this._nextItemId++}`;
                } while (seenIds.has(id));
            } else if (typeof id !== 'string' && typeof id !== 'number') {
                throw new TypeError(`SmartGallery: items[${index}].id 必须是字符串或数字。`);
            }
            if (seenIds.has(id)) {
                throw new TypeError(`SmartGallery: 图片 id "${id}" 重复。`);
            }
            seenIds.add(id);

            let aspectRatio = Number(item.aspectRatio);
            if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
                const width = Number(item.width);
                const height = Number(item.height);
                if (Number.isFinite(width) && Number.isFinite(height) && height > 0) {
                    aspectRatio = width / height;
                }
            }

            if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
                aspectRatio = 1;
            }

            return { ...item, id, aspectRatio };
        });
    }

    _assertActive() {
        if (this.isDestroyed) {
            throw new Error('SmartGallery: 实例已销毁。');
        }
    }

    setItems(items) {
        this._assertActive();
        this._items = this._normalizeItems(items);
        this.contentNeedsReset = true;
        this.render();
        return this;
    }

    addItems(items) {
        this._assertActive();
        const existingIds = new Set(this._items.map(item => item.id));
        this._items = [...this._items, ...this._normalizeItems(items, existingIds)];
        this.contentNeedsReset = true;
        this.render();
        return this;
    }

    removeItem(id) {
        this._assertActive();
        const index = this._items.findIndex(item => item.id === id);
        if (index === -1) return false;
        this._items = [
            ...this._items.slice(0, index),
            ...this._items.slice(index + 1)
        ];
        this.contentNeedsReset = true;
        this.render();
        return true;
    }

    clear() {
        this._assertActive();
        this._items = [];
        this.contentNeedsReset = true;
        this.render();
        return this;
    }

    setOptions(options) {
        this._assertActive();
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new TypeError('SmartGallery: setOptions(options) 的 options 必须是对象。');
        }
        const previousClassName = this._options.className;
        const nextOptions = normalizeOptions({ ...this._options, ...options });
        if (nextOptions.renderItem === null) {
            const invalidIndex = this._items.findIndex(
                item => typeof item.src !== 'string' || item.src.length === 0
            );
            if (invalidIndex !== -1) {
                throw new TypeError(`SmartGallery: 默认渲染要求 items[${invalidIndex}].src 是非空字符串。`);
            }
        }
        if (nextOptions.itemClassName !== this._options.itemClassName
            || nextOptions.renderItem !== this._options.renderItem
            || nextOptions.placeholderColor !== this._options.placeholderColor
            || nextOptions.errorClassName !== this._options.errorClassName
            || nextOptions.onItemClick !== this._options.onItemClick) {
            this.contentNeedsReset = true;
        }

        if (previousClassName !== nextOptions.className) {
            if (previousClassName && !this.hadCustomClass) {
                this.container.classList.remove(previousClassName);
            }
            this.hadCustomClass = nextOptions.className
                ? this.container.classList.contains(nextOptions.className)
                : false;
            if (nextOptions.className) {
                this.container.classList.add(nextOptions.className);
            }
        }

        this._unbindScrollListener();
        this._options = nextOptions;
        this._bindScrollListener();
        this.render();
        return this;
    }

    getItems() {
        return this._items.map(item => ({ ...item }));
    }

    getIndex(id) {
        return this._items.findIndex(item => item.id === id);
    }

    getItem(id) {
        const item = this._items.find(candidate => candidate.id === id);
        return item ? { ...item } : null;
    }

    getGeometry(id) {
        const index = this.getIndex(id);
        if (index === -1) return null;
        const box = this.geometry[index];
        return box ? { ...box } : null;
    }

    render() {
        if (this.isDestroyed) {
            throw new Error('SmartGallery: 实例已销毁，不能继续渲染。');
        }
        if (this._items.length === 0) {
            if (this.contentNeedsReset) {
                this._resetRenderedState();
                this.contentNeedsReset = false;
            } else {
                this._resetGeometryState();
            }
            this.container.style.height = '0px';
            return;
        }
        this.isResizing = true;

        try {
            this._options = normalizeOptions(this._options);
            const containerWidth = this.container.clientWidth;
            if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
                this._resetRenderedState();
                this.container.style.height = '0px';
                return;
            }
            this.lastObservedWidth = containerWidth;
            const { layout } = this._options;
            let containerHeight = 0;

            this._resetRenderedState();

            let result;
            if (layout === 'justified') {
                result = computeJustifiedLayout(this._items, containerWidth, this._options);
            } else if (layout === 'masonry') {
                result = computeMasonryLayout(this._items, containerWidth, this._options);
            } else if (layout === 'grid') {
                result = computeGridLayout(this._items, containerWidth, this._options);
            }

            this.geometry = result.boxes.map((box, i) => ({ ...box, itemIndex: i })); // Store index
            containerHeight = result.containerHeight;
            this._buildVisibleIndex();
            this._updateMountedGeometry();

            this.container.style.height = `${containerHeight}px`;

            // Initial render of visible items
            this._updateVisibleItems();
        } finally {
            this.isResizing = false;
        }
    }

    _resetRenderedState() {
        this.renderedIndices.clear();
        this.mountedItemElements.clear();
        this._resetGeometryState();
        this.container.replaceChildren();
    }

    _resetGeometryState() {
        this.topSortedGeometryIndices = [];
        this.topSortedStarts = [];
        this.maxGeometryHeight = 0;
        this.currentVisibleStartPos = -1;
        this.currentVisibleEndPos = -1;
        this.geometry = [];
    }

    _updateMountedGeometry() {
        for (const [index, element] of this.mountedItemElements) {
            const box = this.geometry[index];
            if (!box || box.itemIndex !== index) {
                this._unmountItem(index);
                this.renderedIndices.delete(index);
                continue;
            }
            this._applyBoxStyles(element, box);
        }
    }

    _buildVisibleIndex() {
        const sorted = this.geometry
            .map((box, idx) => ({ idx, top: box.top }))
            .sort((a, b) => a.top - b.top);

        this.topSortedGeometryIndices = new Array(sorted.length);
        this.topSortedStarts = new Array(sorted.length);

        let maxHeight = 0;
        for (let i = 0; i < sorted.length; i++) {
            const item = sorted[i];
            this.topSortedGeometryIndices[i] = item.idx;
            this.topSortedStarts[i] = item.top;
            const h = this.geometry[item.idx].height;
            if (h > maxHeight) maxHeight = h;
        }
        this.maxGeometryHeight = maxHeight;
    }

    _lowerBound(arr, target) {
        let left = 0;
        let right = arr.length;

        while (left < right) {
            const mid = (left + right) >> 1;
            if (arr[mid] < target) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }

        return left;
    }

    _mountRangeByPos(startPos, endPos) {
        if (startPos < 0 || endPos < 0 || endPos < startPos) return;
        const fragment = document.createDocumentFragment();

        for (let pos = startPos; pos <= endPos; pos++) {
            const geometryIndex = this.topSortedGeometryIndices[pos];
            const itemIndex = this.geometry[geometryIndex].itemIndex;
            if (!this.renderedIndices.has(itemIndex)) {
                this._mountItem(this.geometry[geometryIndex], fragment);
                this.renderedIndices.add(itemIndex);
            }
        }

        this.container.appendChild(fragment);
    }

    _unmountRangeByPos(startPos, endPos) {
        if (startPos < 0 || endPos < 0 || endPos < startPos) return;

        for (let pos = startPos; pos <= endPos; pos++) {
            const geometryIndex = this.topSortedGeometryIndices[pos];
            const itemIndex = this.geometry[geometryIndex].itemIndex;
            if (this.renderedIndices.has(itemIndex)) {
                this._unmountItem(itemIndex);
                this.renderedIndices.delete(itemIndex);
            }
        }
    }

    _updateVisibleItems() {
        if (!this._options.virtualize) {
            // Render all with batched mount
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < this.geometry.length; i++) {
                const box = this.geometry[i];
                const index = box.itemIndex;
                if (!this.renderedIndices.has(index)) {
                    this._mountItem(box, fragment);
                    this.renderedIndices.add(index);
                }
            }
            this.container.appendChild(fragment);
            return;
        }

        const buffer = this._options.buffer;
        let scrollTop = 0;
        let viewportHeight = 0;
        let containerTop = 0;

        if (this.scrollContainer === window) {
            scrollTop = window.scrollY;
            viewportHeight = window.innerHeight;
            const rect = this.container.getBoundingClientRect();
            containerTop = rect.top + scrollTop;
        } else {
            scrollTop = this.scrollContainer.scrollTop;
            viewportHeight = this.scrollContainer.clientHeight;
            const containerRect = this.container.getBoundingClientRect();
            const scrollRect = this.scrollContainer.getBoundingClientRect();
            containerTop = containerRect.top - scrollRect.top + scrollTop;
        }

        // Calculate visible range relative to container
        const startY = Math.max(0, scrollTop - containerTop - buffer);
        const endY = scrollTop - containerTop + viewportHeight + buffer;

        let nextStart = -1;
        let nextEnd = -1;

        if (this.topSortedGeometryIndices.length > 0) {
            const safeStart = Math.max(0, startY - this.maxGeometryHeight);
            let cursor = this._lowerBound(this.topSortedStarts, safeStart);

            while (cursor < this.topSortedGeometryIndices.length) {
                const geometryIndex = this.topSortedGeometryIndices[cursor];
                const box = this.geometry[geometryIndex];
                if (box.top >= endY) break;
                if (box.top + box.height > startY) {
                    if (nextStart === -1) nextStart = cursor;
                    nextEnd = cursor;
                }
                cursor++;
            }
        }

        const prevStart = this.currentVisibleStartPos;
        const prevEnd = this.currentVisibleEndPos;

        if (nextStart === -1) {
            this._unmountRangeByPos(prevStart, prevEnd);
        } else if (prevStart === -1) {
            const nextIndices = new Set();
            for (let pos = nextStart; pos <= nextEnd; pos++) {
                const geometryIndex = this.topSortedGeometryIndices[pos];
                nextIndices.add(this.geometry[geometryIndex].itemIndex);
            }
            for (const index of this.renderedIndices) {
                if (!nextIndices.has(index)) {
                    this._unmountItem(index);
                    this.renderedIndices.delete(index);
                }
            }
            this._mountRangeByPos(nextStart, nextEnd);
        } else {
            if (nextStart < prevStart) {
                this._mountRangeByPos(nextStart, Math.min(prevStart - 1, nextEnd));
            }
            if (nextEnd > prevEnd) {
                this._mountRangeByPos(Math.max(prevEnd + 1, nextStart), nextEnd);
            }
            if (prevStart < nextStart) {
                this._unmountRangeByPos(prevStart, Math.min(nextStart - 1, prevEnd));
            }
            if (prevEnd > nextEnd) {
                this._unmountRangeByPos(Math.max(nextEnd + 1, prevStart), prevEnd);
            }
        }

        this.currentVisibleStartPos = nextStart;
        this.currentVisibleEndPos = nextEnd;
    }

    _mountItem(box, parentNode = this.container) {
        const index = box.itemIndex;
        const itemData = this._items[index];
        const div = document.createElement('div');
        div.className = this._options.itemClassName;
        div.dataset.sgId = String(itemData.id);
        this._applyBoxStyles(div, box);

        // Render content
        if (this._options.renderItem) {
            const content = this._options.renderItem(itemData, index);
            if (!content || typeof content.nodeType !== 'number') {
                throw new TypeError('SmartGallery: renderItem 必须返回 DOM Node。');
            }
            div.appendChild(content);
        } else {
            // Default render with placeholder support
            div.style.backgroundColor = itemData.placeholderColor || this._options.placeholderColor;

            const img = document.createElement('img');
            img.alt = typeof itemData.alt === 'string' ? itemData.alt : '';
            if (typeof itemData.title === 'string') img.title = itemData.title;
            if (typeof itemData.srcset === 'string') img.srcset = itemData.srcset;
            if (typeof itemData.sizes === 'string') img.sizes = itemData.sizes;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.display = 'block';
            img.style.opacity = '0'; // Start invisible
            img.style.transition = 'opacity 0.3s';
            img.loading = 'lazy'; // Native lazy load
            img.decoding = 'async';
            img.draggable = false;

            img.onload = (event) => {
                img.style.opacity = '1';
                div.classList.remove(this._options.errorClassName);
                if (this._options.onImageLoad) {
                    this._options.onImageLoad({
                        id: itemData.id,
                        index,
                        item: { ...itemData },
                        image: img,
                        element: div,
                        originalEvent: event
                    });
                }
            };
            img.onerror = (event) => {
                div.classList.add(this._options.errorClassName);
                if (this._options.onImageError) {
                    this._options.onImageError({
                        id: itemData.id,
                        index,
                        item: { ...itemData },
                        image: img,
                        element: div,
                        originalEvent: event
                    });
                }
            };
            img.src = itemData.src;

            div.appendChild(img);
        }

        const activate = (event) => {
            if (this._options.onItemClick) {
                this._options.onItemClick({
                    id: itemData.id,
                    index,
                    item: { ...itemData },
                    element: div,
                    geometry: this.getGeometry(itemData.id),
                    originalEvent: event
                });
            }
        };
        if (this._options.onItemClick) {
            div.tabIndex = 0;
            div.setAttribute('role', 'button');
            div.addEventListener('click', activate);
            div.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                activate(event);
            });
        }

        parentNode.appendChild(div);
        this.mountedItemElements.set(index, div);
    }

    _applyBoxStyles(element, box) {
        element.style.position = 'absolute';
        element.style.left = `${box.left}px`;
        element.style.top = `${box.top}px`;
        element.style.width = `${box.width}px`;
        element.style.height = `${box.height}px`;
    }

    _unmountItem(index) {
        const el = this.mountedItemElements.get(index);
        if (el) {
            el.remove(); // Removes from DOM
            this.mountedItemElements.delete(index);
        }
    }
    
    _handleScroll() {
        if (!this.isDestroyed && !this.isResizing && this.animationFrame === null) {
            this.animationFrame = requestAnimationFrame(() => {
                this.animationFrame = null;
                if (!this.isDestroyed) this._updateVisibleItems();
            });
        }
    }

    _throttle(func, limit) {
        let timer = null;
        const throttled = function() {
            const args = arguments;
            const context = this;
            if (timer === null) {
                func.apply(context, args);
                timer = setTimeout(() => {
                    timer = null;
                }, limit);
            }
        };
        throttled.cancel = () => {
            clearTimeout(timer);
            timer = null;
        };
        return throttled;
    }

    destroy() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        this._unbindScrollListener();
        clearTimeout(this.resizeTimer);
        this.resizeTimer = null;
        if (this.animationFrame !== null) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        this._resetRenderedState();
        this.container.style.position = this.originalContainerPosition;
        this.container.style.height = this.originalContainerHeight;
        if (!this.hadSmartGalleryClass) {
            this.container.classList.remove('smart-gallery');
        }
        if (this._options.className && !this.hadCustomClass) {
            this.container.classList.remove(this._options.className);
        }
    }
}

// Export as default for ESM
export default SmartGallery;
