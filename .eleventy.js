export default function configureEleventy(eleventyConfig) {
  return {
    dir: {
      input: 'scripts',
      includes: '.',
      data: '_data',
      output: 'dist-eleventy',
    },
    markdownTemplateEngine: false,
    htmlTemplateEngine: 'njk',
    templateFormats: ['njk'],
  };
}
