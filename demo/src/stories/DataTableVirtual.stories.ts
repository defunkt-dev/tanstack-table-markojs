import type { Meta, StoryObj } from "@storybook/marko";
import DataTableVirtual from "../routes/virtualized/components/data-table-virtual.marko";
import type { Person } from "./sample-data";
import { BASE_DATA, LARGE_DATA } from "./sample-data";

// ── Meta ─────────────────────────────────────────────────────────────────────

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
          "regardless of how many rows are in the dataset. Padding `<tr>` elements",
          "above and below the visible window maintain the correct scroll height.",
          "",
          "Virtualisation is client-only (`<if=mounted>` guard). The `<effect>` that",
          "drives `syncVirtualizer` re-runs whenever the filtered row count changes,",
          "calling `measure()` to force a synchronous recalculation.",
          "",
          "**Features:** sorting · global search · per-column filters · column visibility",
          "· row selection (check-all) · column resizing · no pagination",
        ].join("\n"),
      },
    },
  },
  argTypes: {
    data: {
      description: "Array of `Person` objects. Can be arbitrarily large — only visible rows are rendered.",
      control: false,
    },
  },
} satisfies Meta<{ data: Person[] }>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Stories ──────────────────────────────────────────────────────────────────

/**
 * Full 1,000-row dataset — the primary showcase story.
 * Scroll the table to watch row virtualisation in action.
 * Open DevTools → Elements and observe that only ~15 rows exist in the DOM
 * at any time regardless of scroll position.
 */
export const OneThousandRows: Story = {
  name: "1,000 Rows",
  args: {
    data: LARGE_DATA,
  },
};

/**
 * 100 rows — smaller dataset, still virtualised.
 * Useful for verifying that the virtualiser initialises correctly
 * when the full dataset fits within a few viewports.
 */
export const OneHundredRows: Story = {
  name: "100 Rows",
  args: {
    data: LARGE_DATA.slice(0, 100),
  },
};

/**
 * 20 rows — baseline dataset (same as the client-only stories).
 * With only 20 rows the entire list fits in one viewport, so all rows
 * are visible and in the DOM simultaneously. Confirms the virtualiser
 * degrades gracefully when the dataset is small.
 */
export const TwentyRows: Story = {
  name: "20 Rows (fits in viewport)",
  args: {
    data: BASE_DATA,
  },
};

/**
 * Active users only — filtered down from the full dataset.
 * Verifies that the row-count signal correctly drives `syncVirtualizer`
 * when the data prop itself changes (not just in-table filtering).
 */
export const ActiveUsersOnly: Story = {
  name: "Active Users Only",
  args: {
    data: LARGE_DATA.filter((p) => p.status === "active"),
  },
};

/**
 * Empty state — no rows.
 * Verifies the "No results found." empty-state renders correctly when
 * the virtualiser receives `count = 0`.
 */
export const Empty: Story = {
  name: "Empty State",
  args: {
    data: [],
  },
};