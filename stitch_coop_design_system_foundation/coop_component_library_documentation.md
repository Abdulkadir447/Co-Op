# Co-op Shared Component Primitives (Stage R1)

## Overview
This document defines the shared UI component primitives for the Co-op platform. These components are built upon the consolidated design tokens established in Stage R0, ensuring visual consistency and operational efficiency across all desktop and mobile interfaces.

## Core Primitives

### 1. Cards
*   **Default Card**: `bg-surface-container-lowest border border-outline-variant rounded-xl p-md shadow-sm`
    *   Radius: 12px (`rounded-xl`)
    *   Padding: 16px (`p-md`)
    *   Border: 1px solid #e4e1ec
*   **AICard**: Inherits Default Card properties + `border-t-2 border-t-primary-gradient` (AI Gradient). Features a `sparkle` icon in the header.

### 2. Buttons
*   **Primary**: `bg-primary text-on-primary font-semibold rounded-lg px-md py-sm hover:bg-primary-hover transition-colors`
*   **Secondary**: `border border-primary text-primary font-semibold rounded-lg px-md py-sm hover:bg-primary/5 transition-colors`
*   **Ghost**: `text-primary font-semibold rounded-lg px-md py-sm hover:bg-surface-container-high transition-colors`
*   **Danger**: `bg-error text-on-error font-semibold rounded-lg px-md py-sm hover:bg-error/90 transition-colors`

### 3. Badge / StatusPill
*   **Base**: `px-sm py-xs rounded-full text-label-small font-bold uppercase tracking-wider`
*   **Success (Paid/Fulfilled)**: `bg-success/10 text-success`
*   **Warning (Low Stock/Pending)**: `bg-warning/10 text-warning`
*   **Critical (Out of Stock/Failed)**: `bg-error/10 text-error`
*   **Info (Processing/AI Insight)**: `bg-primary/10 text-primary`

### 4. Form Fields & Inputs
*   **Input**: `w-full border border-outline-variant rounded-lg px-md py-sm bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all`
*   **Label**: `text-label-medium font-semibold mb-xs block text-on-surface-variant`

### 5. Typography
*   **Font**: Inter (400, 600, 700)
*   **Page Title**: `font-bold text-display-small text-on-surface` (Desktop) / `font-bold text-title-large` (Mobile)
*   **Section Heading**: `font-semibold text-headline-small text-on-surface`
*   **Body Default**: `font-normal text-body-medium text-on-surface-variant`
*   **Label/Caption**: `font-medium text-label-small text-outline`

## Navigation

### Global BottomNavigation (Mobile)
A single source of truth for mobile navigation.
*   **Structure**: 5 fixed tabs.
*   **Items**:
    1.  **Home**: `dashboard` (Icon) / "Home" (Label)
    2.  **Operations**: `inventory_2` (Icon) / "Ops" (Label)
    3.  **AI**: `auto_awesome` (Icon) / "Co-op AI" (Center Action)
    4.  **Clients**: `group` (Icon) / "Clients" (Label)
    5.  **More**: `menu` (Icon) / "More" (Label)
*   **Active State**: `text-primary` with subtle background highlight.
*   **Inactive State**: `text-on-surface-variant`.

## Iconography
*   **Primary Set**: Material Symbols (Rounded)
*   **Stroke Weight**: 2px
*   **Special Icons**:
    *   `auto_awesome`: Co-op AI Sparkle
    *   `dashboard`: Dashboard Mark
    *   `grid_view`: Operations/Catalog Mark