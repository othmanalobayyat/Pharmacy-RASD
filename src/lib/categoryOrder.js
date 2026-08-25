// Pure list-reorder helper used by CategorySidebar.jsx's drag-and-drop:
// moves the item with id `fromId` to occupy the position currently held by
// the item with id `toId`. This only decides what the live drag looks like
// client-side — the actual persisted order always comes from
// reorder_categories() (see supabase/migrations/0015_category_sort_order.sql),
// which is the real source of truth.
export function moveItem(list, fromId, toId) {
  if (fromId === toId) return list;
  const fromIndex = list.findIndex((x) => x.id === fromId);
  const toIndex = list.findIndex((x) => x.id === toId);
  if (fromIndex === -1 || toIndex === -1) return list;
  const next = list.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
