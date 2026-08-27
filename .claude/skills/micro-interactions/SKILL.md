---
name: micro-interactions
description: Micro-interactions, transition timings (<300ms), hover/active feedback, skeleton loading, and reduced motion handling.
---

# Micro-Interactions Skill

## Purpose
Governs fluid, restrained micro-interactions, responsive states, feedback timings, and performance-friendly animations.

## Core Rules
1. **Timing Constraint**: No UI animation longer than 300ms. Closing animations faster than opening animations (e.g. 150ms open, 100ms close).
2. **GPU Properties Only**: Animate `opacity` and `transform`. Avoid animating layout properties (`width`, `height`, `margin`, `top/left`).
3. **No Slop Motion**:
   - No staggered fade-in cascades on dashboard page loads.
   - No continuous spinning/glowing background canvas effects.
   - No card scale jumps on hover (`scale > 1.02` is prohibited).
4. **Reduced Motion Support**:
   Enforce `@media (prefers-reduced-motion: reduce)` resets across all transition tokens.
