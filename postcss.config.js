/**
 * Read by CRA because craco.config.js sets style.postcss.mode = 'file'.
 *
 * Tailwind v4 ships its PostCSS integration as a separate package
 * (@tailwindcss/postcss); in v3 the `tailwindcss` package was itself the
 * plugin, so older setup guides list a different entry here.
 */
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
