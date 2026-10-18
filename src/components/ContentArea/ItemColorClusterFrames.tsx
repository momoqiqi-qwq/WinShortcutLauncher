import { useLayoutEffect, useState, type CSSProperties } from 'react';
import type { ColorFrameCluster } from '../../lib/colorFrames';

/**
 * v156: 同色相邻项目成组框。
 *
 * 画法与 v138「同色相邻父目录自动成组框」完全一致：量出同组项目卡片覆盖的区域，
 * 在上面盖一个描边 + 发光的框。框本身 `pointer-events: none`，点击、右键、拖动全部照旧穿透到卡片；
 * 换行时按行拆成多段矩形，一组跨行也能分别框住。
 */

interface ClusterSegmentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 框比卡片外扩的像素：让描边落在卡片之间的缝隙里，不压住图标和文字。 */
const FRAME_PAD = 5;

interface ItemColorClusterFramesProps {
  clusters: ColorFrameCluster[];
  /** 内容区网格容器；框用它的 offsetLeft/offsetTop 定位。 */
  gridRef: { current: HTMLDivElement | null };
  /** 排序拖动中淡出，避免框停在旧位置。 */
  suppressed: boolean;
}

export function ItemColorClusterFrames({ clusters, gridRef, suppressed }: ItemColorClusterFramesProps) {
  const [segments, setSegments] = useState<Record<string, ClusterSegmentRect[]>>({});

  useLayoutEffect(() => {
    const node = gridRef.current;
    if (!node) return;

    function measure() {
      if (!clusters.length) {
        setSegments((current) => (Object.keys(current).length ? {} : current));
        return;
      }
      const cardById = new Map<string, HTMLElement>();
      node!.querySelectorAll<HTMLElement>('.item-card[data-item-id]').forEach((card) => {
        const id = card.dataset.itemId;
        if (id) cardById.set(id, card);
      });

      const next: Record<string, ClusterSegmentRect[]> = {};
      for (const cluster of clusters) {
        // 按 offsetTop 分行：同一组的项目被挤到下一行时，会拆成两条独立的框段。
        const rows = new Map<number, ClusterSegmentRect>();
        for (const itemId of cluster.itemIds) {
          const card = cardById.get(itemId);
          if (!card) continue;
          const row = rows.get(card.offsetTop);
          if (!row) {
            rows.set(card.offsetTop, {
              left: card.offsetLeft,
              top: card.offsetTop,
              width: card.offsetWidth,
              height: card.offsetHeight,
            });
            continue;
          }
          const right = Math.max(row.left + row.width, card.offsetLeft + card.offsetWidth);
          row.left = Math.min(row.left, card.offsetLeft);
          row.width = right - row.left;
          row.height = Math.max(row.height, card.offsetHeight);
        }
        next[cluster.id] = Array.from(rows.values()).sort((a, b) => a.top - b.top);
      }
      setSegments((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    node.querySelectorAll('.item-card').forEach((card) => observer.observe(card));
    // 首帧字体/图标尺寸可能还没稳定，补一次测量。
    const id = window.setTimeout(measure, 0);
    return () => {
      window.clearTimeout(id);
      observer.disconnect();
    };
  }, [clusters, gridRef]);

  const entries = clusters.flatMap((cluster) => (segments[cluster.id] ?? []).map((segment) => ({ cluster, segment })));
  if (!entries.length) return null;

  return (
    <div className={`item-color-clusters ${suppressed ? 'suppressed' : ''}`} aria-hidden="true">
      {entries.map(({ cluster, segment }) => (
        <div
          key={`${cluster.id}-${segment.top}-${segment.left}`}
          className="item-color-cluster-segment"
          style={{
            left: segment.left - FRAME_PAD,
            top: segment.top - FRAME_PAD,
            width: segment.width + FRAME_PAD * 2,
            height: segment.height + FRAME_PAD * 2,
            '--cluster-accent': cluster.color,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}
