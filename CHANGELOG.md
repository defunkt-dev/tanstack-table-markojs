# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-08

### Added

- Initial release
- `syncMarkoTable` — core adapter function with SSR + resumability support
- `generateTableId` / `getTable` / `destroyTable` — instance lifecycle utilities
- `flexRender` — renders cell/header values (strings, numbers, functions)
- `syncVirtualizer` / `destroyVirtualizer` / `preloadVirtualizer` — row virtualization via `@tanstack/virtual-core` v3
- Full re-export of `@tanstack/table-core` (all row models, column helpers, types)
- `VirtualRow`, `MappedRow`, `MappedCell`, `MappedHeader`, `MappedHeaderGroup`, `MappedColumn` type exports
- ESM + CJS dual output with TypeScript declaration files
- Vitest unit test suite covering all adapter functions
- ESLint + Prettier configuration
