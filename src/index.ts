/**
 * marko-table — Marko 6 adapter for @tanstack/table-core
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
  type TableState,
  type Updater,
  type Table,
} from "@tanstack/table-core";

// Re-export everything so consumers only need this one package
export * from "@tanstack/table-core";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A value that can be rendered as a cell or header in a Marko template.
 * Functions are called with the TanStack context object; primitives are returned as-is.
 */
export type Renderable<TProps extends object> =
  | string
  | number
  | boolean
  | null
  | undefined
  | ((props: TProps) => unknown);

/** A cell pre-mapped to plain serializable values. */
export interface MappedCell {
  id: string;
  colId: string;
  value: string;
}

/** A row pre-mapped to plain serializable values. */
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

/** A column pre-mapped for use in a visibility toggle menu. */
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

// ── Internal state type for syncMarkoTable ────────────────────────────────────
// Using TableState directly gives us proper types throughout the adapter.

type StateUpdater = Updater<TableState>;

// ── Instance caches ───────────────────────────────────────────────────────────
// Module-level — intentionally outside Marko scope, never serialized.

const _tableInstances = new Map<string, Table<unknown>>();
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
export function getTable<TData extends RowData>(
  id: string,
): Table<TData> | undefined {
  return _tableInstances.get(id) as Table<TData> | undefined;
}

/**
 * Removes a table (and its virtualizer, if any) from the module cache.
 * Call in `<effect>` cleanup to prevent memory leaks.
 *
 * @example
 * ```marko
 * <effect() { return () => destroyTable(tableId) } />
 * ```
 */
export function destroyTable(id: string): void {
  _tableInstances.delete(id);
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
  if (comp === null) return null;
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
  currentState: Partial<TableState>,
  setState: (updater: StateUpdater) => void,
): Table<TData> {
  let table = _tableInstances.get(tableId) as Table<TData> | undefined;

  if (!table) {
    table = createTable<TData>({
      state: {},
      onStateChange: () => {},
      renderFallbackValue: null,
      ...options,
    } as TableOptionsResolved<TData>);
    _tableInstances.set(tableId, table as Table<unknown>);
  }

  table.setOptions((prev) => ({
    ...prev,
    ...options,
    state: {
      ...table!.initialState,
      ...currentState,
      ...(options.state ?? {}),
    },
    onStateChange(updater: StateUpdater) {
      setState(updater);
      options.onStateChange?.(updater);
    },
  }));

  return table;
}

// ── Virtualizer ───────────────────────────────────────────────────────────────

// Typed to match @tanstack/virtual-core v3 without importing at the top level
// (keeps it optional — only bundled when actually called)
interface VirtualizerLike {
  getVirtualItems(): VirtualRow[];
  getTotalSize(): number;
  setOptions(opts: unknown): void;
  measure(): void;
  _willUpdate(): void;
  cleanup?: () => void;
}

interface VirtualizerConstructor {
  new (opts: unknown): VirtualizerLike;
}

let _VirtualizerCtor: VirtualizerConstructor | undefined;
let _observeElementRect: unknown;
let _observeElementOffset: unknown;
let _elementScroll: unknown;

function _requireVirtual(): void {
  if (_VirtualizerCtor) return;
  try {
     
    const vc = require("@tanstack/virtual-core") as {
      Virtualizer: VirtualizerConstructor;
      observeElementRect: unknown;
      observeElementOffset: unknown;
      elementScroll: unknown;
    };
    _VirtualizerCtor = vc.Virtualizer;
    _observeElementRect = vc.observeElementRect;
    _observeElementOffset = vc.observeElementOffset;
    _elementScroll = vc.elementScroll;
  } catch {
    throw new Error(
      "[marko-table] syncVirtualizer requires @tanstack/virtual-core.\n" +
        "Run: npm install @tanstack/virtual-core",
    );
  }
}

const _virtualizerInstances = new Map<string, VirtualizerLike>();

/**
 * Creates or updates a row virtualizer backed by @tanstack/virtual-core v3.
 *
 * Call inside `<effect>` (inside `<if=mounted>`) so the scroll element exists.
 * The effect should read `view.rowCount` so Marko re-runs it on filter/sort changes.
 *
 * - **First call:** `_willUpdate()` sets up ResizeObserver/scroll observers.
 * - **Subsequent calls:** `setOptions({ count }) + measure()` forces sync recalculation.
 *
 * @param tableId - Same ID as `syncMarkoTable`
 * @param scrollElId - `id` attribute of the scroll container element
 * @param count - Current filtered/sorted row count (`view.rowCount`)
 * @param estimateSize - Returns estimated row height in pixels
 * @param onUpdate - Receives virtual rows + padding values; write to `<let>` signals
 *
 * @example
 * ```marko
 * <let/virtualRows: VirtualRow[] = [] />
 * <let/paddingTop = 0 />
 * <let/paddingBottom = 0 />
 *
 * <effect() {
 *   syncVirtualizer(tableId, `scroll-${tableId}`, view.rowCount, () => 49,
 *     (vRows, top, bot) => { virtualRows = vRows; paddingTop = top; paddingBottom = bot; });
 * } />
 * ```
 */
export function syncVirtualizer(
  tableId: string,
  scrollElId: string,
  count: number,
  estimateSize: (index: number) => number,
  onUpdate: (
    rows: VirtualRow[],
    paddingTop: number,
    paddingBottom: number,
  ) => void,
): void {
  _requireVirtual();

  const notify = (instance: VirtualizerLike) => {
    const items = instance.getVirtualItems();
    const total = instance.getTotalSize();
    const paddingTop = items[0]?.start ?? 0;
    const paddingBottom =
      items.length > 0 ? total - (items[items.length - 1]?.end ?? total) : 0;
    onUpdate(items, paddingTop, paddingBottom);
  };

  let v = _virtualizerInstances.get(tableId);

  if (!v) {
    v = new _VirtualizerCtor!({
      count,
      getScrollElement: () => document.getElementById(scrollElId),
      estimateSize,
      overscan: 5,
      observeElementRect: _observeElementRect,
      observeElementOffset: _observeElementOffset,
      scrollToFn: _elementScroll,
      onChange: notify,
    });
    _virtualizerInstances.set(tableId, v);
    v._willUpdate();
  } else {
    v.setOptions({
      count,
      estimateSize,
      onChange: notify,
    });
    v.measure();
  }
}

/**
 * Removes a virtualizer instance from the module cache.
 * Called automatically by `destroyTable`.
 */
export function destroyVirtualizer(id: string): void {
  const v = _virtualizerInstances.get(id);
  if (v) {
    v.cleanup?.();
    _virtualizerInstances.delete(id);
  }
}

/**
 * Pre-loads @tanstack/virtual-core asynchronously.
 * Use in ESM-only environments where `require()` is unavailable.
 *
 * @example
 * ```ts
 * import { preloadVirtualizer } from "marko-table";
 * await preloadVirtualizer(); // call once at app startup
 * ```
 */
export async function preloadVirtualizer(): Promise<void> {
  if (_VirtualizerCtor) return;
  const vc = await import("@tanstack/virtual-core");
  _VirtualizerCtor = vc.Virtualizer as unknown as VirtualizerConstructor;
  _observeElementRect = vc.observeElementRect;
  _observeElementOffset = vc.observeElementOffset;
  _elementScroll = vc.elementScroll;
}
