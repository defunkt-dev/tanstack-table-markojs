import type { Meta, StoryObj } from "@storybook/marko";
import DataTableClient from "../routes/client-only/components/data-table-client.marko";
import type { Person } from "./sample-data";
import { BASE_DATA } from "./sample-data";

// ── Types ─────────────────────────────────────────────────────────────────────

// The Input type for our component — matches data-table-client.marko's Input interface.
type Input = { data: Person[] };

// `satisfies Meta<any>` checks the meta object structure without fighting the
// Template<unknown> / Template<Input> invariance mismatch from the ambient
// "*.marko" module declaration. `StoryObj<Input>` then provides precise
// `args: Partial<Input>` = `{ data?: Person[] }` typing on each story.
const meta = {
  title: "Tables/Client Only",
  component: DataTableClient,
  parameters: {
    docs: {
      description: {
        component: [
          "Full-featured client-only (CSR) data table built with **marko-table** + **@tanstack/table-core**.",
          "",
          "Rendered entirely in the browser — no SSR. All table state lives in",
          "Marko `<let>` signals inside an `<if=mounted>` guard.",
          "",
          "**Features:** sorting · multi-sort · pagination · global search",
          "· per-column filters · column visibility · row expansion",
          "· row selection (check-all) · column resizing",
        ].join("\n"),
      },
    },
  },
  argTypes: {
    data: {
      description: "Array of `Person` objects rendered as rows.",
      control: false,
    },
  },
} satisfies Meta<any>;

export default meta;

// StoryObj<Input> gives args: Partial<{ data: Person[] }> on every story.
type Story = StoryObj<Input>;

// ── Stories ───────────────────────────────────────────────────────────────────

/** Default — 20 rows, page size 5, no active filters. */
export const Default: Story = {
  args: { data: BASE_DATA },
};

/** All 20 rows — change the *Show* dropdown to 20 to see everything at once. */
export const SinglePage: Story = {
  name: "Single Page (20 rows)",
  args: { data: BASE_DATA },
};

/** Active users only — 11 rows, exercises 3-page pagination. */
export const ActiveUsersOnly: Story = {
  name: "Active Users Only (11 rows)",
  args: { data: BASE_DATA.filter((p) => p.status === "active") },
};

/** Pending users only — 5 rows, exactly one page. */
export const PendingUsersOnly: Story = {
  name: "Pending Users Only (5 rows)",
  args: { data: BASE_DATA.filter((p) => p.status === "pending") },
};

/** High-volume visitors (>300 visits), sorted descending. */
export const HighVolume: Story = {
  name: "High-Volume Visitors (>300 visits)",
  args: {
    data: [...BASE_DATA].filter((p) => p.visits > 300).sort((a, b) => b.visits - a.visits),
  },
};

/** Empty state — verifies "No results found." renders correctly. */
export const Empty: Story = {
  name: "Empty State",
  args: { data: [] },
};

/** Single row — edge case with exactly one record. */
export const SingleRow: Story = {
  name: "Single Row",
  args: { data: [BASE_DATA[0] as Person] },
};
