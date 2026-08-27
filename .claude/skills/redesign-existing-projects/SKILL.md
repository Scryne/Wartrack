---
name: redesign-existing-projects
description: Migration protocol and execution guidelines for refactoring existing coded applications to the DESIGN.md design system without breaking business logic.
---

# Redesign Existing Projects Skill (Migration Protocol - Ek G.6)

## Purpose
Governs step-by-step redesign and visual elevation of existing coded codebases without introducing regression bugs, changing data flows, or breaking user behaviors.

## Migration Protocol Steps (Ek G.6)
1. **Inventory**: Catalog all existing views, routes, panels, and modal flows. Capture 1440px baseline screenshots with chrome-devtools before writing any code.
2. **Diagnosis**: Run an anti-slop audit against DESIGN.md Section 13. Identify top 3 violations per view and target Section 8 component specifications.
3. **Prioritization**: Rank views by user operational priority. Plan migrations one view/page per step.
4. **Tokens First**: Establish design tokens (colors, spacing, radius, typography) and replace raw hex values with tokens before refactoring layout and components.
5. **Preserve Business Logic & Behavior**: Never alter API integration, WebSocket subscriptions, Zustand state mutations, or component logic. Refactor visual presentation and structure only.
6. **Visual Verification & DoD**: Verify each modified view across 375px, 768px, 1440px, 1920px viewports with at least 2 iterative rounds of critique and fixes before closing.
