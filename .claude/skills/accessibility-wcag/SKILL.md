---
name: accessibility-wcag
description: Accessibility and WCAG 2.1 AA compliance guidelines, contrast ratios, focus rings, ARIA labels, keyboard navigation, and Turkish language semantics.
---

# Accessibility (WCAG 2.1 AA) Skill

## Purpose
Ensures complete accessibility compliance, high contrast ratios, visible focus management, screen-reader markup, and keyboard operability.

## Core Rules
1. **Contrast Ratios**:
   - Body & label text: ≥ 4.5:1 against background.
   - Large text (≥18.66px bold or ≥24px regular): ≥ 3:1.
   - UI component boundaries & icons: ≥ 3:1.
2. **Keyboard & Focus**:
   - Every interactive control must be reachable via `Tab`.
   - Never use `outline: none` without a clear replacement focus ring (`outline: 2px solid accent; outline-offset: 2px`).
   - Focus traps in modals and drawers with `Escape` key listeners and focus restoration on dismiss.
3. **Semantics & ARIA**:
   - Meaning is never conveyed by color alone. Badges and charts must include clear text labels.
   - Icon-only buttons must have descriptive `aria-label`.
   - Single `<h1>` per view; logical heading hierarchy (`h1` → `h2` → `h3`).
4. **Locale**: `<html lang="tr">` semantics and correct Turkish capitalization/date formats.
