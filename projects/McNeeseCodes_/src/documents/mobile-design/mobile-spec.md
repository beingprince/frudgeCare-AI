# FrudgeCare Mobile-Responsive Grid Specs

Our initial implementation successfully locked the 12-column grid and dense clinical UI, but it forcefully compressed onto mobile screens because it statically defined `grid-cols-12` across all breakpoints.

This document details the refactoring deployed to fix mobile responsiveness, spacing, and content compression cross-device.

## 1. Grid Stacking Strategy (The 1-to-12 Rule)
Instead of forcing a 12-column squeeze on mobile:
- **Mobile Default:** We apply `flex flex-col` or `grid-cols-1` to all major containers. 
- **Desktop Breakpoint:** Upon hitting the `md:` breakpoint (768px+), we snap back onto the `md:grid md:grid-cols-12` alignment.
- **Span Management:** Statically sized columns (`col-span-3`, `col-span-6`) have been updated to `md:col-span-3`, `md:col-span-6` paired with `w-full` automatically ensuring they demand 100% width on phone screens.

## 2. Scroll Independence
On desktop, our workspace views (Nurse, Provider, Operations) are 100% viewport height (`h-screen`) locking the main window and allowing the 3 specific columns independently to scroll (`overflow-y-auto`). 
- **Mobile Fix:** Independent scroll columns break painfully on mobile. We updated the parent containers to allow global page-scrolling on mobile (`overflow-y-auto h-auto`) but revert to locked independent scrolling on desktop (`md:h-screen md:overflow-hidden`).
- **Data Grids & Visuals:** Fixed heights on data grids and Recharts elements now have responsive floor heights (`min-h-[400px]`) so they don't flatten into invisible boxes.

## 3. Density Adjustments
While the desktop relies on intense data density (8px grid, small font sizes like 13px), mobile elements require higher tap predictability.
- **Paddings:** Reduced aggressive structural side-paddings from `px-6` to `px-4` on mobile to maximize horizontal real estate.
- **Actions:** Button bars and sticky actions (like the Provider Sign & Submit rail) are now pinned directly to the bottom of the viewport on mobile so they don't get lost under massive amounts of stacked text content.

## Implementation Details
The following operational views have been fully updated to support this system:
1. Front-Desk Split Queue
2. Nurse Validation Workspace (3/6/3 converts to Stacked 1-1-1)
3. Provider Case Review (3/6/3 converts to Stacked 1-1-1)
4. Operations Dashboard (12-column KPI grid stacks into a linear feed) 

The Patient UI was inherently mobile-first and already respected these rules via max-width containers and hidden desktop steppers.
