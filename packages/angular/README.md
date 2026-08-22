# @rgaa-source/angular

The bridge between the rendered DOM and Angular source code.

Rewrites templates before the build to put a
`data-a11y-src="file:line:column"` attribute on every rendered element, at the
offsets Angular's own compiler reports (`parseTemplate` → `sourceSpan`).

This is the Angular equivalent of `babel-plugin-transform-react-jsx-source`
(`_debugSource`) on the React side, which did not exist here until now.

## Properties

- **Pure text insertion.** The AST is never re-serialised: formatting, bindings,
  and `@if`/`@for`/`@switch`/`@defer` all survive untouched.
- **Exact or absent, never guessed.** A developer sent to the wrong line loses
  more time than a developer sent nowhere at all.
- **Idempotent**, so resuming after a failure is safe.
- **Recoverable.** Before each rewrite the original is parked in
  `node_modules/.cache/rgaa-restore/`; a process killed between the write and the
  restore is recovered on the next run.

## Compatibility

Verified on **Angular 15 through 22** — from the historic `*ngIf` syntax to
modern `@if` blocks. The bridge works on positions in the file rather than on
control-flow syntax, which is why the range is that wide. Angular 22's compiler
does the template parsing; npm installs it alongside your project's own without
interfering with it — verified on an Angular 17 project, which keeps its own.

## Usage

```ts
const session = await instrumentTemplates(templates, projectRoot);
try {
  // build the project: the output keeps the source locations
} finally {
  await session.restore(); // always in a finally
}
```

Full documentation: [project README](https://github.com/oussamaLaribi/RGAA#readme)
· [en français](https://github.com/oussamaLaribi/RGAA/blob/main/README.fr.md).
