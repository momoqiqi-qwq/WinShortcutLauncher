import { ColorClusterFrames } from '../ColorClusterFrames';
import type { ColorFrameCluster } from '../../lib/colorFrames';

/**
 * v156: 同色相邻项目成组框（内容区项目卡片专用）。
 *
 * v166 起实现搬到通用的 `ColorClusterFrames`（左侧子目录也要同一套画法），这里只固定内容区的参数：
 * 项目卡片 `.item-card[data-item-id]`、外扩 5px、网格不是滚动容器所以不夹边。
 */

interface ItemColorClusterFramesProps {
  clusters: ColorFrameCluster[];
  /** 内容区网格容器；框用它的 offsetLeft/offsetTop 定位。 */
  gridRef: { current: HTMLDivElement | null };
  /** 排序拖动中淡出，避免框停在旧位置。 */
  suppressed: boolean;
}

export function ItemColorClusterFrames({ clusters, gridRef, suppressed }: ItemColorClusterFramesProps) {
  return (
    <ColorClusterFrames
      clusters={clusters}
      containerRef={gridRef}
      itemSelector=".item-card[data-item-id]"
      dataKey="itemId"
      className="item-color-clusters"
      segmentClassName="item-color-cluster-segment"
      pad={5}
      suppressed={suppressed}
    />
  );
}
