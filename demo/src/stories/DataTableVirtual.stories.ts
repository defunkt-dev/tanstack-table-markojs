import type { Meta, StoryObj } from "@storybook/marko";
import DataTableVirtual from "../routes/virtual/components/data-table-virtual.marko";
import type { Person } from "./sample-data";
import { BASE_DATA, LARGE_DATA } from "./sample-data";

// ── Types ─────────────────────────────────────────────────────────────────────

type Input = { data: Person[] };

// Same pattern as DataTableClient: `satisfies Meta<any>` avoids the
// Template<unknown> / Template<Input> invariance mismatch from the ambient
// "*.marko" module declaration. `StoryObj<Input>` provides precise
// `args: Partial<Input>` typing on each story.
const meta = {
  title: "Tables/Virtualized",
  component: DataTableVirtual,
  parameters: {
    docs: {
      description: {
        component: [
          "Row-virtualised table built with **marko-table** + **@tanstack/virtual-core** v3.",
          "",
          "Only the ~15 rows visible in the viewport are in the DOM at any time,",
          "regardless of dataset size. Padding `<tr>` elements maintain scroll height.",
          "",
          "The `<effect>` driving `syncVirtualizer` re-runs whenever the filtered",
          "row count changes, calling `measure()` for synchronous recalculation.",
          "",
          "**Features:** sorting · global search · per-column filters",
          "· column visibility · row selection (check-all) · column resizing",
          "· no pagination (virtualisation replaces it)",
        ].join("\n"),
      },
    },
  },
  argTypes: {
    data: {
      description:
        "Array of `Person` objects. Can be arbitrarily large — only visible rows are in the DOM.",
      control: false,
    },
  },
} satisfies Meta<any>;

export default meta;

type Story = StoryObj<Input>;

// ── Stories ───────────────────────────────────────────────────────────────────

/**
 * Full 1,000-row dataset — the primary showcase.
 * Scroll the table and observe in DevTools that only ~15 rows exist in the DOM
 * regardless of scroll position.
 */
export const OneThousandRows: Story = {
  name: "1,000 Rows",
  args: { data: LARGE_DATA },
};

/** 100 rows — smaller dataset, still virtualised. */
export const OneHundredRows: Story = {
  name: "100 Rows",
  args: { data: LARGE_DATA.slice(0, 100) },
};

/**
 * 20 rows — same as the client-only stories.
 * The entire list fits in one viewport; confirms the virtualiser
 * degrades gracefully for small datasets.
 */
export const TwentyRows: Story = {
  name: "20 Rows (fits in viewport)",
  args: { data: BASE_DATA },
};

/** Active users only — verifies row-count changes drive `syncVirtualizer`. */
export const ActiveUsersOnly: Story = {
  name: "Active Users Only",
  args: { data: LARGE_DATA.filter((p) => p.status === "active") },
};

/** Empty state — verifies "No results found." when virtualiser receives count = 0. */
export const Empty: Story = {
  name: "Empty State",
  args: { data: [] },
};
