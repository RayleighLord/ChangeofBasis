# AGENTS.md

## Project purpose

This is a static, framework-free Vite application for understanding two-dimensional change of
basis. It must remain usable without a backend and deploy safely at a GitHub Pages repository
subpath.

## Mathematical invariants

- The standard basis is `B = (e1, e2)` and the user-defined basis is
  `B' = (e1', e2')`.
- Coordinates are columns. `P_(B <- B') = [e1' e2']` and
  `P_(B' <- B) = P_(B <- B')^-1`.
- Basis inputs use normalized exact rational arithmetic. Do not route them through binary floating
  point before computing determinants or inverses.
- A determinant is singular only when its exact rational numerator is zero.
- Horizontal and vertical model units must render at the same pixel scale.

## Architecture

- Keep DOM wiring and form behavior in `src/app.ts`.
- Keep state transitions and derived view models in `src/ui/controller.ts`.
- Keep exact arithmetic and linear algebra in `src/math/`.
- Keep coordinate transforms, snapping, ticks, and retained SVG rendering in `src/plot/`.
- Preserve Vite's relative `base: "./"` and the single test/build/deploy workflow.

## UX and verification

- Do not communicate basis identity through color alone; keep visible mathematical labels.
- Preserve the independent component toggles and keyboard coordinate-entry workflow.
- Keep the plot square on narrow layouts and the sidebar independently scrollable on desktop.
- Run unit tests, typecheck, production build, browser smoke tests, and visual browser inspection for
  interaction or layout changes.
