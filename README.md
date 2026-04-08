<p align="center">
  <img src="./assets/marko.svg" alt="Marko" height="60" />
  &nbsp;&nbsp;+&nbsp;&nbsp;
  <img src="./assets/tanstack.png" alt="TanStack" height="60" />
</p>

# tanstack-table-markojs

> Marko 6 adapter for [@tanstack/table-core](https://tanstack.com/table) — SSR, CSR, and virtualized tables with full resumability support.

## Features

- ✅ **All TanStack Table features** — sorting, filtering, pagination, row selection, column visibility/ordering/pinning/resizing, row expansion, grouping, aggregation, faceted values, server-side mode
- ✅ **SSR + Resumability** — table rows are server-rendered; only serializable state (sorting, pagination, etc.) is in the resume frame
- ✅ **Client-only mode** — simpler code when SSR isn't needed
- ✅ **Row virtualization** — `@tanstack/virtual-core` v3 integration for 100k+ row datasets
- ✅ **TypeScript** — full type safety including column definitions and row data

## Installation

```bash
npm install tanstack-table-markojs @tanstack/table-core
# optional: for virtualized tables
npm install @tanstack/virtual-core
```

---

## Marko 6 resumability — the full picture

### What Marko 6's resumability promises

Marko's resumability model means **zero JS re-execution on the client**. The server renders HTML, serializes all reactive state into the page as JSON (the "resume frame"), and the client picks up exactly where the server left off — without re-running any initialization code. This is fundamentally different from hydration (React, Vue) where the whole component tree re-executes on the client to attach event listeners.

The three rules that govern how this adapter works:

**Rule 1 — `<const>` does not re-run on the client until a `<let>` signal changes.**
When Marko resumes, `<const>` values are restored from the resume frame. The expression is not re-evaluated. This is what makes resumability zero-cost — but it also means that if `syncMarkoTable` returns the same object reference every call (which it does, from the module-level Map), Marko's `_const` sees `prev === next` and skips all downstream updates forever. This is why the IIFE is mandatory.

**Rule 2 — Anything inside an event handler closure gets serialized.**
When Marko writes the resume frame, it serializes not just `<let>` signals but also any values captured in event handler closures. If your `onClick` closes over a TanStack `Row` or `Table` object, Marko tries to `JSON.stringify` it — and throws:
```
Unable to serialize "t" in src/routes/components/data-table.marko
  (reading _features[0].createTable)
```
This was the exact error that appeared when `<const/t = syncMarkoTable(...)>` stored the table instance in Marko scope. The IIFE fixes it by keeping `t` as a local JavaScript variable that never touches the Marko scope — the resume frame only sees the plain serializable object returned by the IIFE.

**Rule 3 — Only JSON-expressible values can survive the server→client boundary.**
The resume frame is JSON embedded in the HTML. Primitive values and plain objects round-trip perfectly. A TanStack Table instance contains functions, class prototypes, and closures — `JSON.stringify` throws on all of them. Only the state the instance operates on (sorting arrays, pagination objects, etc.) can be serialized. The instance itself cannot.

### What "not serializable" actually means

When you see a serialization error, Marko is telling you: "I tried to write this value into the JSON resume frame, and failed." The value that failed was the TanStack Table instance — specifically `_features[0].createTable`, a function on the instance's prototype chain.

The fix in every case is the same: **move the non-serializable value out of Marko scope entirely**. The IIFE does this — `t` is a plain local JavaScript variable inside a function. It never appears in any Marko `<let>` or `<const>` assignment at the top level of the template, so Marko never tries to serialize it.

The same rule applies to event handlers in SSR components. If your `onChange` handler closes over `h` (a TanStack `Header` object), Marko will try to serialize `h` and fail. The fix: close only over `h.colId` (a string) and the `<let>` signals. Strings and signals are serializable; TanStack objects are not.

### The philosophical gap — this is NOT true resumability

True Marko resumability would mean: `syncMarkoTable` runs **only on the server**, the table instance is somehow encoded in the resume frame, and the client resumes from that exact instance without re-running anything. That is not what we have.

What we actually have is the **closest possible approximation**:

- The meaningful state (`sorting`, `pagination`, `rowSelection`, etc.) **is** fully serialized and resumes with zero re-execution ✓
- The table instance (the computation engine) **cannot** be serialized — it is recreated on the client the **first time a `<let>` signal changes** via the IIFE expression re-running

The gap: that first `createTable()` call on the client, triggered by the first user interaction. It takes ~1–2ms, is invisible to users, and produces an instance with identical behaviour to the server's. But philosophically, it is re-execution — which means this adapter cannot claim true resumability.

To achieve true resumability with a data table you would need one of:

1. **TanStack Table supporting serialization** — it doesn't and likely won't; the instance is inherently stateful with functions and closures throughout
2. **Pure functions over serializable state** — implement sorting, filtering, and pagination yourself as `sortData(rows, sorting)`, `filterData(rows, filter)` etc., skipping TanStack Table entirely
3. **Server-side computation with server actions** — run all table logic on the server, fetch updated rows on each interaction — trading client-side reactivity for genuine zero-JS resumability

None of these tradeoffs are worth it for most applications. The right call is what this adapter does: serialize everything that can be serialized, recreate what cannot be cheaply on first interaction. The output is identical. The cost is one imperceptible `createTable()` call.

### Why the IIFE solves the serialization error

When `<const/t = syncMarkoTable(...)>` is written at the top level of a Marko template, Marko stores `t` in the component scope — the same scope that gets serialized into the resume frame. When Marko encounters a non-serializable value in that scope, it throws the serialization error.

The IIFE wraps `syncMarkoTable` in a function that returns a new plain object:

```marko
<const/view = (() => {
  const t = syncMarkoTable(...);  // t is a local JS variable — never in Marko scope
  return {
    tableRows: t.getRowModel().rows.map(row => ({
      id: row.id,          // string — serializable ✓
      isSelected: row.getIsSelected(),  // boolean — serializable ✓
    })),
    pageCount: t.getPageCount(),  // number — serializable ✓
  };
})() />
```

`view` is what Marko stores in scope — a plain object of strings, numbers, booleans, and arrays of plain objects. All serializable. `t` never appears in the scope at all.

This pattern also solves the `_const` same-reference problem: the IIFE returns a **new object** every render (new reference) — Marko's `!==` check always passes and downstream updates always propagate. If `t` were stored directly, the same Table instance reference would return every render and Marko would skip all updates after the first.

---

## Core concept: the IIFE pattern

The single most important thing to understand is **why** this adapter uses an IIFE for the `<const>`.

Marko's `_const` runtime function uses strict reference equality (`!==`) to detect changes:

```js
// Marko runtime (simplified)
function _const(key, fn) {
  return (scope, value) => {
    if (scope[key] !== value) {  // ← strict equality
      scope[key] = value;
      fn(scope);                 // only propagates if value changed
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
} from "tanstack-table-markojs";

export interface Input { data: Person[] }
export interface Person { id: number; name: string; age: number }

static const ch = createColumnHelper<Person>();
static const columns = [
  ch.accessor("name", { header: "Name", cell: i => i.getValue() }),
  ch.accessor("age",  { header: "Age",  cell: i => i.getValue() }),
];

// ── Serializable state in <let> ───────────────────────────────────────────────
// These are written to the resume frame. Every value must be JSON-serializable.
// Use `as Type` casts on empty arrays/objects so the Marko language server
// infers the correct type rather than `never[]` or `{}`.
<let/tableId = generateTableId() />
<let/sorting = ([] as SortingState) />
<let/pagination = ({ pageIndex: 0, pageSize: 10 } as PaginationState) />
<let/rowSelection = ({} as RowSelectionState) />
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
      // Cast nxt as typeof cur so property accesses are typed correctly
      const nxt = (typeof updater === "function" ? updater(cur) : updater) as typeof cur;
      if (nxt.sorting !== sorting) sorting = nxt.sorting;
      if (nxt.pagination !== pagination) pagination = nxt.pagination;
      if (nxt.rowSelection !== rowSelection) rowSelection = nxt.rowSelection;
      if (nxt.globalFilter !== globalFilter) globalFilter = nxt.globalFilter;
    },
  );

  return {
    tableRows: t.getRowModel().rows.map(row => ({
      id: row.id,
      isSelected: row.getIsSelected(),
      original: { ...row.original },
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

<script() { return () => destroyTable(tableId) } />

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
  type SortingState, type PaginationState } from "tanstack-table-markojs";

<let/mounted = false />
<let/tableId = generateTableId() />
<let/sorting = ([] as SortingState) />
<let/pagination = ({ pageIndex: 0, pageSize: 10 } as PaginationState) />

<script() { mounted = true } />
<script() { return () => destroyTable(tableId) } />

<if=!mounted>
  <div>Loading...</div>
</if>

<if=mounted>
  // Same IIFE pattern — same-reference issue applies regardless of SSR
  <const/view = (() => {
    const t = syncMarkoTable(tableId, { ... }, { sorting, pagination }, (updater) => {
      const cur = { sorting, pagination };
      const nxt = (typeof updater === "function" ? updater(cur) : updater) as typeof cur;
      if (nxt.sorting !== sorting) sorting = nxt.sorting;
      if (nxt.pagination !== pagination) pagination = nxt.pagination;
    });
    return {
      tableRows: t.getRowModel().rows.map(row => ({ ... })),
      // ... etc
    };
  })() />

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
} from "tanstack-table-markojs";

<let/mounted = false />
<let/tableId = generateTableId() />
<let/sorting = ([] as SortingState) />
<let/globalFilter = "" />
// VirtualRow elements are plain objects — serializable
<let/virtualRows = ([] as VirtualRow[]) />
<let/paddingTop = 0 />
<let/paddingBottom = 0 />

<script() { mounted = true } />
<script() { return () => destroyTable(tableId) } />

<if=mounted>
  <const/view = (() => {
    const t = syncMarkoTable(
      tableId,
      { data: input.data, columns, getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel() },
      { sorting, globalFilter },
      (updater) => {
        const cur = { sorting, globalFilter };
        const nxt = (typeof updater === "function" ? updater(cur) : updater) as typeof cur;
        if (nxt.sorting !== sorting) sorting = nxt.sorting;
        if (nxt.globalFilter !== globalFilter) globalFilter = nxt.globalFilter;
      },
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
  <script() {
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

| Parameter | Type | Description |
|---|---|---|
| `tableId` | `string` | ID from `generateTableId()`, stored in `<let>` |
| `options` | `TableOptions<TData>` | Any valid TanStack Table options |
| `currentState` | `Record<string, unknown>` | Current values of all state `<let>` signals |
| `setState` | `(updater) => void` | Writes TanStack state changes back to Marko signals |

Returns: `Table<TData>` — the live table instance (same reference every call).

**Important:** Always call inside an IIFE assigned to `<const>`. Never store `t` directly in Marko scope.

---

### `generateTableId()`

Returns a unique string ID. Store in `<let/tableId = generateTableId() />` — it's serializable and survives SSR→client.

---

### `getTable<TData>(id)`

Retrieves a table instance from the module cache by ID. Use in event handlers that can't close over `t` (SSR components).

```marko
onClick=() => getTable(tableId)?.firstPage()
```

---

### `destroyTable(id)`

Removes the table instance from the cache. Call in `<script>` cleanup.

```marko
<script() { return () => destroyTable(tableId) } />
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

| Parameter | Type | Description |
|---|---|---|
| `tableId` | `string` | Same ID as `syncMarkoTable` |
| `scrollElId` | `string` | `id` attribute of the scroll container |
| `count` | `number` | Total filtered row count |
| `estimateSize` | `(i: number) => number` | Estimated row height in pixels |
| `onUpdate` | `(rows, paddingTop, paddingBottom) => void` | Called when virtual items change |

Call inside `<script>` so the scroll container exists in the DOM.

---

### `destroyVirtualizer(id)`

Removes a virtualizer instance from the cache. Called automatically by `destroyTable`.

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

### 2. Use `as` casts on typed `<let>` initial values

The Marko language server infers `never[]` from `[]` and `{}` without a type hint. Use `as` casts so types resolve correctly:

```marko
// ❌ Language server infers never[] — downstream type errors
<let/sorting: SortingState = [] />

// ✅ Type inferred correctly from the cast
<let/sorting = ([] as SortingState) />
<let/rowSelection = ({} as RowSelectionState) />
```

### 3. Cast `nxt as typeof cur` in the setState callback

`syncMarkoTable`'s `setState` is typed as `Updater<Record<string, unknown>>`, so `updater(cur)` returns `Record<string, unknown>` — every property access is `unknown` without the cast:

```marko
(updater) => {
  const cur = { sorting, pagination };
  // ✅ Cast nxt so nxt.sorting has type SortingState, not unknown
  const nxt = (typeof updater === "function" ? updater(cur) : updater) as typeof cur;
  if (nxt.sorting !== sorting) sorting = nxt.sorting;
}
```

### 4. Use `checkedChange` not `onChange` for controlled checkboxes

```marko
// ❌ Preserves old visual state (Marko's uncontrolled mode)
<input type="checkbox" checked=row.isSelected onChange=(e) => {...} />

// ✅ Directly sets el.checked (Marko's controlled mode)
<input type="checkbox" checked=row.isSelected checkedChange=(v) => {...} />
```

### 5. Pre-map all TanStack objects to plain values before the template

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

### 6. Use `<script>` not `<effect>`

`<effect>` is deprecated. Use `<script>` for all side effects and cleanup:

```marko
// ❌ Deprecated
<effect() { mounted = true } />
<effect() { return () => destroyTable(tableId) } />

// ✅ Current
<script() { mounted = true } />
<script() { return () => destroyTable(tableId) } />
```

### 7. Avoid `>` in `<const>` expressions

Marko's HTML parser treats `>` as a tag-close character:

```marko
// ❌ Leaks "> 0 />" as text
<const/hasFilters = filters.length > 0 />

// ✅ Use truthy check or !== instead
<const/hasFilters = !!filters.length />
```

### 8. Event handlers must only close over serializable values

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

| In resume frame | Not in resume frame |
|---|---|
| `tableId` (string) | Table instance (functions, class prototype) |
| `sorting` (array of plain objects) | Row objects |
| `pagination` (plain object) | Header/Cell/Column objects |
| `rowSelection` (plain string/boolean map) | `flexRender` output (recomputed from signals) |
| `globalFilter` (string) | |
| `columnFilters` (array of plain objects) | |
| `columnVisibility` (plain string/boolean map) | |
| `columnSizing` (plain string/number map) | |
| `expanded` (plain string/boolean map) | |

On the server: table rows are fully rendered to HTML. On the client: Marko restores the signals from the resume frame, the first interaction triggers the IIFE, `syncMarkoTable` recreates the table instance with the correct state, and the reactive cycle proceeds.

---

## CHANGELOG

### 0.1.1

Initial release. 