/// <reference types="marko" />

// Re-declare the *.marko ambient module so TypeScript resolves .marko imports
// when moduleResolution:"bundler" is used and marko/index.d.ts isn't auto-loaded.
// The Marko.Template type comes from the /// reference directive above.
declare module "*.marko" {
  const template: Marko.Template;
  export default template;
}
