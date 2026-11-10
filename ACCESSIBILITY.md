# Accessibility

Medical Admission Pro is intended to support students using different devices, input methods, browsers, and assistive technologies. Accessibility should be considered during design, implementation, testing, and review—not added only after a feature is complete.

This document describes the project's accessibility expectations. It is a development guide, not a claim that every page or feature currently conforms to WCAG.

## Our goals

- Make the core experience usable with a keyboard as well as a pointer or touchscreen.
- Keep content understandable with screen readers and browser zoom.
- Support Bangla content and mixed Bangla/English technical terms without clipping or unreadable text.
- Avoid relying on colour, animation, sound, or visual position as the only way to communicate information.
- Keep layouts usable on small screens and at increased text sizes.

## Implementation guidelines

### Structure and content

- Use semantic HTML elements and meaningful page landmarks.
- Keep heading levels in a logical order. Use headings for structure, not only for visual styling.
- Give links and buttons clear names that describe their action. Avoid icon-only controls unless they have an accessible name.
- Add useful alternative text to informative images. Use empty alternative text for purely decorative images.
- Set the document language correctly and mark language changes in content when practical. Preserve readable Bangla text and do not render essential text only inside images.

### Keyboard and focus

- All interactive features must be operable using a keyboard.
- Use native buttons, links, inputs, and select elements where possible instead of recreating them with generic containers.
- Keep a visible focus indicator. Do not remove outlines unless an equally visible focus style replaces them.
- Keep keyboard order logical and ensure sticky headers, dialogs, popovers, and fixed controls do not hide the focused element.
- Dialogs should move focus into the dialog, keep focus within it while open, close with Escape when appropriate, and return focus to the opener.

### Forms and feedback

- Give every form field a persistent programmatic label. Do not use placeholder text as the only label.
- Associate help text and validation messages with the relevant field.
- Identify errors in text and explain how to correct them; do not communicate errors through colour alone.
- Announce important asynchronous status changes (such as saving, loading completion, or errors) to assistive technology without moving focus unexpectedly.
- Preserve entered data when validation fails whenever practical.

### Colour, layout, and text

- Maintain sufficient text and control contrast. Use WCAG 2.2 AA contrast ratios as the target: 4.5:1 for normal text and 3:1 for large text and essential UI graphics.
- Do not use colour as the only indication of selected, correct, incorrect, enabled, disabled, or warning states.
- Support browser zoom and text resizing up to 200% without loss of essential content or functionality.
- Avoid unnecessary horizontal scrolling. On narrow screens, allow content to reflow and controls to remain reachable.
- Check Bangla glyphs, punctuation, line-height, and mixed-script labels at common mobile and desktop sizes.

### Motion, sound, and time

- Respect the user's reduced-motion preference. Provide a less animated or static alternative for non-essential motion.
- Avoid flashing content and rapidly repeating decorative animation.
- Do not use sound as the only way to communicate a status.
- For time-limited interactions, make the remaining time understandable and provide warnings or extension/pause options where the product requirements allow them.

### Dynamic and custom components

- Prefer native HTML controls. When custom widgets are necessary, implement the appropriate accessible role, name, value, state, and keyboard interaction.
- Keep tabs, menus, accordions, carousels, and game controls consistent with established keyboard interaction patterns.
- Ensure charts, scores, progress indicators, and canvas-based content have an equivalent text or DOM representation.
- Update accessible status text when content changes; avoid excessive announcements for rapidly changing values.

## Testing checklist

Before submitting a user-facing change, check the parts that changed:

- [ ] Complete the main interaction using only the keyboard.
- [ ] Confirm focus is visible and follows a logical order.
- [ ] Check labels, accessible names, error messages, and status announcements.
- [ ] Check text and controls in both Bangla and English where applicable.
- [ ] Check the layout on a narrow viewport and at 200% browser zoom.
- [ ] Check contrast and confirm that meaning is not conveyed by colour alone.
- [ ] Check reduced-motion behaviour for any animation added or changed.
- [ ] Verify that important information is available outside images, canvas, or visual-only effects.

Automated accessibility tools can help find issues, but they do not replace keyboard, zoom, and assistive-technology checks.

## Reporting an accessibility barrier

Please use the **Accessibility issue** form in the repository's Issues page. Include the affected page or feature, the steps that lead to the barrier, what happened, and what you expected. Mention the browser, device, or assistive technology only when relevant.

Do not include passwords, authentication tokens, private student records, or other sensitive personal information in a public issue. For security-sensitive reports, do not publish exploit details or credentials in an issue.

## Scope and ongoing work

Accessibility improvements are ongoing. If you find a barrier, report it even when you are unsure which guideline applies. The project maintainers will assess the impact and determine an appropriate fix.
