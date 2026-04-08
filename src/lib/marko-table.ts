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

export * from "@tanstack/table-core";

// ── Table instance cache ──────────────────────────────────────────────────
const _instances = new Map<string, Table<any>>();

let _idCounter = 0;
export function generateTableId(): string {
  return `mkt_${++_idCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

export function getTable<TData extends RowData>(id: string): Table<TData> | undefined {
  return _instances.get(id) as Table<TData> | undefined;
}

export function destroyTable(id: string): void {
  _instances.delete(id);
  destroyVirtualizer(id);
}

export type Renderable<TProps> =
  | string | number | boolean | null | undefined
  | ((props: TProps) => unknown);

export function flexRender<TProps extends object>(
  comp: Renderable<TProps>,
  props: TProps
): unknown {
  if (comp == null) return null;
  if (typeof comp === "function") return comp(props);
  return comp;
}

export function syncMarkoTable<TData extends RowData>(
  tableId: string,
  options: TableOptions<TData>,
  currentState: Record<string, unknown>,
  setState: (updater: Updater<Record<string, unknown>>) => void
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

  table.setOptions((prev) => ({
    ...prev,
    ...options,
    state: {
      ...table!.initialState,
      ...currentState,
      ...(options.state ?? {}),
    },
    onStateChange(updater: Updater<Record<string, unknown>>) {
      setState(updater);
      (options as any).onStateChange?.(updater);
    },
  }));

  return table;
}

// ── Virtualizer cache ─────────────────────────────────────────────────────
type VInstance = InstanceType<typeof Virtualizer<Element, Element>>;
const _virtualizers = new Map<string, VInstance>();

export interface VirtualRow {
  index: number;
  start: number;
  end: number;
  size: number;
  key: string | number;
  lane: number;
}

/**
 * Creates or updates a row virtualizer.
 * Call this inside an <effect> after mount so the scroll element is in the DOM.
 *
 * v3 API notes:
 *  - observeElementRect, observeElementOffset, scrollToFn are required options
 *  - _willUpdate() (not _didMount()) is what initialises the observers
 *  - onChange fires when the ResizeObserver/scroll observers update
 */
export function syncVirtualizer(
  tableId: string,
  scrollElId: string,
  count: number,
  estimateSize: (i: number) => number,
  onUpdate: (rows: VirtualRow[], paddingTop: number, paddingBottom: number) => void
): void {
  const notify = (instance: VInstance) => {
    const items = instance.getVirtualItems() as unknown as VirtualRow[];
    const total = instance.getTotalSize();
    const paddingTop = items[0]?.start ?? 0;
    const paddingBottom =
      items.length > 0 ? total - (items[items.length - 1]?.end ?? total) : 0;
    onUpdate(items, paddingTop, paddingBottom);
  };

  let v = _virtualizers.get(tableId);

  if (!v) {
    // First call: create instance and set up ResizeObserver/scroll observers.
    // _willUpdate() triggers observeElementRect which fires onChange with
    // initial items via ResizeObserver callback on first mount.
    v = new Virtualizer({
      count,
      getScrollElement: () =>
        document.getElementById(scrollElId) as Element | null,
      estimateSize,
      overscan: 5,
      observeElementRect,
      observeElementOffset,
      scrollToFn: elementScroll,
      onChange: notify,
    } as any);
    _virtualizers.set(tableId, v);
    v._willUpdate();
  } else {
    // Subsequent calls: update count (e.g. after filter/sort changes row count).
    // measure() clears the size cache and calls notify() directly — this is the
    // correct v3 way to force recalculation without waiting for ResizeObserver.
    v.setOptions({
      ...(v as any).options,
      count,
      estimateSize,
      onChange: notify,
    } as any);
    v.measure();
  }
}

export function destroyVirtualizer(id: string): void {
  const v = _virtualizers.get(id);
  if (v) {
    (v as any).cleanup?.();
    _virtualizers.delete(id);
  }
}