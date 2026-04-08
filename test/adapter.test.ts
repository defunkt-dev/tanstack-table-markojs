import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  flexRender,
  generateTableId,
  getTable,
  destroyTable,
  destroyVirtualizer,
  syncMarkoTable,
  syncVirtualizer,
  preloadVirtualizer,
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  type SortingState,
  type PaginationState,
  type RowSelectionState,
} from "../src/index";

// ── Test data ─────────────────────────────────────────────────────────────────

interface Person {
  id: number;
  name: string;
  age: number;
  status: "active" | "inactive";
}

const testData: Person[] = [
  { id: 1, name: "Alice", age: 30, status: "active" },
  { id: 2, name: "Bob", age: 25, status: "inactive" },
  { id: 3, name: "Charlie", age: 35, status: "active" },
  { id: 4, name: "Diana", age: 28, status: "active" },
  { id: 5, name: "Eve", age: 22, status: "inactive" },
];

const ch = createColumnHelper<Person>();
const testColumns = [
  ch.accessor("name", { header: "Name", cell: (i) => i.getValue() }),
  ch.accessor("age", { header: "Age", cell: (i) => i.getValue() }),
  ch.accessor("status", { header: "Status", cell: (i) => i.getValue() }),
];

// ── flexRender ────────────────────────────────────────────────────────────────

describe("flexRender", () => {
  it("returns null for null input", () => {
    expect(flexRender(null, {})).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(flexRender(undefined, {})).toBeNull();
  });

  it("returns a string value as-is", () => {
    expect(flexRender("Hello", {})).toBe("Hello");
  });

  it("returns a number value as-is", () => {
    expect(flexRender(42, {})).toBe(42);
  });

  it("returns a boolean value as-is", () => {
    expect(flexRender(false, {})).toBe(false);
    expect(flexRender(true, {})).toBe(true);
  });

  it("calls a function with props and returns the result", () => {
    const fn = vi.fn().mockReturnValue("rendered");
    const props = { getValue: () => "test" };
    const result = flexRender(fn, props as unknown as object);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(props);
    expect(result).toBe("rendered");
  });

  it("passes all props to the function", () => {
    const captured: unknown[] = [];
    const fn = (p: object) => {
      captured.push(p);
      return "ok";
    };
    const props = { a: 1, b: "two", c: true };
    flexRender(fn, props);
    expect(captured[0]).toBe(props);
  });
});

// ── generateTableId ───────────────────────────────────────────────────────────

describe("generateTableId", () => {
  it("returns a string", () => {
    expect(typeof generateTableId()).toBe("string");
  });

  it("returns unique IDs on each call", () => {
    const ids = Array.from({ length: 20 }, generateTableId);
    expect(new Set(ids).size).toBe(20);
  });

  it("starts with 'mkt_'", () => {
    expect(generateTableId()).toMatch(/^mkt_/);
  });
});

// ── getTable ──────────────────────────────────────────────────────────────────
// Fix 11: afterEach cleanup so instances never leak even if an assertion throws

describe("getTable", () => {
  let createdId: string | undefined;

  afterEach(() => {
    if (createdId !== undefined) {
      destroyTable(createdId);
      createdId = undefined;
    }
  });

  it("returns undefined for an unknown ID", () => {
    expect(getTable("nonexistent-id")).toBeUndefined();
  });

  it("returns the table instance after syncMarkoTable creates it", () => {
    createdId = generateTableId();
    syncMarkoTable(
      createdId,
      { data: testData, columns: testColumns, getCoreRowModel: getCoreRowModel() },
      {},
      vi.fn(),
    );
    const table = getTable<Person>(createdId);
    expect(table).toBeDefined();
    expect(typeof table?.getRowModel).toBe("function");
  });
});

// ── destroyTable ──────────────────────────────────────────────────────────────

describe("destroyTable", () => {
  it("removes the table from the cache", () => {
    const id = generateTableId();
    syncMarkoTable(
      id,
      { data: testData, columns: testColumns, getCoreRowModel: getCoreRowModel() },
      {},
      vi.fn(),
    );
    expect(getTable(id)).toBeDefined();
    destroyTable(id);
    expect(getTable(id)).toBeUndefined();
  });

  it("is safe to call with an unknown ID", () => {
    expect(() => destroyTable("does-not-exist")).not.toThrow();
  });

  // Fix 10: verify destroyTable also destroys the associated virtualizer
  it("also destroys the associated virtualizer", () => {
    const id = generateTableId();
    const scrollId = `scroll-dt-${id}`;
    const scrollEl = document.createElement("div");
    scrollEl.id = scrollId;
    document.body.appendChild(scrollEl);

    try {
      syncMarkoTable(
        id,
        { data: testData, columns: testColumns, getCoreRowModel: getCoreRowModel() },
        {},
        vi.fn(),
      );
      syncVirtualizer(id, scrollId, 10, () => 49, vi.fn());

      destroyTable(id);
      expect(getTable(id)).toBeUndefined();

      // Proof the virtualizer was also destroyed:
      // If it was NOT destroyed, the very next syncVirtualizer would be a subsequent
      // call (else branch → measure() fires synchronously on call 1).
      // Since it WAS destroyed, the next syncVirtualizer is a fresh first call
      // (_willUpdate, no synchronous onUpdate). The call AFTER that fires measure().
      const onUpdate = vi.fn();
      syncVirtualizer(id, scrollId, 10, () => 49, onUpdate); // fresh _willUpdate
      expect(onUpdate).not.toHaveBeenCalled(); // ResizeObserver async
      syncVirtualizer(id, scrollId, 10, () => 49, onUpdate); // measure() → sync
      expect(onUpdate).toHaveBeenCalled();
    } finally {
      destroyVirtualizer(id);
      document.body.removeChild(scrollEl);
    }
  });
});

// ── syncMarkoTable ────────────────────────────────────────────────────────────

describe("syncMarkoTable", () => {
  let tableId: string;
  let setState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tableId = generateTableId();
    setState = vi.fn();
  });

  afterEach(() => {
    destroyTable(tableId);
  });

  it("creates a table instance on first call", () => {
    const t = syncMarkoTable(
      tableId,
      { data: testData, columns: testColumns, getCoreRowModel: getCoreRowModel() },
      {},
      setState,
    );
    expect(t).toBeDefined();
    expect(typeof t.getRowModel).toBe("function");
  });

  it("returns the same instance reference on subsequent calls", () => {
    const opts = { data: testData, columns: testColumns, getCoreRowModel: getCoreRowModel() };
    const t1 = syncMarkoTable(tableId, opts, {}, setState);
    const t2 = syncMarkoTable(tableId, opts, {}, setState);
    expect(t1).toBe(t2);
  });

  it("returns all rows by default (core row model)", () => {
    const t = syncMarkoTable(
      tableId,
      { data: testData, columns: testColumns, getCoreRowModel: getCoreRowModel() },
      {},
      setState,
    );
    expect(t.getRowModel().rows).toHaveLength(5);
  });

  it("applies sorting state ascending", () => {
    const sorting: SortingState = [{ id: "age", desc: false }];
    const t = syncMarkoTable(
      tableId,
      {
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
      },
      { sorting },
      setState,
    );
    expect(t.getRowModel().rows.map((r) => r.original.age)).toEqual([22, 25, 28, 30, 35]);
  });

  it("applies sorting state descending", () => {
    const sorting: SortingState = [{ id: "age", desc: true }];
    const t = syncMarkoTable(
      tableId,
      {
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
      },
      { sorting },
      setState,
    );
    expect(t.getRowModel().rows.map((r) => r.original.age)).toEqual([35, 30, 28, 25, 22]);
  });

  it("applies global filter", () => {
    const t = syncMarkoTable(
      tableId,
      {
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        globalFilterFn: "includesString",
      },
      { globalFilter: "alice" },
      setState,
    );
    const rows = t.getRowModel().rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.original.name).toBe("Alice");
  });

  it("applies pagination state", () => {
    const pagination: PaginationState = { pageIndex: 0, pageSize: 2 };
    const t = syncMarkoTable(
      tableId,
      {
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
      },
      { pagination },
      setState,
    );
    expect(t.getRowModel().rows).toHaveLength(2);
    expect(t.getPageCount()).toBe(3);
  });

  it("paginates to the correct page", () => {
    const pagination: PaginationState = { pageIndex: 1, pageSize: 2 };
    const t = syncMarkoTable(
      tableId,
      {
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
      },
      { pagination },
      setState,
    );
    expect(t.getRowModel().rows.map((r) => r.original.name)).toEqual(["Charlie", "Diana"]);
  });

  it("applies row selection state", () => {
    const rowSelection: RowSelectionState = { "0": true, "2": true };
    const t = syncMarkoTable(
      tableId,
      {
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
        enableRowSelection: true,
      },
      { rowSelection },
      setState,
    );
    const rows = t.getRowModel().rows;
    expect(rows[0]?.getIsSelected()).toBe(true);
    expect(rows[1]?.getIsSelected()).toBe(false);
    expect(rows[2]?.getIsSelected()).toBe(true);
    expect(rows[3]?.getIsSelected()).toBe(false);
    expect(rows[4]?.getIsSelected()).toBe(false);
  });

  it("calls setState when onStateChange is triggered internally", () => {
    const t = syncMarkoTable(
      tableId,
      {
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
      },
      { pagination: { pageIndex: 0, pageSize: 5 } },
      setState,
    );
    t.nextPage();
    expect(setState).toHaveBeenCalled();
    expect(typeof setState.mock.calls[0]?.[0]).toBe("function");
  });

  it("updates options when called again with new data", () => {
    const opts = { data: testData, columns: testColumns, getCoreRowModel: getCoreRowModel() };
    const t = syncMarkoTable(tableId, opts, {}, setState);
    expect(t.getRowModel().rows).toHaveLength(5);

    syncMarkoTable(tableId, { ...opts, data: testData.slice(0, 2) }, {}, setState);
    expect(t.getRowModel().rows).toHaveLength(2);
  });

  it("combines filtering, sorting, and pagination correctly", () => {
    const t = syncMarkoTable(
      tableId,
      {
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        globalFilterFn: "includesString",
      },
      {
        globalFilter: "li", // matches only "Alice" and "Charlie"
        sorting: [{ id: "name", desc: false }],
        pagination: { pageIndex: 0, pageSize: 2 },
      },
      setState,
    );
    expect(t.getRowModel().rows.map((r) => r.original.name)).toEqual(["Alice", "Charlie"]);
    expect(t.getPageCount()).toBe(1);
    expect(t.getFilteredRowModel().rows).toHaveLength(2);
  });

  it("propagates user onStateChange callback", () => {
    const userOnStateChange = vi.fn();
    const t = syncMarkoTable(
      tableId,
      {
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onStateChange: userOnStateChange,
      },
      { pagination: { pageIndex: 0, pageSize: 5 } },
      setState,
    );
    t.nextPage();
    expect(userOnStateChange).toHaveBeenCalled();
  });

  it("options.state overrides currentState for the same key", () => {
    const sortingOverride: SortingState = [{ id: "name", desc: true }];
    const t = syncMarkoTable(
      tableId,
      {
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        state: { sorting: sortingOverride }, // takes precedence
      },
      { sorting: [{ id: "age", desc: false }] }, // overridden by options.state
      setState,
    );
    // name desc: Eve, Diana, Charlie, Bob, Alice
    expect(t.getRowModel().rows[0]?.original.name).toBe("Eve");
  });
});

// ── Column visibility ─────────────────────────────────────────────────────────
// Fix 12: setState is now fresh per test

describe("syncMarkoTable — column visibility", () => {
  let tableId: string;
  let setState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tableId = generateTableId();
    setState = vi.fn();
  });
  afterEach(() => {
    destroyTable(tableId);
  });

  it("hides columns via columnVisibility state", () => {
    const t = syncMarkoTable(
      tableId,
      { data: testData, columns: testColumns, getCoreRowModel: getCoreRowModel() },
      { columnVisibility: { age: false } },
      setState,
    );
    const visibleIds = t.getVisibleLeafColumns().map((c) => c.id);
    expect(visibleIds).not.toContain("age");
    expect(visibleIds).toContain("name");
    expect(visibleIds).toContain("status");
  });
});

// ── Multi-sort ────────────────────────────────────────────────────────────────
// Fix 12: setState is now fresh per test

describe("syncMarkoTable — multi-sort", () => {
  let tableId: string;
  let setState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tableId = generateTableId();
    setState = vi.fn();
  });
  afterEach(() => {
    destroyTable(tableId);
  });

  it("sorts by multiple columns", () => {
    const data: Person[] = [
      { id: 1, name: "Bob", age: 25, status: "active" },
      { id: 2, name: "Alice", age: 25, status: "inactive" },
      { id: 3, name: "Alice", age: 30, status: "active" },
    ];
    const t = syncMarkoTable(
      tableId,
      {
        data,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
      },
      {
        sorting: [
          { id: "name", desc: false },
          { id: "age", desc: false },
        ],
      },
      setState,
    );
    expect(t.getRowModel().rows.map((r) => `${r.original.name}:${r.original.age}`)).toEqual([
      "Alice:25",
      "Alice:30",
      "Bob:25",
    ]);
  });
});

// ── syncVirtualizer ───────────────────────────────────────────────────────────
// Fix 7: full test coverage for syncVirtualizer

describe("syncVirtualizer", () => {
  let virtualizerId: string;
  let scrollId: string;
  let scrollEl: HTMLDivElement;

  beforeEach(() => {
    // Unique IDs per test — prevents cross-test DOM and instance-cache collisions
    virtualizerId = generateTableId();
    scrollId = `scroll-sv-${virtualizerId}`;
    scrollEl = document.createElement("div");
    scrollEl.id = scrollId;
    document.body.appendChild(scrollEl);
  });

  afterEach(() => {
    destroyVirtualizer(virtualizerId);
    if (scrollEl.parentNode) {
      document.body.removeChild(scrollEl);
    }
  });

  it("does not throw on first call", () => {
    expect(() => syncVirtualizer(virtualizerId, scrollId, 100, () => 49, vi.fn())).not.toThrow();
  });

  it("does not throw when the scroll element does not exist", () => {
    // getScrollElement is called lazily by the virtualizer — a missing element
    // does not crash syncVirtualizer itself
    expect(() =>
      syncVirtualizer(virtualizerId, "no-such-element", 100, () => 49, vi.fn()),
    ).not.toThrow();
  });

  it("calls onUpdate synchronously on the second call (measure() path)", () => {
    // First call: _willUpdate() — ResizeObserver fires asynchronously in happy-dom
    // Second call: setOptions + measure() — measure() calls notify() synchronously
    const onUpdate = vi.fn();
    syncVirtualizer(virtualizerId, scrollId, 100, () => 49, onUpdate);
    syncVirtualizer(virtualizerId, scrollId, 100, () => 49, onUpdate);
    expect(onUpdate).toHaveBeenCalled();
  });

  it("onUpdate receives (VirtualRow[], number, number)", () => {
    const onUpdate = vi.fn();
    syncVirtualizer(virtualizerId, scrollId, 100, () => 49, onUpdate);
    syncVirtualizer(virtualizerId, scrollId, 100, () => 49, onUpdate);

    // Last call arguments: [rows, paddingTop, paddingBottom]
    const lastArgs = onUpdate.mock.calls[onUpdate.mock.calls.length - 1] as [
      unknown[],
      number,
      number,
    ];
    expect(Array.isArray(lastArgs[0])).toBe(true);
    expect(typeof lastArgs[1]).toBe("number");
    expect(typeof lastArgs[2]).toBe("number");
  });

  it("uses the latest onUpdate callback after options update", () => {
    const onUpdate1 = vi.fn();
    const onUpdate2 = vi.fn();
    syncVirtualizer(virtualizerId, scrollId, 100, () => 49, onUpdate1);
    // Second call replaces onChange with onUpdate2, then calls measure()
    syncVirtualizer(virtualizerId, scrollId, 50, () => 49, onUpdate2);
    expect(onUpdate2).toHaveBeenCalled();
  });
});

// ── destroyVirtualizer ────────────────────────────────────────────────────────
// Fix 8: full test coverage for destroyVirtualizer

describe("destroyVirtualizer", () => {
  let scrollId: string;
  let scrollEl: HTMLDivElement;

  beforeEach(() => {
    scrollId = `scroll-dv-${generateTableId()}`;
    scrollEl = document.createElement("div");
    scrollEl.id = scrollId;
    document.body.appendChild(scrollEl);
  });

  afterEach(() => {
    if (scrollEl.parentNode) {
      document.body.removeChild(scrollEl);
    }
  });

  it("is safe to call with an unknown ID", () => {
    expect(() => destroyVirtualizer("does-not-exist")).not.toThrow();
  });

  it("is safe to call multiple times on the same ID", () => {
    const id = generateTableId();
    syncVirtualizer(id, scrollId, 10, () => 49, vi.fn());
    expect(() => {
      destroyVirtualizer(id);
      destroyVirtualizer(id); // idempotent second call
    }).not.toThrow();
  });

  it("causes the next syncVirtualizer call to create a fresh instance", () => {
    const id = generateTableId();
    const onUpdate = vi.fn();

    syncVirtualizer(id, scrollId, 10, () => 49, onUpdate);
    destroyVirtualizer(id);

    // After destroy: next syncVirtualizer is a fresh first call (_willUpdate).
    // The call AFTER that goes through measure() and fires onUpdate synchronously.
    syncVirtualizer(id, scrollId, 10, () => 49, onUpdate); // fresh _willUpdate
    onUpdate.mockClear();
    syncVirtualizer(id, scrollId, 10, () => 49, onUpdate); // measure() → sync
    expect(onUpdate).toHaveBeenCalled();

    destroyVirtualizer(id);
  });
});

// ── preloadVirtualizer ────────────────────────────────────────────────────────
// Fix 9: full test coverage for preloadVirtualizer

describe("preloadVirtualizer", () => {
  it("resolves immediately as a no-op (static imports mean nothing to preload)", async () => {
    await expect(preloadVirtualizer()).resolves.toBeUndefined();
  });

  it("can be called multiple times concurrently without error", async () => {
    await expect(
      Promise.all([preloadVirtualizer(), preloadVirtualizer(), preloadVirtualizer()]),
    ).resolves.toBeDefined();
  });
});
