# SmartGallery 2.0 API

## 创建实例

```js
import SmartGallery from 'smart-gallery';

const gallery = new SmartGallery('#gallery', {
  layout: 'justified',
  gap: 10,
  targetRowHeight: 300
});
```

容器可以是 CSS 选择器或 `HTMLElement`。选择器找不到元素时会抛出错误。

## 图片数据

```js
gallery.setItems([
  {
    id: 'photo-1',
    src: '/images/photo-1.jpg',
    width: 1600,
    height: 1200,
    alt: '图片说明'
  },
  {
    src: '/images/photo-2.jpg',
    aspectRatio: 1.5
  }
]);
```

- `id` 可以是字符串或数字；省略时由图库生成。
- 同一个图库内的 `id` 必须唯一。
- 尺寸可以传 `aspectRatio`，也可以传 `width` 和 `height`。
- 无法得到有效宽高比时按 `1:1` 布局。
- 业务需要的其他字段会原样保留，可供自定义渲染和灯箱使用。

## 配置

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `layout` | `'justified'` | `'justified'`、`'masonry'` 或 `'grid'` |
| `gap` | `10` | 图片间距，必须不小于 0 |
| `targetRowHeight` | `300` | Justified 目标行高 |
| `lastRowBehavior` | `'left'` | `'left'`、`'center'`、`'right'`、`'fill'` 或 `'hide'` |
| `columnWidth` | `300` | Masonry/Grid 自动分列时的目标列宽 |
| `columns` | `'auto'` | `'auto'` 或固定正整数列数 |
| `className` | `''` | 添加到容器的单个 CSS 类名 |
| `itemClassName` | `'sg-item'` | 图片外层元素的单个 CSS 类名 |
| `virtualize` | `true` | 是否只挂载可见区域附近的图片 |
| `buffer` | `500` | 可视区域上下额外挂载的像素范围 |
| `scrollContainer` | `'auto'` | `'auto'`、`window` 或明确的滚动元素 |
| `placeholderColor` | `'#eee'` | 默认占位背景色 |
| `renderItem` | `null` | 自定义内容函数 `(item, index) => Node` |
| `onItemClick` | `null` | 图片点击回调 |

运行时通过 `setOptions()` 修改配置，不要直接修改实例内部字段：

```js
gallery.setOptions({ layout: 'masonry', columnWidth: 260 });
```

## 数据方法

```js
gallery.setItems(items);       // 替换并重新布局
gallery.addItems(moreItems);   // 追加并重新布局
gallery.removeItem('photo-1'); // 按 id 删除，返回是否找到
gallery.clear();               // 清空图库

gallery.getItems();            // 返回完整数据副本
gallery.getItem('photo-2');    // 按 id 获取图片
gallery.getIndex('photo-2');   // 获取当前顺序，找不到返回 -1
gallery.getGeometry('photo-2');// 获取当前布局位置，未布局时返回 null
```

以上数据修改方法会自动重新布局。`render()` 仅用于外部样式变化后主动刷新。

组件卸载时必须清理实例：

```js
gallery.destroy();
```

## 灯箱集成

推荐使用编程式数据源，不要让灯箱扫描图库 DOM：

```js
const gallery = new SmartGallery('#gallery', {
  onItemClick: ({ id, index, item, element, geometry, originalEvent }) => {
    const lightboxItems = gallery.getItems().map((photo) => ({
      src: photo.originalSrc || photo.src,
      width: photo.originalWidth || photo.width,
      height: photo.originalHeight || photo.height
    }));

    openLightbox({ items: lightboxItems, index });
  }
});
```

开启虚拟滚动后，DOM 中只存在当前可视区域附近的元素，因此依赖“扫描所有 DOM 图片”的灯箱只能得到部分数据。`getItems()` 始终返回完整图片列表。

回调中的 `id` 是稳定标识，`index` 是图片当前所在位置。删除或替换数据后，应重新通过 `getIndex(id)` 获取位置。
