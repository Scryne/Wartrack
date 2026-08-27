---
name: dashboard-ux
description: UX patterns for operational dashboards, primary job focus, 5-second answer principle, threshold alerts, and drill-down workflows.
---

# Dashboard UX Skill

## Purpose
Ensures the dashboard immediately answers the user's primary question within 5 seconds and guides operator attention effectively.

## Core Rules
1. **5-Second Rule**: The most critical operational question must be visually dominant above the fold.
2. **Actionable Hierarchy**:
   - Level 1: Primary status / critical alert / single main action.
   - Level 2: Secondary monitoring metrics, active streams.
   - Level 3: Historical logs, configuration, drill-downs.
3. **Threshold & Alert Logic**: Clear color semantics for warnings and errors; avoid crying wolf.
4. **Context Preservation**: Retain filters, view states, and selections during live updates and navigation.
