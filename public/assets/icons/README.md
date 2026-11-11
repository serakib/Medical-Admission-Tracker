# Local icon assets

The website uses a locally generated Font Awesome Free SVG sprite instead of the remote Font Awesome stylesheet and webfont.

- `fontawesome.svg` is generated during the Pages build from the pinned Font Awesome Free 6.4.0 packages.
- `js/local-icons.js` maps existing `fa-solid`, `fa-regular`, and `fa-brands` icon classes to same-origin SVG symbols.
- Add/remove icon usage in the HTML or JavaScript; the build script scans those files and generates only the required symbols.
- The generated sprite is a build artifact, so it is refreshed automatically on every Pages deployment.

Font Awesome Free is distributed under the applicable CC BY 4.0 (icons), SIL OFL 1.1 (fonts), and MIT (code) licenses. See the upstream project: https://github.com/FortAwesome/Font-Awesome and its license files.
