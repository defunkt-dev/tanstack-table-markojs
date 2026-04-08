import type { StorybookConfig } from "@storybook/marko-vite";

const config: StorybookConfig = {
  stories: ["../src/stories/**/*.stories.ts"],
  framework: {
    name: "@storybook/marko-vite",
    options: {},
  },
};

export default config;