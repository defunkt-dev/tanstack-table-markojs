import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  flexRender,
  generateTableId,
  getTable,
  destroyTable,
  syncMarkoTable,
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
    const unique = new Set(ids);
    expect(unique.size).toBe(20);
  });

  it("starts with 'mkt_'", () => {
    expect(generateTableId()).toMatch(/^mkt_/);
  });
});

// ── getTable / destroyTable ───────────────────────────────────────────────────

describe("getTable", () => {
  it("returns undefined for an unknown ID", () => {
    expect(getTable("nonexistent-id")).toBeUndefined();
  });

  it("returns the table instance after syncMarkoTable creates it", () => {
    const id = generateTableId();
    const setState = vi.fn();

    syncMarkoTable(
      id,
      {
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
      },
      {},
      setState,
    );

    const table = getTable<Person>(id);
    expect(table).toBeDefined();
    expect(typeof table?.getRowModel).toBe("function");

    destroyTable(id);
  });
});

describe("destroyTable", () => {
  it("removes the table from the cache", () => {
    const id = generateTableId();
    const setState = vi.fn();

    syncMarkoTable(
      id,
      {
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
      },
      {},
      setState,
    );
    expect(getTable(id)).toBeDefined();

    destroyTable(id);
    expect(getTable(id)).toBeUndefined();
  });

  it("is safe to call with an unknown ID", () => {
    expect(() => destroyTable("does-not-exist")).not.toThrow();
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
      {
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
      },
      {},
      setState,
    );
    expect(t).toBeDefined();
    expect(typeof t.getRowModel).toBe("function");
  });

  it("returns the same instance reference on subsequent calls", () => {
    const opts = {
      data: testData,
      columns: testColumns,
      getCoreRowModel: getCoreRowModel(),
    };
    const t1 = syncMarkoTable(tableId, opts, {}, setState);
    const t2 = syncMarkoTable(tableId, opts, {}, setState);
    expect(t1).toBe(t2);
  });

  it("returns all rows by default (core row model)", () => {
    const t = syncMarkoTable(
      tableId,
      {
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
      },
      {},
      setState,
    );
    expect(t.getRowModel().rows).toHaveLength(5);
  });

  it("applies sorting state", () => {
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

    const rows = t.getRowModel().rows;
    const ages = rows.map((r) => r.original.age);
    expect(ages).toEqual([22, 25, 28, 30, 35]);
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

    const ages = t.getRowModel().rows.map((r) => r.original.age);
    expect(ages).toEqual([35, 30, 28, 25, 22]);
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

    const names = t.getRowModel().rows.map((r) => r.original.name);
    expect(names).toEqual(["Charlie", "Diana"]);
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

    // Trigger an internal state change (e.g. going to next page)
    t.nextPage();

    expect(setState).toHaveBeenCalled();
    const updater = setState.mock.calls[0]?.[0];
    expect(typeof updater).toBe("function");
  });

  it("updates options when called again with new data", () => {
    const opts = {
      data: testData,
      columns: testColumns,
      getCoreRowModel: getCoreRowModel(),
    };
    const t = syncMarkoTable(tableId, opts, {}, setState);
    expect(t.getRowModel().rows).toHaveLength(5);

    const newData = testData.slice(0, 2);
    syncMarkoTable(tableId, { ...opts, data: newData }, {}, setState);
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
        globalFilter: "li", // "li" appears in "Alice" and "Charlie" only
        sorting: [{ id: "name", desc: false }],
        pagination: { pageIndex: 0, pageSize: 2 },
      },
      setState,
    );

    const names = t.getRowModel().rows.map((r) => r.original.name);
    // Filtered to [Alice, Charlie], sorted asc, page 0 size 2 = [Alice, Charlie]
    expect(names).toEqual(["Alice", "Charlie"]);
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

  it("merges provided state overrides over initialState", () => {
    const sorting: SortingState = [{ id: "name", desc: true }];
    const t = syncMarkoTable(
      tableId,
      {
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        // Caller also provides state.sorting — should win over currentState
        state: { sorting },
      },
      { sorting: [{ id: "age", desc: false }] }, // this should be overridden
      setState,
    );

    // options.state.sorting (name desc) should win
    const names = t.getRowModel().rows.map((r) => r.original.name);
    expect(names[0]).toBe("Eve"); // E comes last alphabetically desc
  });
});

// ── Column visibility ──────────────────────────────────────────────────────────

describe("syncMarkoTable — column visibility", () => {
  let tableId: string;
  const setState = vi.fn();

  beforeEach(() => {
    tableId = generateTableId();
  });
  afterEach(() => {
    destroyTable(tableId);
  });

  it("hides columns via columnVisibility state", () => {
    const t = syncMarkoTable(
      tableId,
      {
        data: testData,
        columns: testColumns,
        getCoreRowModel: getCoreRowModel(),
      },
      { columnVisibility: { age: false } },
      setState,
    );

    const visibleIds = t.getVisibleLeafColumns().map((c) => c.id);
    expect(visibleIds).not.toContain("age");
    expect(visibleIds).toContain("name");
    expect(visibleIds).toContain("status");
  });
});

// ── Multi-sort ─────────────────────────────────────────────────────────────────

describe("syncMarkoTable — multi-sort", () => {
  let tableId: string;
  const setState = vi.fn();

  beforeEach(() => {
    tableId = generateTableId();
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

    const result = t
      .getRowModel()
      .rows.map((r) => `${r.original.name}:${r.original.age}`);
    expect(result).toEqual(["Alice:25", "Alice:30", "Bob:25"]);
  });
});
