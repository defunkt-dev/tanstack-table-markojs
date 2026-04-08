import type { Meta, StoryObj } from "@storybook/marko";
import DataTableClient from "../routes/client-only/components/data-table-client.marko";
import type { Person } from "./sample-data";
import { BASE_DATA } from "./sample-data";

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: "Tables/Client Only",
  component: DataTableClient,
  parameters: {
    docs: {
      description: {
        component: [
          "Full-featured client-only (CSR) data table built with **marko-table** + **@tanstack/table-core**.",
          "",
          "Rendered entirely in the browser — no SSR, no serialisation constraints.",
          "All table state (sorting, pagination, filters, selection, etc.) lives in",
          "Marko `<let>` signals inside an `<if=mounted>` guard.",
          "",
          "**Features:** sorting · multi-sort · pagination · global search · per-column filters",
          "· column visibility · row expansion · row selection (check-all) · column resizing",
        ].join("\n"),
      },
    },
  },
  argTypes: {
    data: {
      description: "Array of `Person` objects rendered as rows.",
      control: false, // too large for the controls panel — use the story presets below
    },
  },
} satisfies Meta<{ data: Person[] }>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Stories ──────────────────────────────────────────────────────────────────

/**
 * Default view — 20 rows, page size 5, no active filters.
 * Demonstrates the initial rendered state straight out of the box.
 */
export const Default: Story = {
  args: {
    data: BASE_DATA,
  },
};

/**
 * Larger page — all 20 rows on a single page so you can see every feature
 * (expand, select, resize) without needing to paginate.
 */
export const SinglePage: Story = {
  name: "Single Page (20 rows)",
  args: {
    data: BASE_DATA,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Pass the full 20-row dataset. Change the *Show* dropdown to 20 to see all rows at once.",
      },
    },
  },
};

/**
 * Active users only — 11 rows.
 * Shows the table with a pre-filtered dataset; useful for testing
 * pagination boundary conditions (11 rows, page size 5 → 3 pages).
 */
export const ActiveUsersOnly: Story = {
  name: "Active Users Only (11 rows)",
  args: {
    data: BASE_DATA.filter((p) => p.status === "active"),
  },
};

/**
 * Pending users only — 5 rows.
 * Fits exactly one page (default page size = 5).
 */
export const PendingUsersOnly: Story = {
  name: "Pending Users Only (5 rows)",
  args: {
    data: BASE_DATA.filter((p) => p.status === "pending"),
  },
};

/**
 * High-volume visitors — rows where `visits > 300`, sorted by visits desc.
 * Useful for checking that numeric values render and sort correctly.
 */
export const HighVolume: Story = {
  name: "High-Volume Visitors (>300 visits)",
  args: {
    data: [...BASE_DATA]
      .filter((p) => p.visits > 300)
      .sort((a, b) => b.visits - a.visits),
  },
};

/**
 * Empty state — no data rows.
 * Verifies the "No results found." empty-state renders correctly.
 */
export const Empty: Story = {
  name: "Empty State",
  args: {
    data: [],
  },
};

/**
 * Single row — edge case with exactly one record.
 */
export const SingleRow: Story = {
  name: "Single Row",
  args: {
    data: [BASE_DATA[0]!],
  },
};