/**
 * tanstack-table-markojs — Marko 6 adapter for @tanstack/table-core
 *
 * Provides SSR + resumability support, client-only mode, and row virtualization.
 * All TanStack Table features are supported.
 *
 * @packageDocumentation
 */

import {
  createTable,
  type RowData,
  type TableOptions,
  type TableOptionsResolved,
  type Updater,
  type Table,
} from "@tanstack/table-core";
import {
  Virtualizer,
  observeElementRect,
  observeElementOffset,
  elementScroll,
} from "@tanstack/virtual-core";

// Re-export everything so consumers only need this one package
export * from "@tanstack/table-core";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A value that can be rendered as a cell or header in a Marko template.
 * Functions are called with the TanStack context object; primitives returned as-is.
 */
export type Renderable<TProps> =
  | string
  | number
  | boolean
  | null
  | undefined
  | ((props: TProps) => unknown);

/** A cell pre-mapped to plain serializable values for use in Marko templates. */
export interface MappedCell {
  id: string;
  colId: string;
  value: string;
}

/** A row pre-mapped to plain serializable values. Safe in the SSR resume frame. */
export interface MappedRow<TData extends RowData> {
  id: string;
  isSelected: boolean;
  isExpanded: boolean;
  original: TData;
  cells: MappedCell[];
}

/** A header pre-mapped to plain serializable values. */
export interface MappedHeader {
  id: string;
  colId: string;
  colSpan: number;
  isPlaceholder: boolean;
  isSelectCol: boolean;
  canSort: boolean;
  isSorted: false | "asc" | "desc";
  canResize: boolean;
  width: number;
  label: string;
  filterType: "none" | "text" | "number" | "select";
  filterValue: string;
}

/** A header group pre-mapped to plain serializable values. */
export interface MappedHeaderGroup {
  id: string;
  headers: MappedHeader[];
}

/** A column pre-mapped for use in a column visibility toggle menu. */
export interface MappedColumn {
  id: string;
  label: string;
  isVisible: boolean;
}

/**
 * A virtual row descriptor from @tanstack/virtual-core.
 * All values are primitives — safe to store in Marko `<let>` signals.
 */
export interface VirtualRow {
  index: number;
  start: number;
  end: number;
  size: number;
  key: string | number;
  lane: number;
}

// ── Table instance cache ──────────────────────────────────────────────────────
// Module-level — intentionally outside Marko scope, never serialized.

const _instances = new Map<string, Table<any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
let _idCounter = 0;

// ── Table utilities ───────────────────────────────────────────────────────────

/**
 * Generates a unique string ID for a table instance.
 * Store in `<let/tableId = generateTableId() />` — survives SSR→client.
 */
export function generateTableId(): string {
  return `mkt_${++_idCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Retrieves a live table instance by ID from the module cache.
 * Use in event handlers instead of closing over `t` from the IIFE.
 *
 * @example
 * ```marko
 * onClick=() => getTable(tableId)?.firstPage()
 * ```
 */
export function getTable<TData extends RowData>(id: string): Table<TData> | undefined {
  return _instances.get(id) as Table<TData> | undefined;
}

/**
 * Removes a table (and its virtualizer, if any) from the module cache.
 * Call in `<script>` cleanup to prevent memory leaks.
 *
 * @example
 * ```marko
 * <script() { return () => destroyTable(tableId) } />
 * ```
 */
export function destroyTable(id: string): void {
  _instances.delete(id);
  destroyVirtualizer(id);
}

// ── flexRender ────────────────────────────────────────────────────────────────

/**
 * Renders a cell or header value. Handles plain values and functions.
 *
 * @example
 * ```marko
 * ${ flexRender(cell.column.columnDef.cell, cell.getContext()) }
 * ```
 */
export function flexRender<TProps extends object>(
  comp: Renderable<TProps>,
  props: TProps,
): unknown {
  if (comp == null) return null;
  if (typeof comp === "function") return comp(props);
  return comp;
}

// ── syncMarkoTable ────────────────────────────────────────────────────────────

/**
 * Creates or retrieves a TanStack Table instance and syncs its options
 * with the current Marko reactive state.
 *
 * **Critical — always call inside an IIFE assigned to `<const>`:**
 *
 * Marko's `_const` runtime uses strict reference equality (`!==`) to detect
 * changes. `syncMarkoTable` returns the same Table instance (same reference)
 * every render. If stored directly as a named `<const>`, Marko skips all
 * downstream updates after the first render.
 *
 * The IIFE returns a **new plain object** every render → different reference →
 * Marko always propagates updates.
 *
 * ```marko
 * // ❌ WRONG — t is same ref every render, nothing updates
 * <const/t = syncMarkoTable(tableId, options, state, setState) />
 *
 * // ✅ CORRECT — view is a new plain object every render
 * <const/view = (() => {
 *   const t = syncMarkoTable(tableId, options, state, setState);
 *   return {
 *     tableRows: t.getRowModel().rows.map(row => ({
 *       id: row.id,
 *       isSelected: row.getIsSelected(),
 *       cells: row.getVisibleCells().map(cell => ({ ... })),
 *     })),
 *     pageCount: t.getPageCount(),
 *   };
 * })() />
 * ```
 *
 * @param tableId - Serializable string ID from `generateTableId()`
 * @param options - Any valid TanStack TableOptions
 * @param currentState - Current Marko `<let>` signal values for table state
 * @param setState - Writes TanStack internal state changes back to Marko signals
 */
export function syncMarkoTable<TData extends RowData>(
  tableId: string,
  options: TableOptions<TData>,
  currentState: Record<string, unknown>,
  setState: (updater: Updater<Record<string, unknown>>) => void,
): Table<TData> {
  let table = _instances.get(tableId) as Table<TData> | undefined;

  if (!table) {
    table = createTable<TData>({
      state: {},
      onStateChange: () => {},
      renderFallbackValue: null,
      ...options,
    } as TableOptionsResolved<TData>);
    _instances.set(tableId, table);
  }

  table.setOptions(
    (prev) =>
      ({
        ...prev,
        ...options,
        state: {
          ...table!.initialState,
          ...currentState,
          ...(options.state ?? {}),
        },
        onStateChange(updater: Updater<Record<string, unknown>>) {
          setState(updater);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (options as any).onStateChange?.(updater);
        },
      }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  );

  return table;
}

// ── Virtualizer cache ─────────────────────────────────────────────────────────

type VInstance = InstanceType<typeof Virtualizer<Element, Element>>;
const _virtualizers = new Map<string, VInstance>();

/**
 * Creates or updates a row virtualizer backed by @tanstack/virtual-core v3.
 *
 * Call inside `<script>` (inside `<if=mounted>`) so the scroll element exists.
 * The script should read `view.rowCount` so Marko re-runs it on filter/sort changes.
 *
 * - **First call:** `_willUpdate()` sets up ResizeObserver/scroll observers.
 * - **Subsequent calls:** `setOptions({ count }) + measure()` forces sync recalculation.
 *
 * @param tableId - Same ID as `syncMarkoTable`
 * @param scrollElId - `id` attribute of the scroll container element
 * @param count - Current filtered/sorted row count
 * @param estimateSize - Returns estimated row height in pixels
 * @param onUpdate - Receives virtual rows + padding values; write to `<let>` signals
 *
 * @example
 * ```marko
 * <script() {
 *   syncVirtualizer(tableId, `scroll-${tableId}`, view.rowCount, () => 49,
 *     (vRows, top, bot) => { virtualRows = vRows; paddingTop = top; paddingBottom = bot; });
 * } />
 * ```
 */
export function syncVirtualizer(
  tableId: string,
  scrollElId: string,
  count: number,
  estimateSize: (i: number) => number,
  onUpdate: (rows: VirtualRow[], paddingTop: number, paddingBottom: number) => void,
): void {
  const notify = (instance: VInstance) => {
    const items = instance.getVirtualItems() as unknown as VirtualRow[];
    const total = instance.getTotalSize();
    const paddingTop = items[0]?.start ?? 0;
    const paddingBottom = items.length > 0 ? total - (items[items.length - 1]?.end ?? total) : 0;
    onUpdate(items, paddingTop, paddingBottom);
  };

  let v = _virtualizers.get(tableId);

  if (!v) {
    // First call: create instance and set up ResizeObserver/scroll observers.
    // _willUpdate() triggers observeElementRect which fires onChange with
    // initial items via ResizeObserver callback on first mount.
    v = new Virtualizer({
      count,
      getScrollElement: () => document.getElementById(scrollElId) as Element | null,
      estimateSize,
      overscan: 5,
      observeElementRect,
      observeElementOffset,
      scrollToFn: elementScroll,
      onChange: notify,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    _virtualizers.set(tableId, v);
    v._willUpdate();
  } else {
    // Subsequent calls: update count after filter/sort changes row count.
    // measure() clears the size cache and calls notify() directly — the
    // correct v3 way to force recalculation without waiting for ResizeObserver.
    v.setOptions({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(v as any).options,
      count,
      estimateSize,
      onChange: notify,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    v.measure();
  }
}

/**
 * Removes a virtualizer instance from the module cache.
 * Called automatically by `destroyTable`.
 */
export function destroyVirtualizer(id: string): void {
  const v = _virtualizers.get(id);
  if (v) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v as any).cleanup?.();
    _virtualizers.delete(id);
  }
}

/**
 * No-op with static imports — @tanstack/virtual-core is loaded at module
 * initialisation time. Kept for API compatibility.
 *
 * @deprecated Not needed when using the published package. Safe to remove calls.
 */
export async function preloadVirtualizer(): Promise<void> {
  // virtual-core is loaded via static import; nothing to do here
}
