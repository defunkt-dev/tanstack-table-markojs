# marko-table

> Marko 6 adapter for [@tanstack/table-core](https://tanstack.com/table) — SSR, CSR, and virtualized tables with full resumability support.

## Features

- ✅ **All TanStack Table features** — sorting, filtering, pagination, row selection, column visibility/ordering/pinning/resizing, row expansion, grouping, aggregation, faceted values, server-side mode
- ✅ **SSR + Resumability** — table rows are server-rendered; only serializable state (sorting, pagination, etc.) is in the resume frame
- ✅ **Client-only mode** — simpler code when SSR isn't needed
- ✅ **Row virtualization** — `@tanstack/virtual-core` v3 integration for 100k+ row datasets
- ✅ **TypeScript** — full type safety including column definitions and row data

## Installation

```bash
npm install marko-table @tanstack/table-core
# optional: for virtualized tables
npm install @tanstack/virtual-core
```

## Core concept: the IIFE pattern

The single most important thing to understand is **why** this adapter uses an IIFE for the `<const>`.

Marko's `_const` runtime function uses strict reference equality (`!==`) to detect changes:

```js
// Marko runtime (simplified)
function _const(key, fn) {
  return (scope, value) => {
    if (scope[key] !== value) {
      // ← strict equality
      scope[key] = value;
      fn(scope); // only propagates if value changed
    }
  };
}
```

`syncMarkoTable` returns the **same table instance** (same reference from the module cache) on every render. If you store `t` as a named `<const>`, Marko sees `t_prev === t_new` and skips all downstream updates — nothing reacts to state changes.

The IIFE returns a **new plain object** every render → different reference → Marko always propagates:

```marko
// ❌ WRONG — t is the same reference every render, nothing updates
<const/t = syncMarkoTable(tableId, options, state, setState) />
<for|row| of=t.getRowModel().rows> ... </for>

// ✅ CORRECT — view is a new plain object every render
<const/view = (() => {
  const t = syncMarkoTable(tableId, options, state, setState);
  return {
    tableRows: t.getRowModel().rows.map(row => ({ id: row.id, ... })),
    pageCount: t.getPageCount(),  // number ✓
  };
})() />
<for|row| of=view.tableRows> ... </for>
```

Additionally, in SSR mode, **everything inside the IIFE stays local to JavaScript** — `t` is never stored in Marko's scope and never serialized. The returned object contains only primitives and plain arrays, which serialize safely into the resume frame.

---

## Usage

### SSR (recommended default)

The SSR pattern renders the full table on the server. Only the reactive signals (`sorting`, `pagination`, etc.) are serialized into the resume frame. On the client, Marko resumes without re-running server logic.

```marko
// components/data-table.marko
import {
  syncMarkoTable, generateTableId, destroyTable, getTable, flexRender,
  getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  getFilteredRowModel,
  createColumnHelper,
  type SortingState, type PaginationState, type RowSelectionState,
} from "marko-table";

export interface Input { data: Person[] }
export interface Person { id: number; name: string; age: number }

static const ch = createColumnHelper<Person>();
static const columns = [
  ch.accessor("name", { header: "Name", cell: i => i.getValue() }),
  ch.accessor("age",  { header: "Age",  cell: i => i.getValue() }),
];

// ── Serializable state in <let> ───────────────────────────────────────────────
// These are written to the resume frame. Every value must be JSON-serializable.
<let/tableId = generateTableId() />
<let/sorting: SortingState = [] />
<let/pagination: PaginationState = { pageIndex: 0, pageSize: 10 } />
<let/rowSelection: RowSelectionState = {} />
<let/globalFilter = "" />

// ── IIFE: all table reads are local to this function ─────────────────────────
// `t` is a local JS variable — never stored in Marko scope — never serialized.
// The returned `view` object contains only plain serializable values.
<const/view = (() => {
  const t = syncMarkoTable(
    tableId,
    {
      data: input.data,
      columns,
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getPaginationRowModel: getPaginationRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      enableRowSelection: true,
      globalFilterFn: "includesString",
    },
    { sorting, pagination, rowSelection, globalFilter },
    (updater) => {
      const cur = { sorting, pagination, rowSelection, globalFilter };
      const nxt = typeof updater === "function" ? updater(cur) : updater;
      if (nxt.sorting !== sorting) sorting = nxt.sorting;
      if (nxt.pagination !== pagination) pagination = nxt.pagination;
      if (nxt.rowSelection !== rowSelection) rowSelection = nxt.rowSelection;
      if (nxt.globalFilter !== globalFilter) globalFilter = nxt.globalFilter;
    },
  );

  return {
    // Pre-map TanStack objects to plain serializable values
    tableRows: t.getRowModel().rows.map(row => ({
      id: row.id,                          // string ✓
      isSelected: row.getIsSelected(),     // boolean ✓
      original: { ...row.original },       // plain data ✓
      cells: row.getVisibleCells().map(cell => ({
        id: cell.id,
        colId: cell.column.id,
        value: String(flexRender(cell.column.columnDef.cell, cell.getContext()) ?? ""),
      })),
    })),
    headerGroups: t.getHeaderGroups().map(hg => ({
      id: hg.id,
      headers: hg.headers.map(h => ({
        id: h.id,
        colId: h.column.id,
        colSpan: h.colSpan,
        canSort: h.column.getCanSort(),
        isSorted: h.column.getIsSorted(),
        label: String(flexRender(h.column.columnDef.header, h.getContext()) ?? ""),
      })),
    })),
    pageIndex: t.getState().pagination.pageIndex,
    pageCount: t.getPageCount(),
    canPrev: t.getCanPreviousPage(),
    canNext: t.getCanNextPage(),
    allSelected: t.getIsAllPageRowsSelected(),
  };
})() />

<effect() { return () => destroyTable(tableId) } />

<table>
  <thead>
    <for|hg| of=view.headerGroups>
      <tr>
        <for|h| of=hg.headers>
          <th colspan=h.colSpan
            onClick=h.canSort ? () => {
              const cur = sorting as Array<{id: string, desc: boolean}>;
              const ex = cur.find(s => s.id === h.colId);
              if (!ex) sorting = [{ id: h.colId, desc: false }];
              else if (!ex.desc) sorting = cur.map(s => s.id === h.colId ? {...s, desc:true} : s);
              else sorting = [];
            } : undefined
          >
            ${h.label}
            <if=h.isSorted === "asc"> ▲</if>
            <if=h.isSorted === "desc"> ▼</if>
          </th>
        </for>
      </tr>
    </for>
  </thead>
  <tbody>
    <for|row| of=view.tableRows>
      <tr>
        <for|cell| of=row.cells>
          <td>${cell.value}</td>
        </for>
      </tr>
    </for>
  </tbody>
</table>

<div>
  <button disabled=!view.canPrev onClick=() => { pagination = {...pagination, pageIndex: 0} }>«</button>
  <button disabled=!view.canPrev onClick=() => { pagination = {...pagination, pageIndex: view.pageIndex - 1} }>‹</button>
  <button disabled=!view.canNext onClick=() => { pagination = {...pagination, pageIndex: view.pageIndex + 1} }>›</button>
  <button disabled=!view.canNext onClick=() => { pagination = {...pagination, pageIndex: view.pageCount - 1} }>»</button>
  <span>Page ${view.pageIndex + 1} of ${view.pageCount}</span>
</div>
```

### Client-only (CSR)

Gate everything behind `<if=mounted>` so the server never renders the table content. Inside `<if=mounted>`, Marko never serializes anything, so the IIFE is still required (for the same-reference reason) but serialization constraints don't apply to event handler closures.

```marko
// components/data-table-client.marko
import { syncMarkoTable, generateTableId, destroyTable, flexRender,
  getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  type SortingState, type PaginationState } from "marko-table";

<let/mounted = false />
<let/tableId = generateTableId() />
<let/sorting: SortingState = [] />
<let/pagination: PaginationState = { pageIndex: 0, pageSize: 10 } />

<effect() { mounted = true } />
<effect() { return () => destroyTable(tableId) } />

<if=!mounted>
  <div>Loading...</div>
</if>

<if=mounted>
  // Same IIFE pattern — same-reference issue applies regardless of SSR
  <const/view = (() => {
    const t = syncMarkoTable(tableId, { ... }, { sorting, pagination }, setState);
    return {
      tableRows: t.getRowModel().rows.map(row => ({ ... })),
      // ... etc
    };
  })() />

  // Inside <if=mounted>, Marko doesn't serialize content.
  // So you CAN close over `view` in handlers (it's a plain object).
  <table>
    <for|row| of=view.tableRows>
      <tr>...</tr>
    </for>
  </table>
</if>
```

### Virtualized (CSR only)

Use `syncVirtualizer` for large datasets. Virtualization is client-only (SSR would defeat the purpose).

```marko
// components/data-table-virtual.marko
import {
  syncMarkoTable, generateTableId, destroyTable, syncVirtualizer, flexRender,
  getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  type SortingState, type VirtualRow,
} from "marko-table";

<let/mounted = false />
<let/tableId = generateTableId() />
<let/sorting: SortingState = [] />
<let/globalFilter = "" />
// VirtualRow elements are plain objects — serializable
<let/virtualRows: VirtualRow[] = [] />
<let/paddingTop = 0 />
<let/paddingBottom = 0 />

<effect() { mounted = true } />
<effect() { return () => destroyTable(tableId) } />

<if=mounted>
  <const/view = (() => {
    const t = syncMarkoTable(
      tableId,
      { data: input.data, columns, getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel() },
      { sorting, globalFilter },
      setState,
    );

    const rows = t.getRowModel().rows;

    return {
      rowCount: rows.length,
      // Only pre-map the ~15 visible rows, not all 100,000
      visibleRows: virtualRows.map(vRow => {
        const row = rows[vRow.index];
        if (!row) return null;
        return {
          id: row.id, size: vRow.size,
          cells: row.getVisibleCells().map(cell => ({
            id: cell.id, colId: cell.column.id,
            value: String(flexRender(cell.column.columnDef.cell, cell.getContext()) ?? ""),
          })),
        };
      }).filter(Boolean),
      // ... headers etc
    };
  })() />

  // Effect re-runs when view.rowCount changes (after filter/sort)
  // measure() forces virtualizer to recalculate and fires onChange synchronously
  <effect() {
    syncVirtualizer(tableId, `scroll-${tableId}`, view.rowCount, () => 49,
      (vRows, top, bot) => { virtualRows = vRows; paddingTop = top; paddingBottom = bot; });
  } />

  <div id=`scroll-${tableId}` style="height: 520px; overflow-y: auto;">
    <table>
      <tbody>
        <if=paddingTop>
          <tr style=`height: ${paddingTop}px`><td /></tr>
        </if>
        <for|row| of=view.visibleRows>
          <tr style=`height: ${row.size}px`>
            <for|cell| of=row.cells>
              <td>${cell.value}</td>
            </for>
          </tr>
        </for>
        <if=paddingBottom>
          <tr style=`height: ${paddingBottom}px`><td /></tr>
        </if>
      </tbody>
    </table>
  </div>
</if>
```

---

## API Reference

### `syncMarkoTable(tableId, options, currentState, setState)`

Creates or retrieves a TanStack Table instance and syncs options with current reactive state.

| Parameter      | Type                      | Description                                         |
| -------------- | ------------------------- | --------------------------------------------------- |
| `tableId`      | `string`                  | ID from `generateTableId()`, stored in `<let>`      |
| `options`      | `TableOptions<TData>`     | Any valid TanStack Table options                    |
| `currentState` | `Record<string, unknown>` | Current values of all state `<let>` signals         |
| `setState`     | `(updater) => void`       | Writes TanStack state changes back to Marko signals |

Returns: `Table<TData>` — the live table instance (same reference every call).

**Important:** Always call inside an IIFE assigned to `<const>`. Never store `t` directly in Marko scope.

---

### `generateTableId()`

Returns a unique string ID. Store in `<let/tableId>` — it's serializable and survives SSR→client.

---

### `getTable<TData>(id)`

Retrieves a table instance from the module cache by ID. Use in event handlers that can't close over `t` (SSR components).

```marko
// In SSR handlers, never close over `t` — use getTable instead
onClick=() => getTable(tableId)?.firstPage()
```

---

### `destroyTable(id)`

Removes the table instance from the cache. Call in `<effect>` cleanup.

```marko
<effect() { return () => destroyTable(tableId) } />
```

---

### `flexRender(comp, props)`

Renders a cell or header value. Handles strings, numbers, booleans, and functions.

```marko
${ flexRender(cell.column.columnDef.cell, cell.getContext()) }
```

---

### `syncVirtualizer(tableId, scrollElId, count, estimateSize, onUpdate)`

Creates or updates a row virtualizer. Requires `@tanstack/virtual-core` v3+.

| Parameter      | Type                                        | Description                            |
| -------------- | ------------------------------------------- | -------------------------------------- |
| `tableId`      | `string`                                    | Same ID as `syncMarkoTable`            |
| `scrollElId`   | `string`                                    | `id` attribute of the scroll container |
| `count`        | `number`                                    | Total filtered row count               |
| `estimateSize` | `(i: number) => number`                     | Estimated row height in pixels         |
| `onUpdate`     | `(rows, paddingTop, paddingBottom) => void` | Called when virtual items change       |

Call inside `<effect>` so the scroll container exists in the DOM.

---

### `preloadVirtualizer()`

Pre-loads `@tanstack/virtual-core` in ESM-only environments where `require()` is unavailable.

---

## Critical Marko 6 rules for this adapter

### 1. Always use IIFE — never store `t` directly

```marko
// ❌ Nothing updates after the first render
<const/t = syncMarkoTable(...) />
<for|row| of=t.getRowModel().rows> ... </for>

// ✅ New plain object every render
<const/view = (() => {
  const t = syncMarkoTable(...);
  return { tableRows: t.getRowModel().rows.map(row => ({...})) };
})() />
```

### 2. Use `checkedChange` not `onChange` for controlled checkboxes

```marko
// ❌ Preserves old visual state (Marko's uncontrolled mode)
<input type="checkbox" checked=row.isSelected onChange=(e) => {...} />

// ✅ Directly sets el.checked (Marko's controlled mode)
<input type="checkbox" checked=row.isSelected checkedChange=(v) => {...} />
```

### 3. Pre-map all TanStack objects to plain values before the template

TanStack `Row`, `Cell`, `Header`, and `Column` objects contain functions and cannot be serialized. Extract all needed values inside the IIFE:

```marko
<const/view = (() => {
  const t = syncMarkoTable(...);
  return {
    tableRows: t.getRowModel().rows.map(row => ({
      id: row.id,                      // string ✓
      isSelected: row.getIsSelected(), // boolean ✓
      cells: row.getVisibleCells().map(cell => ({
        colId: cell.column.id,         // string ✓
        value: String(flexRender(...)) // string ✓
      })),
    })),
  };
})() />
```

### 4. Avoid `>` in `<const>` expressions

Marko's HTML parser treats `>` as a tag-close character:

```marko
// ❌ Leaks "> 0 />" as text
<const/hasFilters = filters.length > 0 />

// ✅ Use truthy check or !== instead
<const/hasFilters = !!filters.length />
<const/hasFilters = filters.length !== 0 />
```

### 5. Event handlers must only close over serializable values

In SSR components, anything captured in a handler closure is serialized. Only close over `string`, `number`, `boolean`, or `<let>` signals:

```marko
// ❌ Closes over `row` (TanStack Row object — not serializable)
onClick=() => row.toggleSelected()

// ✅ Close over row.id (string), update the signal directly
onClick=() => {
  const sel = { ...(rowSelection as Record<string,boolean>) };
  if (sel[row.id]) delete sel[row.id]; else sel[row.id] = true;
  rowSelection = sel;
}
```

---

## SSR + Resume: what actually gets serialized

| In resume frame                               | Not in resume frame                           |
| --------------------------------------------- | --------------------------------------------- |
| `tableId` (string)                            | Table instance (functions, class prototype)   |
| `sorting` (array of plain objects)            | Row objects                                   |
| `pagination` (plain object)                   | Header/Cell/Column objects                    |
| `rowSelection` (plain string/boolean map)     | `flexRender` output (recomputed from signals) |
| `globalFilter` (string)                       |                                               |
| `columnFilters` (array of plain objects)      |                                               |
| `columnVisibility` (plain string/boolean map) |                                               |
| `columnSizing` (plain string/number map)      |                                               |
| `expanded` (plain string/boolean map)         |                                               |

On the server: table rows are fully rendered to HTML. On the client: Marko restores the signals from the resume frame, the first interaction triggers the IIFE, `syncMarkoTable` recreates the table instance with the correct state, and the reactive cycle proceeds.

---

## CHANGELOG

### 0.1.0

Initial release.
