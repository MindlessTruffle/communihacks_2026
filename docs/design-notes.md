# Design notes

The menu follows the court's playful gummy style: Perandory serif lettering, warm ivory, soft cloud imagery, and restrained shadows. One primary action keeps the opening easy to understand. The title and Start remain readable as the viewport changes; the court camera reframes rather than stretching the scene.

Apple Human Interface Guidelines informed the interaction foundations, adapted for a browser game:

- Buttons / Best practices: a clear primary action and a generous hit region. The phone Start target measures 230 × 106 CSS pixels, exceeding the 44 × 44 baseline. Keyboard focus has a distinct ring.
- Motion / Best practices: motion explains the move from hilltop to courtroom. The default descent lasts one second; the system reduced-motion preference uses a brief crossfade without camera travel or cloud blur.
- Typography / Ensuring legibility: bold display lettering, a restrained two-line hierarchy, and unoutlined ivory text with a soft shadow over a variable 3D background.
- Designing for games / Look stunning on every display: both the interface and perspective camera adapt to screen shape. Desktop retains the established direct-side court composition.
- Accessibility: Start is a native button, loading and failure have text feedback, and focus moves to the arrival heading.

References: https://developer.apple.com/design/human-interface-guidelines/buttons • https://developer.apple.com/design/human-interface-guidelines/motion • https://developer.apple.com/design/human-interface-guidelines/typography • https://developer.apple.com/design/human-interface-guidelines/designing-for-games • https://developer.apple.com/design/human-interface-guidelines/accessibility
