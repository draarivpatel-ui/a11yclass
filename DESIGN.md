# Design

A11yClass is an Operate-mode teacher tool. The interface favors a task-first workbench over marketing decoration: input on the left, audit evidence on the right, then a compact report and print handoff below.

## Visual world

Warm paper background, ink-black text, deep teal actions and restrained severity accents. The tone is a careful classroom markup tool, not a compliance dashboard. Cards are flat or lightly elevated with consistent radii, visible borders and generous spacing.

## Typography

One system sans stack across the whole product. The product title is strong and direct, with no eyebrow above it and no tagline beneath it. Dense evidence uses small but readable type; code and element references use a monospace stack only because they are source fragments.

## Composition

- A narrow top bar carries the product mark, anchor navigation and offline status.
- The first viewport is a two-column workbench at desktop width: pasted source and controls beside the audit overview.
- Results use a real per-check table first, then detailed evidence grouped by check.
- The printable handoff is plain black-on-white and optimized for paper.

## Interaction

Every action is a native button, select, textarea or link. Focus is clearly visible. Motion is minimal and reserved for state feedback. The app is usable without JavaScript animation, local storage, accounts or network access.

## Accessibility

The shipped interface targets WCAG-minded practice: semantic landmarks, labeled controls, visible focus, high contrast, table semantics, meaningful buttons and a print stylesheet. It is checked with the same kind of contrast and keyboard evidence it teaches, though automated checks remain incomplete.
