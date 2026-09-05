---
name: Co-op Purple
colors:
  surface: '#fcf8ff'
  surface-dim: '#dbd8e5'
  surface-bright: '#fcf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f2fe'
  surface-container: '#efecf9'
  surface-container-high: '#e9e6f3'
  surface-container-highest: '#e4e1ed'
  on-surface: '#1b1b23'
  on-surface-variant: '#464555'
  inverse-surface: '#303039'
  inverse-on-surface: '#f2effc'
  outline: '#767586'
  outline-variant: '#c6c5d7'
  surface-tint: '#474adb'
  primary: '#4143d5'
  on-primary: '#ffffff'
  primary-container: '#5b5fef'
  on-primary-container: '#f9f6ff'
  inverse-primary: '#c0c1ff'
  secondary: '#712ae2'
  on-secondary: '#ffffff'
  secondary-container: '#8a4cfc'
  on-secondary-container: '#fffbff'
  tertiary: '#904400'
  on-tertiary: '#ffffff'
  tertiary-container: '#b55700'
  on-tertiary-container: '#fff6f2'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#05006c'
  on-primary-fixed-variant: '#2c2cc3'
  secondary-fixed: '#eaddff'
  secondary-fixed-dim: '#d2bbff'
  on-secondary-fixed: '#25005a'
  on-secondary-fixed-variant: '#5a00c6'
  tertiary-fixed: '#ffdbc8'
  tertiary-fixed-dim: '#ffb689'
  on-tertiary-fixed: '#311300'
  on-tertiary-fixed-variant: '#733500'
  background: '#fcf8ff'
  on-background: '#1b1b23'
  surface-variant: '#e4e1ed'
typography:
  page-title:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  page-title-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  section-heading:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-default:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-compact:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
---

## Brand & Style
The design system is engineered for a premium SaaS environment, prioritizing clarity, efficiency, and a sense of sophisticated reliability. The aesthetic follows a **Corporate / Modern** style with a refined, high-end finish. 

The visual language balances strict utility with "soft power"—using a predominantly white and light gray canvas to allow the vibrant primary purple to act as a beacon for action. The interface should feel airy and expansive, utilizing generous whitespace to reduce cognitive load. A signature AI identity is integrated through subtle, high-fidelity gradients that signify intelligence and premium features without disrupting the professional atmosphere.

## Colors
The palette is anchored by a vibrant, digital-first primary purple. This color is used for primary actions and brand presence. The secondary accent is reserved for highlights and deeper visual hierarchy.

- **Surface Tiers**: Use the background color for the application canvas and the card surface for all functional containers. This distinction creates a clear "inner vs outer" mental model.
- **Borders**: All structural elements use a subtle border to maintain definition against the light background.
- **AI Identity**: Elements powered by AI should utilize the linear gradient sparingly—typically as a subtle border-top, an icon treatment, or a background for small badges.

## Typography
This design system utilizes **Inter** exclusively to maintain a systematic and utilitarian feel. 

- **Page Titles**: Use a tight letter-spacing to give a modern, "locked-in" appearance.
- **Hierarchical Contrast**: Use the `label-caps` style for metadata and table headers to create strong visual differentiation from body text.
- **Scale**: Transitions between sizes should feel deliberate. Avoid using more than three distinct type levels on a single view to maintain the premium, uncluttered look.

## Layout & Spacing
The spacing rhythm is strictly built on an **8px grid**. This creates a predictable and harmonious layout that scales across all viewports.

- **Grid System**: Use a 12-column fluid grid for desktop and tablet, and a 4-column grid for mobile.
- **Vertical Rhythm**: Use `lg` (24px) or `xl` (32px) for spacing between major sections. Use `sm` (8px) for internal element grouping.
- **Alignment**: Elements should strictly align to the grid. In SaaS dashboards, prefer a "Fixed-Fluid-Fixed" layout where navigation and sidebars are fixed, and the main workspace scales to fit.

## Elevation & Depth
Depth in this design system is primarily achieved through **Tonal Layers** and **Low-Contrast Outlines**. 

- **Shadow Character**: Shadows are used only to communicate "lift" on interactive elements like modals, dropdowns, and active card states. Use a very diffused, low-opacity indigo tint (e.g., `rgba(91, 95, 239, 0.08)`) instead of pure black for shadows to keep the UI clean.
- **Elevated States**: 
  - **Level 0 (Flat)**: Background surface.
  - **Level 1 (Default)**: Cards with a 1px border. No shadow.
  - **Level 2 (Active/Hover)**: 1px border with a subtle 4px blur shadow.
  - **Level 3 (Overlays)**: Modals and menus with a 12px blur shadow and a 1px border.

## Shapes
The shape language is "Restrained Modern." A consistent **12px (0.75rem)** radius is applied to all primary containers (cards, modals, inputs).

- **Standard Elements**: 12px for cards, large buttons, and input fields.
- **Small Elements**: 8px (0.5rem) for smaller interactive components like chips or segmented controls.
- **Strict Square**: Never use 0px corners; every element must feel approachable and modern.

## Components

- **Buttons**:
  - **Primary**: Solid primary color with white text. 12px radius.
  - **Secondary**: Ghost style with 1px border and primary color text.
  - **AI Trigger**: Gradient background with a subtle "sparkle" icon.
- **Input Fields**: 1px border using the border color. On focus, the border shifts to the primary color with a 2px semi-transparent primary glow (halo).
- **Cards**: Background white, 1px border, 12px radius. Padding should follow the `lg` (24px) spacing rule.
- **Chips/Badges**: Small (8px) radius. Use a light tinted background (10% opacity of the semantic color) with high-contrast text for status indicators.
- **Lists**: Clean rows with a 1px bottom border. Hover states should use the background surface color to gently highlight the row.
- **AI Modules**: Any component containing AI insights should feature a 2px top-border using the AI Gradient to distinguish it from standard data.