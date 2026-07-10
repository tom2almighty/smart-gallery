function alignBoxes(boxes) {
    let maxBottom = 0;
    for (const box of boxes) {
        const left = Math.round(box.left);
        const top = Math.round(box.top);
        const right = Math.round(box.left + box.width);
        const bottom = Math.round(box.top + box.height);
        box.left = left;
        box.top = top;
        box.width = Math.max(1, right - left);
        box.height = Math.max(1, bottom - top);
        maxBottom = Math.max(maxBottom, top + box.height);
    }
    return maxBottom;
}

function getColumnMetrics(containerWidth, { gap, columnWidth, columns }) {
    let colCount = columns;
    let colW;

    if (columns === 'auto') {
        colCount = Math.max(1, Math.floor((containerWidth + gap) / (columnWidth + gap)));
    }
    colW = (containerWidth - (colCount - 1) * gap) / colCount;
    return { gap, colCount, colW };
}

function heapLess(a, b) {
    return a.height === b.height ? a.colIndex < b.colIndex : a.height < b.height;
}

function heapPush(heap, node) {
    heap.push(node);
    let index = heap.length - 1;
    while (index > 0) {
        const parent = (index - 1) >> 1;
        if (!heapLess(heap[index], heap[parent])) break;
        [heap[index], heap[parent]] = [heap[parent], heap[index]];
        index = parent;
    }
}

function heapPop(heap) {
    if (heap.length === 1) return heap.pop();
    const root = heap[0];
    heap[0] = heap.pop();

    let index = 0;
    while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < heap.length && heapLess(heap[left], heap[smallest])) smallest = left;
        if (right < heap.length && heapLess(heap[right], heap[smallest])) smallest = right;
        if (smallest === index) break;
        [heap[index], heap[smallest]] = [heap[smallest], heap[index]];
        index = smallest;
    }
    return root;
}

/** 使用局部最优行高的贪心策略生成 Justified 布局。 */
export function computeJustifiedLayout(items, containerWidth, options) {
    const { targetRowHeight, gap, lastRowBehavior } = options;
    const boxes = [];
    const aspectRatios = items.map(item => item.aspectRatio);
    const minRowHeight = targetRowHeight * 0.5;
    let top = 0;
    let start = 0;

    const rowHeight = (from, to, aspectSum) => {
        const totalGap = (to - from) * gap;
        return (containerWidth - totalGap) / aspectSum;
    };

    while (start < items.length) {
        let aspectSum = 0;
        let bestEnd = -1;
        let bestAspectSum = 0;
        let bestScore = Infinity;

        for (let end = start; end < items.length; end++) {
            aspectSum += aspectRatios[end];
            const height = rowHeight(start, end, aspectSum);
            if (height < minRowHeight) break;
            const score = Math.abs(height - targetRowHeight);
            if (score < bestScore) {
                bestScore = score;
                bestEnd = end;
                bestAspectSum = aspectSum;
            }
        }

        if (bestEnd === -1) {
            const height = Math.min(targetRowHeight, containerWidth / aspectRatios[start]);
            boxes.push({ left: 0, top, width: height * aspectRatios[start], height });
            top += height + gap;
            start++;
            continue;
        }

        const isLastRow = bestEnd === items.length - 1;
        const itemCount = bestEnd - start + 1;
        const totalGap = (itemCount - 1) * gap;
        let height = rowHeight(start, bestEnd, bestAspectSum);
        let offsetX = 0;

        if (isLastRow && lastRowBehavior === 'hide') break;
        if (isLastRow && ['left', 'center', 'right'].includes(lastRowBehavior)) {
            height = Math.min(targetRowHeight, (containerWidth - totalGap) / bestAspectSum);
            const remaining = Math.max(0, containerWidth - bestAspectSum * height - totalGap);
            if (lastRowBehavior === 'center') offsetX = remaining / 2;
            if (lastRowBehavior === 'right') offsetX = remaining;
        }

        let left = offsetX;
        for (let index = start; index <= bestEnd; index++) {
            const width = height * aspectRatios[index];
            boxes.push({ left, top, width, height });
            left += width + gap;
        }
        top += height + gap;
        start = bestEnd + 1;
    }

    return { boxes, containerHeight: alignBoxes(boxes) };
}

export function computeMasonryLayout(items, containerWidth, options) {
    const { gap, colCount, colW } = getColumnMetrics(containerWidth, options);
    const boxes = [];
    const heap = [];
    for (let column = 0; column < colCount; column++) {
        heapPush(heap, { colIndex: column, height: 0 });
    }

    for (const item of items) {
        const column = heapPop(heap);
        const height = colW / item.aspectRatio;
        boxes.push({
            left: column.colIndex * (colW + gap),
            top: column.height,
            width: colW,
            height
        });
        heapPush(heap, { colIndex: column.colIndex, height: column.height + height + gap });
    }
    return { boxes, containerHeight: alignBoxes(boxes) };
}

export function computeGridLayout(items, containerWidth, options) {
    const { gap, colCount, colW } = getColumnMetrics(containerWidth, options);
    const boxes = items.map((item, index) => {
        const column = index % colCount;
        const row = Math.floor(index / colCount);
        return {
            left: column * (colW + gap),
            top: row * (colW + gap),
            width: colW,
            height: colW
        };
    });
    return { boxes, containerHeight: alignBoxes(boxes) };
}
