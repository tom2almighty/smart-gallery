# SmartGallery 2.0 迁移指南

2.0 不保留 1.x 的内部字段和构建文件名。升级前请一次性完成以下调整。

## 包入口与浏览器文件

ES Module 的包名导入方式不变：

```js
import SmartGallery from 'smart-gallery';
```

直接引用构建文件时需要更换名称：

| 1.x | 2.0 |
| --- | --- |
| `dist/smart-gallery.esm.min.js` | `dist/smart-gallery.esm.js` |
| `dist/smart-gallery.cjs.min.js` | `dist/smart-gallery.cjs` |
| `dist/smart-gallery.min.js` | `dist/smart-gallery.umd.js` |

CommonJS 入口现在使用真正的 `.cjs` 扩展名，可以继续通过包名加载：

```js
const SmartGallery = require('smart-gallery');
```

## 不再直接访问 items 和 options

1.x：

```js
gallery.items;
gallery.options.layout = 'masonry';
gallery.render();
```

2.0：

```js
const items = gallery.getItems();
gallery.setOptions({ layout: 'masonry' });
```

使用以下方法管理数据：

```js
gallery.setItems(items);
gallery.addItems(moreItems);
gallery.removeItem(id);
gallery.clear();
gallery.getItems();
gallery.getItem(id);
gallery.getIndex(id);
gallery.getGeometry(id);
```

`setItems()`、`addItems()`、`removeItem()`、`clear()` 和 `setOptions()` 都会自动重新布局，不需要紧接着调用 `render()`。

## 图片 ID

每张图片现在都有字符串或数字类型的唯一 `id`。可以主动提供：

```js
gallery.setItems([
  { id: 'cover', src: '/cover.jpg', width: 1600, height: 900 }
]);
```

省略 `id` 时图库会生成。重复 ID 或其他类型的 ID 会直接抛出错误。

`getItem()`、`getGeometry()` 和 `removeItem()` 均按 `id` 操作，不再按数组下标操作。数组位置通过 `getIndex(id)` 获取。

## 灯箱点击回调

1.x：

```js
onItemClick: ({ index, itemData, originalEvent }) => {}
```

2.0：

```js
onItemClick: ({
  id,
  index,
  item,
  element,
  geometry,
  originalEvent
}) => {}
```

其中 `id` 是稳定标识，`index` 是当前数组位置。灯箱完整数据源通过 `gallery.getItems()` 获取。

虚拟滚动开启时，DOM 中只有可视区域附近的图片。不要再通过扫描图库 DOM 建立灯箱数据源。

## 默认渲染要求 src

不使用 `renderItem` 时，每项必须提供非空 `src`：

```js
gallery.setItems([
  { src: '/photo.jpg', aspectRatio: 1.5 }
]);
```

自定义渲染可以使用不含 `src` 的业务数据，但 `renderItem` 必须返回 DOM `Node`：

```js
const gallery = new SmartGallery('#gallery', {
  renderItem(item) {
    const canvas = document.createElement('canvas');
    drawItem(canvas, item);
    return canvas;
  }
});
```

## 图片加载与键盘操作

默认渲染现在支持 `alt`、`title`、`srcset` 和 `sizes`。新增两个图片状态回调：

```js
new SmartGallery('#gallery', {
  errorClassName: 'sg-item-error',
  onImageLoad({ id, image }) {},
  onImageError({ id, image }) {}
});
```

配置了 `onItemClick` 的图片可以通过 Tab 聚焦，并使用 Enter 或空格触发。

## 销毁

组件卸载时继续调用：

```js
gallery.destroy();
```

2.0 会同时清理观察器、滚动监听、定时器、动画帧、挂载节点及图库添加的容器样式。销毁后的实例不能再次使用。
