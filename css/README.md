# Stylesheets

- `tailwind.input.css` contains Tailwind directives; `tailwind.generated.css` is compiled locally during the Pages build.
- `local-icons.css` styles same-origin SVG icons generated from the Font Awesome Free packages.
- `style.css` is the main custom stylesheet loaded by the root `index.html`, after the generated Tailwind stylesheet.
- Edit this file for shared design, layout, colors, spacing, responsive rules and component styling.
- Keep feature-specific selectors scoped to their component to avoid unintended page-wide changes.
- Check desktop and mobile layouts after shared CSS changes.
