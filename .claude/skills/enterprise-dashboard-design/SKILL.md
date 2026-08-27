---
name: enterprise-dashboard-design
description: Enterprise dashboard layouts, dense information architecture, data tables, sidebars, topbars, and operational workspace patterns.
---

# Enterprise Dashboard Design Skill

## Purpose
Governs complex enterprise dashboards, operational views, dense tables, toolbar patterns, and layout stability.

## Core Rules
1. **Sidebar & Navigation**:
   - Distinct sections, 36px nav item height, 16px icons, active indicator on sunken surface.
   - Max 7 ungrouped items; group headers in uppercase subtle text (11px, 600 weight).
2. **Data Tables**:
   - 44px dense / 52px standard row heights.
   - No zebra striping; clean 1px bottom borders. Sticky sunken header.
   - Numeric data aligned right with tabular figures (`font-variant-numeric: tabular-nums`).
   - Relative timestamps with full date in tooltip.
3. **Grid Layout**: Use `minmax(0, ...)` inside CSS grid to prevent content blowout.
4. **State Coverage**: Full implementation of Empty, Filter-Empty, Loading (Skeletons), Error, and Unauthorized states.
