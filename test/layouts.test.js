import assert from 'node:assert/strict';
import test from 'node:test';

import {
    computeGridLayout,
    computeJustifiedLayout,
    computeMasonryLayout
} from '../src/layouts.js';

const items = (...aspectRatios) => aspectRatios.map(aspectRatio => ({ aspectRatio }));

const baseOptions = {
    gap: 10,
    columnWidth: 200,
    columns: 'auto',
    targetRowHeight: 200,
    lastRowBehavior: 'left'
};

function assertValidLayout(result, containerWidth, expectedCount) {
    assert.equal(result.boxes.length, expectedCount);
    assert.ok(Number.isFinite(result.containerHeight));
    assert.ok(result.containerHeight >= 0);

    for (const box of result.boxes) {
        for (const value of [box.left, box.top, box.width, box.height]) {
            assert.ok(Number.isFinite(value));
        }
        assert.ok(box.left >= 0);
        assert.ok(box.top >= 0);
        assert.ok(box.width > 0);
        assert.ok(box.height > 0);
        assert.ok(box.left + box.width <= containerWidth);
        assert.ok(box.top + box.height <= result.containerHeight);
    }
}

test('空数据返回高度为 0 的空布局', () => {
    for (const compute of [computeJustifiedLayout, computeMasonryLayout, computeGridLayout]) {
        assert.deepEqual(compute([], 800, baseOptions), { boxes: [], containerHeight: 0 });
    }
});

test('Justified 布局生成有效像素盒子并铺满完整行', () => {
    const result = computeJustifiedLayout(items(1, 1, 1, 1, 1), 500, baseOptions);
    assertValidLayout(result, 500, 5);
    assert.equal(result.boxes[2].left + result.boxes[2].width, 500);
});

test('Justified 最后一行支持左中右、填充和隐藏', () => {
    const input = items(1, 1, 1, 1, 1);
    const compute = lastRowBehavior => computeJustifiedLayout(
        input,
        500,
        { ...baseOptions, lastRowBehavior }
    );

    assert.equal(compute('left').boxes[3].left, 0);
    assert.equal(compute('center').boxes[3].left, 45);
    assert.equal(compute('right').boxes[3].left, 90);
    assert.ok(compute('fill').boxes[3].height > compute('left').boxes[3].height);
    assert.equal(compute('hide').boxes.length, 3);
});

test('Masonry 始终把下一项放入当前最短列', () => {
    const result = computeMasonryLayout(
        items(1, 2, 1),
        410,
        { ...baseOptions, columns: 2 }
    );
    assertValidLayout(result, 410, 3);
    assert.deepEqual(result.boxes[2], {
        left: 210,
        top: 110,
        width: 200,
        height: 200
    });
});

test('Grid 按固定列数生成方形网格', () => {
    const result = computeGridLayout(items(2, 0.5, 3), 410, {
        ...baseOptions,
        columns: 2
    });
    assertValidLayout(result, 410, 3);
    assert.deepEqual(result.boxes[2], {
        left: 0,
        top: 210,
        width: 200,
        height: 200
    });
});

test('固定列数在极窄容器中仍保持正尺寸且不溢出', () => {
    const result = computeGridLayout(items(1, 1, 1), 10, {
        ...baseOptions,
        gap: 10,
        columns: 3
    });
    assertValidLayout(result, 10, 3);
    assert.equal(result.boxes[0].width, 1);
    assert.equal(result.boxes[2].left + result.boxes[2].width, 10);
});

test('极端宽高比仍生成有限的正尺寸', () => {
    const input = items(0.001, 1000, 0.01, 100);
    for (const compute of [computeJustifiedLayout, computeMasonryLayout, computeGridLayout]) {
        assertValidLayout(compute(input, 800, baseOptions), 800, input.length);
    }
});
