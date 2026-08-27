---
name: design-system
description: Design token architecture, semantic color layers, 4px spacing grid, radius rules, and design token consistency enforcement.
---

# Design System Skill

## Purpose
Ensures strict token usage, consistent spacing, semantic color roles, and dark mode parity across all components.

## Core Rules
1. **Semantic Color Architecture**:
   - Surfaces: `--color-bg`, `--color-surface`, `--color-surface-sunken`, `--color-overlay`.
   - Borders: `--color-border`, `--color-border-strong`.
   - Foreground: `--color-fg`, `--color-fg-muted`, `--color-fg-subtle`, `--color-fg-on-accent`.
   - Accent: `--color-accent`, `--color-accent-hover`, `--color-accent-subtle`.
   - Status: `--color-success`, `--color-warning`, `--color-danger`, `--color-info` + subtle variants.
2. **Spacing Grid**: Strict 4px base (4px, 8px, 12px, 16px, 24px, 32px, 48px). No odd values (5px, 10px, 13px, 18px).
3. **Radius Scale**: Consistent radius identity (sm: 6px, md: 8px, lg: 12px, xl: 16px, full: 9999px).
4. **Zero Raw Values**: Never use raw hex codes or ad-hoc px margins in component files.
