/**
 * Create React App does not expose its PostCSS config, and Tailwind has to run
 * as a PostCSS plugin. CRACO patches the webpack config at runtime, which is
 * the supported way to add one without `react-scripts eject` -- ejecting would
 * dump the whole build config into the repo permanently to change one line.
 *
 * mode: 'file' makes CRA read postcss.config.js and use *only* those plugins.
 * The obvious alternative -- appending Tailwind to CRA's existing chain via
 * `style.postcss.plugins` -- compiles without error but silently emits a
 * stylesheet containing Tailwind's base layer and none of its utilities,
 * because CRA's css-loader resolves the `@import "tailwindcss"` before
 * Tailwind's plugin can expand it. A build that succeeds while producing an
 * unstyled page is worth the comment.
 *
 * Dropping CRA's chain loses postcss-preset-env and autoprefixer. Neither is
 * needed here: Tailwind v4 emits its own vendor prefixes, and Tailwind is the
 * only source of CSS in this app.
 */
module.exports = {
  style: {
    postcss: {
      mode: 'file',
    },
  },
};
