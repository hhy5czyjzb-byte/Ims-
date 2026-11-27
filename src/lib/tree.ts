import { compareRequirement } from "@/lib/lookups";

export type TreeNode<T> = T & { depth: number };

/** Platte lijst met parentId → diepte-eerst gesorteerde lijst met diepte. */
export function flattenTree<T extends { id: string; parentId: string | null; sortOrder: number; clause: string }>(items: T[]): TreeNode<T>[] {
  const byParent = new Map<string | null, T[]>();
  const ids = new Set(items.map((i) => i.id));
  for (const item of items) {
    const key = item.parentId && ids.has(item.parentId) ? item.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), item]);
  }
  const out: TreeNode<T>[] = [];
  const visit = (parent: string | null, depth: number) => {
    for (const child of (byParent.get(parent) ?? []).sort(compareRequirement)) {
      out.push({ ...child, depth });
      visit(child.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}
