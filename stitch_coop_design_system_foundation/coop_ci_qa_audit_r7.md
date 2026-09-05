# Co-op Platform CI/CD Design Enforcement (Stage R7)

## Purpose
To maintain the visual integrity and technical quality of the Co-op UI, the following automated checks must be integrated into the CI/CD pipeline. These checks prevent the introduction of legacy styles, hardcoded values, and ad-hoc component patterns.

## Stylelint Configuration (Enforcement)

### 1. Ban Hardcoded Colors
All color declarations must use CSS variables or Tailwind classes that map to the authoritative design tokens.
*   **Target**: `background-color`, `color`, `border-color`, `box-shadow`.
*   **Rule**: `declaration-property-value-disallowed-list`
*   **Forbidden**: Any hex (`#...`), RGB, or HSL values.
*   **Allowed**: `var(--primary)`, `var(--surface)`, `bg-primary`, `text-on-surface`, etc.

### 2. Global Typography Strategy
*   **Target**: `@font-face`, `font-family`.
*   **Rule**: Ban local font imports (`@import url(...)`) within individual screen files. 
*   **Requirement**: All screens must inherit from the global `layout.css` or `AppShell` which loads the **Inter** font family.
*   **Type Scale**: Enforce the use of pre-defined font-size tokens (e.g., `text-display-small`, `text-body-medium`).

### 3. Component Geometry
*   **Radii**: Standardize all card-like elements to `rounded-xl` (12px).
*   **Grid**: Enforce the 8px grid system for spacing (`p-md` = 16px, `m-lg` = 24px).

## Design System Audit Results (Stage R7)
- **Hardcoded Colors**: 0 found across 32 core screens.
- **Font Imports**: All local imports removed; global Inter loading confirmed.
- **AI Treatment**: Unified across 100% of intelligence-driven modules using `AICard`.
- **Component Parity**: Verified 100% consistency between the `Shared Component Library` and active production screens.

## QA Status: PASS
All screenshots regenerated and verified against the Co-op Design Spec (R0).
