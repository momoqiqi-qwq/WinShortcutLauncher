import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import type { ColorFrameCluster } from '../lib/colorFrames';

/**
 * v166: 通用的「同色相邻成组框」。
 *
 * 原本只服务于内容区的项目卡片（v156 `ItemColorClusterFrames`），左侧子目录也要同一套画法，
 * 于是把它抽成这个与具体元素无关的组件：给什么选择器、读哪个 data id、用哪套 class 都由调用方决定。
 *
 * 画法（与 v138「同色相邻父目录」成组框一致）：量出同组元素覆盖的区域，在上面盖一个描边 + 发光的框。
 * 框本身 `pointer-events: none`，点击、右键、拖动全部照旧穿透到下面的元素；
 * 换行（布局挤到下一行）时按行拆成多段矩形，一组跨行也能分别框住。
 */

interface ClusterSegmentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ColorClusterFramesProps {
  clusters: ColorFrameCluster[];
  /** 定位父级（必须 `position: relative`）；框用子元素的 offsetLeft/offsetTop 定位。 */
  containerRef: RefObject<HTMLElement | null>;
  /** 参与成组的元素选择器，例如 `.item-card[data-item-id]`。 */
  itemSelector: string;
  /** 从哪个 data 属性读 id（camelCase，例如 `itemId` 对应 `data-item-id`）。 */
  dataKey: string;
  /** 覆盖层根 class。 */
  className: string;
  /** 每一段框的 class。 */
  segmentClassName: string;
  /** 框比元素外扩的像素，让描边落进元素之间的缝隙；默认 5。 */
  pad?: number;
  /**
   * 把框夹在容器可视区内（默认 false）。
   * 容器自己是滚动容器时（子目录侧栏 `.sidebar-tabs` 是 `overflow: auto`）必须开，
   * 否则左上第一条框会因为负偏移被裁掉一半。
   */
  clampInside?: boolean;
  /** 排序拖动中淡出，避免框停在旧位置。 */
  suppressed?: boolean;
}

export function ColorClusterFrames({
  clusters,
  containerRef,
  itemSelector,
  dataKey,
  className,
  segmentClassName,
  pad = 5,
  clampInside = false,
  suppressed = false,
}: ColorClusterFramesProps) {
  const [segments, setSegments] = useState<Record<string, ClusterSegmentRect[]>>({});

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    function measure() {
      if (!clusters.length) {
        setSegments((current) => (Object.keys(current).length ? {} : current));
        return;
      }
      const elementById = new Map<string, HTMLElement>();
      node!.querySelectorAll<HTMLElement>(itemSelector).forEach((element) => {
        const id = element.dataset[dataKey];
        if (id) elementById.set(id, element);
      });

      // 外扩 pad 后夹进容器：只夹左上（右上/下溢出属于滚动内容，裁掉才是对的）。
      const frameRect = (element: HTMLElement): ClusterSegmentRect => {
        const left = clampInside ? Math.max(0, element.offsetLeft - pad) : element.offsetLeft - pad;
        const top = clampInside ? Math.max(0, element.offsetTop - pad) : element.offsetTop - pad;
        return {
          left,
          top,
          width: element.offsetLeft + element.offsetWidth + pad - left,
          height: element.offsetTop + element.offsetHeight + pad - top,
        };
      };

      const next: Record<string, ClusterSegmentRect[]> = {};
      for (const cluster of clusters) {
        // 按 offsetTop 分行：同一组的元素被挤到下一行时，会拆成两条独立的框段。
        const rows = new Map<number, ClusterSegmentRect>();
        for (const clusterItemId of cluster.itemIds) {
          const element = elementById.get(clusterItemId);
          if (!element) continue;
          const rect = frameRect(element);
          const row = rows.get(element.offsetTop);
          if (!row) {
            rows.set(element.offsetTop, rect);
            continue;
          }
          const right = Math.max(row.left + row.width, rect.left + rect.width);
          const bottom = Math.max(row.top + row.height, rect.top + rect.height);
          row.left = Math.min(row.left, rect.left);
          row.top = Math.min(row.top, rect.top);
          row.width = right - row.left;
          row.height = bottom - row.top;
        }
        next[cluster.id] = Array.from(rows.values()).sort((a, b) => a.top - b.top);
      }
      setSegments((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    node.querySelectorAll(itemSelector).forEach((element) => observer.observe(element));
    // 首帧字体/图标尺寸可能还没稳定，补一次测量。
    const id = window.setTimeout(measure, 0);
    return () => {
      window.clearTimeout(id);
      observer.disconnect();
    };
  }, [clusters, containerRef, itemSelector, dataKey, pad, clampInside]);

  const entries = clusters.flatMap((cluster) => (segments[cluster.id] ?? []).map((segment) => ({ cluster, segment })));
  if (!entries.length) return null;

  return (
    <div className={`${className} ${suppressed ? 'suppressed' : ''}`} aria-hidden="true">
      {entries.map(({ cluster, segment }) => (
        <div
          key={`${cluster.id}-${segment.top}-${segment.left}`}
          className={segmentClassName}
          style={{
            left: segment.left,
            top: segment.top,
            width: segment.width,
            height: segment.height,
            '--cluster-accent': cluster.color,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}
