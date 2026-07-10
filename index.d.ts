export type GalleryLayout = 'justified' | 'masonry' | 'grid';
export type LastRowBehavior = 'left' | 'center' | 'right' | 'fill' | 'hide';
export type GalleryItemId = string | number;

export interface GalleryItemInput {
  id?: GalleryItemId;
  src?: string;
  width?: number;
  height?: number;
  aspectRatio?: number;
  placeholderColor?: string;
  alt?: string;
  title?: string;
  srcset?: string;
  sizes?: string;
  [key: string]: unknown;
}

export interface GalleryItem extends GalleryItemInput {
  id: GalleryItemId;
  aspectRatio: number;
}

export interface GalleryGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  itemIndex: number;
}

export interface ItemClickPayload {
  id: GalleryItemId;
  index: number;
  item: GalleryItem;
  element: HTMLDivElement;
  geometry: GalleryGeometry;
  originalEvent: MouseEvent | KeyboardEvent;
}

export interface ImageEventPayload {
  id: GalleryItemId;
  index: number;
  item: GalleryItem;
  image: HTMLImageElement;
  element: HTMLDivElement;
  originalEvent: Event;
}

export interface SmartGalleryOptions {
  layout?: GalleryLayout;
  gap?: number;
  targetRowHeight?: number;
  lastRowBehavior?: LastRowBehavior;
  columnWidth?: number;
  columns?: 'auto' | number;
  className?: string;
  itemClassName?: string;
  virtualize?: boolean;
  buffer?: number;
  scrollContainer?: 'auto' | Window | HTMLElement;
  placeholderColor?: string;
  errorClassName?: string;
  renderItem?: ((item: GalleryItem, index: number) => Node) | null;
  onItemClick?: ((payload: ItemClickPayload) => void) | null;
  onImageLoad?: ((payload: ImageEventPayload) => void) | null;
  onImageError?: ((payload: ImageEventPayload) => void) | null;
}

export default class SmartGallery {
  constructor(container: string | HTMLElement, options?: SmartGalleryOptions);

  setItems(items: GalleryItemInput[]): this;
  addItems(items: GalleryItemInput[]): this;
  removeItem(id: GalleryItemId): boolean;
  clear(): this;
  setOptions(options: Partial<SmartGalleryOptions>): this;
  getItems(): GalleryItem[];
  getIndex(id: GalleryItemId): number;
  getItem(id: GalleryItemId): GalleryItem | null;
  getGeometry(id: GalleryItemId): GalleryGeometry | null;
  render(): void;
  destroy(): void;
}
