import type { Preview } from "@storybook/marko";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "app",
      values: [{ name: "app", value: "#f8fafc" }],
    },
    controls: { matchers: { date: /Date$/ } },
  },
};

export default preview;
