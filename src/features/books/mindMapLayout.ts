import type { MindMap } from './schema';

/**
 * A two-sided mind map layout: the center sits in the middle, top-level
 * branches alternate right and left to balance height, and each subtree is
 * stacked vertically around its parent. Text wrapping is estimated from
 * character counts so the layout stays a pure function.
 */

export interface MapNode {
  id: string;
  label: string;
  note?: string;
  depth: number;
  branch: number;
  children: MapNode[];
}

export interface PlacedNode {
  id: string;
  label: string;
  note?: string;
  lines: string[];
  depth: number;
  branch: number;
  side: 1 | -1;
  x: number; // left edge
  y: number; // top edge
  w: number;
  h: number;
  childCount: number;
  collapsed: boolean;
}

export interface PlacedLink {
  id: string;
  branch: number;
  d: string;
  depth: number;
}

export interface MapLayout {
  nodes: PlacedNode[];
  links: PlacedLink[];
  minX: number;
  minY: number;
  width: number;
  height: number;
}

const WIDTH = [230, 200, 190, 170];
const CHAR_W = [8.4, 7.4, 7, 6.7];
const LINE_H = [20, 18, 17, 16];
const PAD_Y = 12;
const COL_GAP = 56;
const ROW_GAP = 12;
const BRANCH_GAP = 28;

export function toTree(map: MindMap): MapNode {
  return {
    id: 'c',
    label: map.center,
    depth: 0,
    branch: -1,
    children: map.branches.map((b, bi) => ({
      id: `b${bi}`,
      label: b.label,
      note: b.note,
      depth: 1,
      branch: bi,
      children: b.children.map((c, ci) => ({
        id: `b${bi}.${ci}`,
        label: c.label,
        note: c.note,
        depth: 2,
        branch: bi,
        children: c.children.map((l, li) => ({ id: `b${bi}.${ci}.${li}`, label: l.label, depth: 3, branch: bi, children: [] })),
      })),
    })),
  };
}

export function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + 1 + word.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function size(node: MapNode) {
  const d = Math.min(node.depth, 3);
  const w = WIDTH[d]!;
  const lines = wrap(node.label, Math.floor((w - 24) / CHAR_W[d]!));
  return { w, h: lines.length * LINE_H[d]! + PAD_Y * 2, lines };
}

export function layoutMindMap(map: MindMap, collapsed: ReadonlySet<string>): MapLayout {
  const root = toTree(map);
  const visibleChildren = (n: MapNode) => (collapsed.has(n.id) ? [] : n.children);

  const heights = new Map<string, number>();
  const subtreeHeight = (n: MapNode): number => {
    const own = size(n).h;
    const kids = visibleChildren(n);
    const kidsH = kids.reduce((sum, k) => sum + subtreeHeight(k), 0) + Math.max(0, kids.length - 1) * ROW_GAP;
    const h = Math.max(own, kidsH);
    heights.set(n.id, h);
    return h;
  };

  // Balance top-level branches between the two sides.
  const sides: { right: MapNode[]; left: MapNode[] } = { right: [], left: [] };
  let rightH = 0;
  let leftH = 0;
  for (const b of root.children) {
    const h = subtreeHeight(b);
    if (rightH <= leftH) {
      sides.right.push(b);
      rightH += h + BRANCH_GAP;
    } else {
      sides.left.push(b);
      leftH += h + BRANCH_GAP;
    }
  }

  const nodes: PlacedNode[] = [];
  const links: PlacedLink[] = [];
  const rootSize = size(root);
  const rootNode: PlacedNode = {
    id: root.id,
    label: root.label,
    lines: rootSize.lines,
    depth: 0,
    branch: -1,
    side: 1,
    x: -rootSize.w / 2,
    y: -rootSize.h / 2,
    w: rootSize.w,
    h: rootSize.h,
    childCount: root.children.length,
    collapsed: false,
  };
  nodes.push(rootNode);

  const colX = (depth: number, side: 1 | -1, w: number) => {
    let edge = rootSize.w / 2 + COL_GAP;
    for (let d = 1; d < depth; d++) edge += WIDTH[Math.min(d, 3)]! + COL_GAP;
    return side === 1 ? edge : -edge - w;
  };

  const place = (n: MapNode, top: number, side: 1 | -1, parent: PlacedNode) => {
    const s = size(n);
    const block = heights.get(n.id) ?? s.h;
    const centerY = top + block / 2;
    const placed: PlacedNode = {
      id: n.id,
      label: n.label,
      note: n.note,
      lines: s.lines,
      depth: n.depth,
      branch: n.branch,
      side,
      x: colX(n.depth, side, s.w),
      y: centerY - s.h / 2,
      w: s.w,
      h: s.h,
      childCount: n.children.length,
      collapsed: collapsed.has(n.id) && n.children.length > 0,
    };
    nodes.push(placed);

    const fromX = side === 1 ? parent.x + parent.w : parent.x;
    const fromY = parent.y + parent.h / 2;
    const toX = side === 1 ? placed.x : placed.x + placed.w;
    const midX = (fromX + toX) / 2;
    links.push({ id: `${parent.id}->${n.id}`, branch: n.branch, depth: n.depth, d: `M${fromX},${fromY} C${midX},${fromY} ${midX},${centerY} ${toX},${centerY}` });

    const kids = visibleChildren(n);
    const kidsH = kids.reduce((sum, k) => sum + (heights.get(k.id) ?? 0), 0) + Math.max(0, kids.length - 1) * ROW_GAP;
    let y = centerY - kidsH / 2;
    for (const k of kids) {
      place(k, y, side, placed);
      y += (heights.get(k.id) ?? 0) + ROW_GAP;
    }
  };

  for (const [list, side, total] of [
    [sides.right, 1, rightH - BRANCH_GAP],
    [sides.left, -1, leftH - BRANCH_GAP],
  ] as const) {
    let y = -Math.max(0, total) / 2;
    for (const b of list) {
      place(b, y, side, rootNode);
      y += (heights.get(b.id) ?? 0) + BRANCH_GAP;
    }
  }

  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxY = Math.max(...nodes.map((n) => n.y + n.h));
  return { nodes, links, minX, minY, width: maxX - minX, height: maxY - minY };
}
