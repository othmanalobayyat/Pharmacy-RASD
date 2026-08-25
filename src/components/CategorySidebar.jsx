import { useEffect, useRef, useState } from "react";
import { ChevronDown, GripVertical, Pencil, Plus } from "lucide-react";
import { styles } from "../styles/styles";
import { moveItem } from "../lib/categoryOrder";

// Renders the existing "كل الأدوية" + per-category sidebar exactly as
// before, adding an admin-only drag handle for reordering. Built with the
// Pointer Events API (not the HTML5 Drag-and-Drop API, which has no touch
// support) so the SAME code path drives mouse, touch, and pen — this also
// makes it naturally orientation/RTL-agnostic: at mobile widths the sidebar
// becomes a horizontal-scrolling row (see global.css .pharmacy-sidebar),
// but the drag logic never reasons about "left/right" or "up/down" itself —
// it only asks the browser which row element is physically under the
// pointer (document.elementFromPoint) and reuses that row's *array*
// position, which is correct regardless of layout direction.
export function CategorySidebar({
  L,
  categories,
  activeCategory,
  medications,
  isOwner,
  onSelectCategory,
  onEditCategory,
  onAddCategory,
  onReorder,
}) {
  const [localOrder, setLocalOrder] = useState(categories);
  const [draggingId, setDraggingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const localOrderRef = useRef(localOrder);
  localOrderRef.current = localOrder;

  // Stay in sync with the real (server) order whenever it changes, EXCEPT
  // while a drag or an in-flight save is happening — otherwise a
  // realtime-triggered refetch landing mid-drag would yank the list out
  // from under the user's finger.
  useEffect(() => {
    if (!draggingId && !saving) setLocalOrder(categories);
  }, [categories, draggingId, saving]);

  const handlePointerDown = (e, catId) => {
    if (!isOwner || saving) return;
    // Guarded: not every test/legacy environment implements pointer
    // capture, and losing it just means a fast drag off the handle stops
    // updating mid-gesture rather than breaking the interaction outright.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDraggingId(catId);
  };

  const handlePointerMove = (e) => {
    if (!draggingId) return;
    const overEl = document.elementFromPoint(e.clientX, e.clientY);
    const overRow = overEl?.closest?.("[data-cat-id]");
    const overId = overRow?.dataset.catId;
    if (overId && overId !== draggingId) {
      setLocalOrder((prev) => moveItem(prev, draggingId, overId));
    }
  };

  const handlePointerUp = () => {
    if (!draggingId) return;
    setDraggingId(null);

    const originalIds = categories.map((c) => c.id);
    const newOrder = localOrderRef.current;
    const newIds = newOrder.map((c) => c.id);
    const changed =
      originalIds.length !== newIds.length ||
      originalIds.some((id, i) => id !== newIds[i]);
    if (!changed) return;

    setSaving(true);
    Promise.resolve(onReorder(newIds))
      .catch(() => {
        // Restore the previous (last known-good) order — never leave the
        // UI silently showing an order that didn't actually save.
        setLocalOrder(categories);
      })
      .finally(() => setSaving(false));
  };

  // Currently-selected category object (for the mobile edit-category
  // action below) — "all" has no backing row, so this is null in that case.
  const selectedCategory = localOrder.find((c) => c.id === activeCategory) || null;

  return (
    <>
      {/* Mobile-only dropdown replacement for the horizontal category
          strip below — see global.css .category-mobile-select (hidden by
          default, shown only at the mobile breakpoint; the strip itself is
          hidden there instead). Same state/handlers as the desktop strip,
          just a different control — no separate filter logic. */}
      <div className="category-mobile-select" style={styles.categoryMobileSelect}>
        <label style={styles.label} htmlFor="category-mobile-select">
          الفئة
          <div style={styles.selectWrap}>
            <select
              id="category-mobile-select"
              style={styles.select}
              value={activeCategory}
              onChange={(e) => onSelectCategory(e.target.value)}
              aria-label="اختيار فئة الأدوية"
            >
              <option value="all">
                {L.sidebarAll} ({medications.length})
              </option>
              {localOrder.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({medications.filter((m) => m.categoryId === c.id).length})
                </option>
              ))}
            </select>
            <ChevronDown size={15} style={styles.selectChevron} />
          </div>
        </label>
        {isOwner && (
          <div style={styles.categoryMobileActions}>
            {selectedCategory && (
              <button
                style={{ ...styles.secondaryBtn, flex: "none" }}
                onClick={() => onEditCategory(selectedCategory)}
              >
                <Pencil size={13} /> تعديل اسم الفئة
              </button>
            )}
            <button style={{ ...styles.secondaryBtn, flex: "none" }} onClick={onAddCategory}>
              <Plus size={13} /> {L.addCategoryBtn}
            </button>
          </div>
        )}
      </div>

      <aside className="pharmacy-sidebar" style={styles.sidebar}>
      <button
        style={styles.sideItem(activeCategory === "all")}
        onClick={() => onSelectCategory("all")}
      >
        {L.sidebarAll}
        <span style={styles.countBadge}>{medications.length}</span>
      </button>
      {localOrder.map((c) => (
        <div
          key={c.id}
          data-cat-id={c.id}
          style={{
            ...styles.sideItemRow,
            opacity: draggingId === c.id ? 0.5 : 1,
          }}
        >
          {isOwner && (
            <button
              style={{
                ...styles.dragHandle,
                cursor: draggingId === c.id ? "grabbing" : "grab",
              }}
              onPointerDown={(e) => handlePointerDown(e, c.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              title="اسحب لإعادة الترتيب"
              aria-label={`إعادة ترتيب ${c.name}`}
            >
              <GripVertical size={13} />
            </button>
          )}
          <button
            style={{
              ...styles.sideItem(activeCategory === c.id),
              flex: 1,
            }}
            onClick={() => onSelectCategory(c.id)}
          >
            {c.name}
            <span style={styles.countBadge}>
              {medications.filter((m) => m.categoryId === c.id).length}
            </span>
          </button>
          {isOwner && (
            <button
              style={styles.editPencil}
              onClick={() => onEditCategory(c)}
              title="تعديل اسم الفئة"
            >
              <Pencil size={12} />
            </button>
          )}
        </div>
      ))}
      {isOwner && (
        <button style={styles.addCategoryBtn} onClick={onAddCategory}>
          <Plus size={14} /> {L.addCategoryBtn}
        </button>
      )}
    </aside>
    </>
  );
}
