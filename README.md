# Change of Basis Explorer

An interactive, browser-based visualization of change of basis in a two-dimensional Cartesian
plane. The explorer displays the standard basis
\(B=(e_1,e_2)\), a user-defined basis \(B'=(e'_1,e'_2)\), a selected vector, its two
head-to-tail decompositions, and the exact change-of-basis matrices in both directions.

## Features

- Click the plot or enter exact coordinates to select a vector.
- Enter basis coordinates as integers, terminating decimals, or fractions.
- Compare coordinates in \(B\) and \(B'\) with both decompositions visible at once.
- See \(P_{B\leftarrow B'}\) and \(P_{B'\leftarrow B}\) rendered as exact reduced fractions.
- Explore singular candidates without losing access to the standard-basis decomposition.
- Adjust the visible window without distorting Cartesian lengths or angles.

## Development

Use Node.js 24 (see `.nvmrc`).

```bash
npm ci
npm run dev
```

Validation commands:

```bash
npm test
npm run typecheck
npm run build
npm run test:browser
```

## GitHub Pages

The consolidated workflow in `.github/workflows/ci.yml` tests every pull request. A push to
`main` deploys the same tested `dist` artifact through GitHub Pages. In the repository settings,
set **Pages → Build and deployment → Source** to **GitHub Actions**.
