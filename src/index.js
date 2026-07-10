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
    renderItem: null,
    onItemClick: null
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
    for (const callbackName of ['renderItem', 'onItemClick']) {
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

        this.options = normalizeOptions(options);

        this.items = [];
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
        this.hadCustomClass = this.options.className
            ? this.container.classList.contains(this.options.className)
            : false;

        this._init();
    }

    _init() {
        this.container.style.position = 'relative';
        this.container.classList.add('smart-gallery');
        if (this.options.className) {
            this.container.classList.add(this.options.className);
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
        if (this.options.virtualize) {
            this.scrollContainer = this.options.scrollContainer === 'auto'
                ? this._getScrollParent(this.container)
                : this.options.scrollContainer;
            this.scrollHandler = this._throttle(this._handleScroll.bind(this), 50);
            this.scrollContainer.addEventListener('scroll', this.scrollHandler, { passive: true });
        }
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

    addItems(items) {
        if (!Array.isArray(items)) {
            throw new TypeError('SmartGallery: addItems(items) 的 items 必须是数组。');
        }

        // Normalize items: calculate aspectRatio if not provided or invalid
        const newItems = items.map((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                throw new TypeError(`SmartGallery: items[${index}] 必须是对象。`);
            }

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

            return { ...item, aspectRatio };
        });
        this.items = [...this.items, ...newItems];
    }

    render() {
        if (this.isDestroyed) {
            throw new Error('SmartGallery: 实例已销毁，不能继续渲染。');
        }
        if (this.items.length === 0) {
            this._resetRenderedState();
            this.container.style.height = '0px';
            return;
        }
        this.isResizing = true;

        try {
            this.options = normalizeOptions(this.options);
            const containerWidth = this.container.clientWidth;
            if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
                this._resetRenderedState();
                this.container.style.height = '0px';
                return;
            }
            this.lastObservedWidth = containerWidth;
            const { layout } = this.options;
            let containerHeight = 0;

            this._resetRenderedState();

            let result;
            if (layout === 'justified') {
                result = this._computeJustifiedLayout(this.items, containerWidth, this.options);
            } else if (layout === 'masonry') {
                result = this._computeMasonryLayout(this.items, containerWidth, this.options);
            } else if (layout === 'grid') {
                result = this._computeGridLayout(this.items, containerWidth, this.options);
            }

            this.geometry = result.boxes.map((box, i) => ({ ...box, itemIndex: i })); // Store index
            containerHeight = result.containerHeight;
            this._buildVisibleIndex();

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
        this.topSortedGeometryIndices = [];
        this.topSortedStarts = [];
        this.maxGeometryHeight = 0;
        this.currentVisibleStartPos = -1;
        this.currentVisibleEndPos = -1;
        this.geometry = [];
        this.container.replaceChildren();
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
        if (!this.options.virtualize) {
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

        const buffer = this.options.buffer;
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
        const itemData = this.items[index];
        const div = document.createElement('div');
        div.className = this.options.itemClassName;
        div.id = `sg-item-${index}`; // Keep id convention for compatibility/debugging
        div.style.position = 'absolute';
        div.style.left = `${box.left}px`;
        div.style.top = `${box.top}px`;
        div.style.width = `${box.width}px`;
        div.style.height = `${box.height}px`;

        // Render content
        if (this.options.renderItem) {
            div.appendChild(this.options.renderItem(itemData, index));
        } else {
            // Default render with placeholder support
            div.style.backgroundColor = itemData.placeholderColor || this.options.placeholderColor;

            const img = document.createElement('img');
            img.src = itemData.src;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.display = 'block';
            img.style.opacity = '0'; // Start invisible
            img.style.transition = 'opacity 0.3s';
            img.loading = 'lazy'; // Native lazy load

            img.onload = () => {
                img.style.opacity = '1';
            };

            div.appendChild(img);
        }

        // Click event
        div.addEventListener('click', (event) => {
            if (this.options.onItemClick) {
                this.options.onItemClick({ index, itemData, originalEvent: event });
            }
        });

        parentNode.appendChild(div);
        this.mountedItemElements.set(index, div);
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

    _applyPixelAlignment(boxes) {
        for (let i = 0; i < boxes.length; i++) {
            const box = boxes[i];
            box.left = Math.round(box.left);
            box.top = Math.round(box.top);
            box.width = Math.max(1, Math.round(box.width));
            box.height = Math.max(1, Math.round(box.height));
        }
    }

    /**
     * Enhanced Justified Layout Algorithm (Knuth-Plass simplified)
     * Reduces jaggedness by looking ahead at next rows.
     */
    _computeJustifiedLayout(items, containerWidth, options) {
        const { targetRowHeight, gap, lastRowBehavior } = options;
        const boxes = [];
        let top = 0;
        const minRowHeight = targetRowHeight * 0.5;

        // Convert items to aspect ratios
        const aspectRatios = items.map(item => item.aspectRatio);
        const rowHeightCache = new Map();

        const getRowHeight = (from, to, aspectSum) => {
            const count = to - from + 1;
            const cacheKey = `${from}-${to}`;
            let cached = rowHeightCache.get(cacheKey);
            if (cached !== undefined) return cached;

            const totalGap = (count - 1) * gap;
            const availableWidth = containerWidth - totalGap;
            cached = availableWidth / aspectSum;
            rowHeightCache.set(cacheKey, cached);
            return cached;
        };

        // Dynamic Programming approach or Greedy with Lookahead?
        // True optimal is O(N^2) or O(N) with constraints. 
        // For performance (thousands of items), we stick to a linear scan but "buffer" items.
        // Let's implement a standard "Knuth-Plass" like line breaker with limited lookahead/nodes.
        // Actually, simple greedy is usually O(N), "balanced" is slightly more complex.
        // Let's implement a "Minimum Raggedness" algorithm.
        
        // Since full Knuth-Plass is complex, we use a simpler heuristic:
        // Accumulate items. If adding next item makes deviation worse, break.
        // AND, if multiple options are close, choose one that leaves good start for next row? 
        // That's too complex for JS single thread if N is large.
        
        // Optimized Greedy:
        // Standard greedy adds items until height < target. 
        // But sometimes adding one more item (making height < target) is better than stopping early (height > target).
        // We compare |h1 - target| vs |h2 - target|.
        
        let i = 0;
        while (i < items.length) {
            let currentAspect = 0;
            let bestBreakIndex = -1;
            let bestAspect = 0;
            let minScore = Infinity;
            
            // Try adding items one by one
            let j = i;
            while (j < items.length) {
                currentAspect += aspectRatios[j];
                const rowHeight = getRowHeight(i, j, currentAspect);
                
                // Score = deviation from target height
                // If rowHeight becomes too small (e.g. < 0.5 * target), stop looking further (it will only get smaller)
                if (rowHeight < minRowHeight) break;

                const score = Math.abs(rowHeight - targetRowHeight);
                
                // Track best break point for this start position
                if (score < minScore) {
                    minScore = score;
                    bestBreakIndex = j;
                    bestAspect = currentAspect;
                }
                
                // Optimization: if rowHeight is already smaller than target, adding more will make it smaller (worse usually, unless we want small rows)
                // But sometimes being slightly smaller is better than being huge.
                // We continue a bit more.
                
                j++;
            }
            
            // If valid break found
            if (bestBreakIndex !== -1) {
                // Check if last row and behavior
                const isLastRow = bestBreakIndex === items.length - 1;
                 
                // Recalculate final metrics for this row
                let finalRowHeight = 0;
                let finalRowItemsCount = bestBreakIndex - i + 1;
                const finalAspect = bestAspect;
                const totalGap = (finalRowItemsCount - 1) * gap;
                finalRowHeight = getRowHeight(i, bestBreakIndex, finalAspect);

                // Handle last row specific behavior
                let offsetX = 0;
                
                if (isLastRow) {
                     const behavior = lastRowBehavior;
                     
                     if (behavior === 'hide') {
                         break;
                     } 
                     
                     if (behavior === 'left' || behavior === 'center' || behavior === 'right') {
                         // Keep a target-like height, but never allow total row width to exceed container.
                         const maxRowHeightToFit = (containerWidth - totalGap) / finalAspect;
                         finalRowHeight = Math.min(targetRowHeight, maxRowHeightToFit);
                         
                         // Calculate used width to find offset
                         // Width = (AspectRatio * Height) ... sum of all
                         const usedWidth = finalAspect * finalRowHeight + totalGap;
                         const remainingSpace = Math.max(0, containerWidth - usedWidth);
                         
                         if (behavior === 'center') {
                             offsetX = remainingSpace / 2;
                         } else if (behavior === 'right') {
                             offsetX = remainingSpace;
                         }
                     }
                     // 'fill' or 'justify' does nothing (keeps stretched height)
                }
                
                // Create boxes
                let left = offsetX;
                for (let k = i; k <= bestBreakIndex; k++) {
                    const w = finalRowHeight * aspectRatios[k];
                    boxes.push({
                        left: left,
                        top: top,
                        width: w,
                        height: finalRowHeight
                    });
                    left += w + gap;
                }
                
                top += finalRowHeight + gap;
                i = bestBreakIndex + 1;
            } else {
                // Should not happen if at least one item fits?
                // Force at least one item
                const fallbackHeight = Math.min(targetRowHeight, containerWidth / aspectRatios[i]);
                const w = fallbackHeight * aspectRatios[i];
                 boxes.push({
                        left: 0, top: top, width: w, height: fallbackHeight
                });
                top += fallbackHeight + gap;
                i++;
            }
        }

        this._applyPixelAlignment(boxes);
        return { boxes, containerHeight: Math.max(0, boxes.length > 0 ? top - gap : 0) };
    }

    _getColumnMetrics(containerWidth, options) {
        const { gap, columnWidth, columns } = options;
        let colCount = 0;
        let colW = 0;

        if (columns === 'auto') {
            colW = columnWidth;
            colCount = Math.floor((containerWidth + gap) / (colW + gap));
            colCount = Math.max(1, colCount);
            colW = (containerWidth - (colCount - 1) * gap) / colCount;
        } else {
            colCount = columns;
            colW = (containerWidth - (colCount - 1) * gap) / colCount;
        }

        return { gap, colCount, colW };
    }

    _heapLess(a, b) {
        if (a.height !== b.height) return a.height < b.height;
        return a.colIndex < b.colIndex;
    }

    _heapPush(heap, node) {
        heap.push(node);
        let i = heap.length - 1;

        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (!this._heapLess(heap[i], heap[parent])) break;
            [heap[i], heap[parent]] = [heap[parent], heap[i]];
            i = parent;
        }
    }

    _heapPop(heap) {
        if (heap.length === 1) return heap.pop();
        const root = heap[0];
        heap[0] = heap.pop();

        let i = 0;
        while (true) {
            const left = i * 2 + 1;
            const right = left + 1;
            let smallest = i;

            if (left < heap.length && this._heapLess(heap[left], heap[smallest])) {
                smallest = left;
            }
            if (right < heap.length && this._heapLess(heap[right], heap[smallest])) {
                smallest = right;
            }
            if (smallest === i) break;

            [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
            i = smallest;
        }

        return root;
    }

    /**
     * Masonry Layout Algorithm (Pinterest-style)
     */
    _computeMasonryLayout(items, containerWidth, options) {
        const { gap, colCount, colW } = this._getColumnMetrics(containerWidth, options);

        const boxes = [];
        const heap = [];
        for (let c = 0; c < colCount; c++) {
            this._heapPush(heap, { colIndex: c, height: 0 });
        }

        let maxHeight = 0;

        for (let i = 0; i < items.length; i++) {
            const minCol = this._heapPop(heap);
            const colIndex = minCol.colIndex;
            const minH = minCol.height;
            const h = colW / items[i].aspectRatio;

            boxes.push({
                left: colIndex * (colW + gap),
                top: minH,
                width: colW,
                height: h
            });

            const nextHeight = minH + h + gap;
            if (nextHeight > maxHeight) maxHeight = nextHeight;
            this._heapPush(heap, { colIndex, height: nextHeight });
        }

        this._applyPixelAlignment(boxes);
        return { boxes, containerHeight: Math.max(0, boxes.length > 0 ? maxHeight - gap : 0) };
    }

    /**
     * Grid Layout Algorithm (Fixed grid)
     */
    _computeGridLayout(items, containerWidth, options) {
        const { gap, colCount, colW } = this._getColumnMetrics(containerWidth, options);
        
        // Assume square grid for stability
        const itemH = colW; 

        const boxes = [];
        for (let i = 0; i < items.length; i++) {
            const colIndex = i % colCount;
            const rowIndex = Math.floor(i / colCount);

            boxes.push({
                left: colIndex * (colW + gap),
                top: rowIndex * (itemH + gap),
                width: colW,
                height: itemH
            });
        }

        const rows = Math.ceil(items.length / colCount);
        this._applyPixelAlignment(boxes);
        return { boxes, containerHeight: rows * (itemH + gap) - gap }; // remove last gap
    }

    destroy() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.scrollHandler && this.scrollContainer) {
            this.scrollContainer.removeEventListener('scroll', this.scrollHandler);
        }
        clearTimeout(this.resizeTimer);
        this.resizeTimer = null;
        if (this.scrollHandler && this.scrollHandler.cancel) {
            this.scrollHandler.cancel();
        }
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
        if (this.options.className && !this.hadCustomClass) {
            this.container.classList.remove(this.options.className);
        }
    }
}

// Export as default for ESM
export default SmartGallery;
