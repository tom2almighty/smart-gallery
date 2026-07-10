import assert from 'node:assert/strict';
import test from 'node:test';

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    add(value) {
        this.values.add(value);
    }

    remove(value) {
        this.values.delete(value);
    }

    contains(value) {
        return this.values.has(value);
    }
}

class FakeElement {
    constructor(tagName = 'div') {
        this.nodeType = 1;
        this.tagName = tagName.toUpperCase();
        this.style = {};
        this.dataset = {};
        this.classList = new FakeClassList();
        this.children = [];
        this.listeners = new Map();
        this.parentElement = null;
        this.clientWidth = 800;
        this.clientHeight = 600;
        this.scrollHeight = 0;
        this.scrollTop = 0;
    }

    appendChild(child) {
        if (child.nodeType === 11) {
            for (const nested of [...child.children]) this.appendChild(nested);
            child.children = [];
            return child;
        }
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    replaceChildren(...children) {
        for (const child of this.children) child.parentElement = null;
        this.children = [];
        for (const child of children) this.appendChild(child);
    }

    addEventListener(type, callback) {
        this.listeners.set(type, callback);
    }

    removeEventListener(type) {
        this.listeners.delete(type);
    }

    setAttribute(name, value) {
        this[name] = value;
    }

    getBoundingClientRect() {
        return { top: 0, left: 0, width: this.clientWidth, height: this.clientHeight };
    }

    remove() {
        if (!this.parentElement) return;
        this.parentElement.children = this.parentElement.children.filter(child => child !== this);
        this.parentElement = null;
    }
}

class FakeFragment extends FakeElement {
    constructor() {
        super('fragment');
        this.nodeType = 11;
    }
}

const container = new FakeElement();
const fakeWindow = new FakeElement('window');
fakeWindow.scrollY = 0;
fakeWindow.innerHeight = 600;

globalThis.Node = { ELEMENT_NODE: 1 };
globalThis.window = fakeWindow;
globalThis.document = {
    querySelector: selector => selector === '#gallery' ? container : null,
    createElement: tagName => new FakeElement(tagName),
    createDocumentFragment: () => new FakeFragment()
};
globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
};
globalThis.requestAnimationFrame = callback => {
    callback();
    return 1;
};
globalThis.cancelAnimationFrame = () => {};
window.getComputedStyle = () => ({ overflowY: 'visible' });

const { default: SmartGallery } = await import('../src/index.js');

test('核心 API 完成数据管理、节点复用和生命周期清理', () => {
    let clickPayload;
    const gallery = new SmartGallery('#gallery', {
        virtualize: false,
        onItemClick: payload => {
            clickPayload = payload;
        }
    });

    gallery.setItems([
        { id: 'a', src: 'a.jpg', width: 400, height: 300 },
        { src: 'b.jpg', aspectRatio: 2 }
    ]);

    assert.equal(container.children.length, 2);
    assert.equal(gallery.getItems().length, 2);
    assert.match(String(gallery.getItems()[1].id), /^sg-/);

    const firstElement = container.children[0];
    gallery.setOptions({ layout: 'grid' });
    assert.equal(container.children[0], firstElement);
    assert.equal(gallery.getGeometry('a').width, 395);

    firstElement.listeners.get('click')({ type: 'click' });
    assert.equal(clickPayload.id, 'a');
    assert.deepEqual(clickPayload.geometry, gallery.getGeometry('a'));

    assert.equal(gallery.removeItem('missing'), false);
    assert.equal(gallery.removeItem('a'), true);
    assert.equal(gallery.getItem('a'), null);

    gallery.clear();
    assert.equal(container.children.length, 0);
    assert.equal(container.style.height, '0px');

    gallery.destroy();
    assert.equal(container.classList.contains('smart-gallery'), false);
    assert.throws(() => gallery.render(), /已销毁/);
});

test('默认渲染拒绝缺少 src 和重复 id 的数据', () => {
    const first = new SmartGallery(container, { virtualize: false });
    assert.throws(() => first.setItems([{ width: 10, height: 10 }]), /src/);
    assert.throws(
        () => first.setItems([
            { id: 1, src: 'a.jpg', aspectRatio: 1 },
            { id: 1, src: 'b.jpg', aspectRatio: 1 }
        ]),
        /重复/
    );
    first.destroy();
});
