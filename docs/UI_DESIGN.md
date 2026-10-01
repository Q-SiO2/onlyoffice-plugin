# UI design and free Unlumen primitives

The UI uses actual source from [Unlumen UI](https://ui.unlumen.com), retrieved from its [public MIT registry](https://github.com/leovvx/unlumen-ui-docs/tree/main/registry/primitives) on 2026-10-01. No Pro component, license key, hosted font service, or paid asset is required.

## Included primitives

| Free resource | Use in Palo Alto Live                                                                     |
| ------------- | ----------------------------------------------------------------------------------------- |
| Button        | Form submission, presenter commands and word selections, with restrained hover/tap motion |
| Slot          | Underlying polymorphic composition used by the Unlumen primitives                         |
| Glowing Badge | Live connection indicator, including reconnect state                                      |
| Count Up      | Live participant and response counters                                                    |
| Tabs          | Presenter preview switches between poll and word cloud                                    |
| Highlight     | Spring-driven selection background in the result tabs                                     |
| Copy          | QR participation-link copy button with checkmark feedback                                 |

Source snapshots live in `participant-app/src/vendor/`. Their original registry endpoints are `https://raw.githubusercontent.com/leovvx/unlumen-ui-docs/main/public/r/NAME.json` for `button`, `slot`, `glowing-badge`, `count-up`, `tabs`, `highlight`, and `copy`. Supporting `lib-get-strict-context` and `hooks-use-controlled-state` are from the same registry. The MIT copyright/license is preserved in `docs/licenses/UNLUMEN-MIT.txt` and both builds.

Local adaptations: relative imports; strict TypeScript types; project CSS selectors instead of a global Tailwind reset; small, stable hover/tap scales; keyboard arrow/Home/End navigation and ARIA relationships for tabs; hidden/inert inactive panels; reduced-motion handling; accessible counter text. Unlumen provides the primitive behavior; page composition, responsive layout, controls and branding are project code.

## Consistent logo and alignment

Every Brand component imports the exact `onlyoffice-plugin/icon@2x.png` file. The web build and packaged plugin embed that same asset, and result PNGs draw it after decoding. There is no CSS letter reconstruction or alternate logo. Images have explicit square dimensions and flex layouts align their centers with the wordmark. Lucide SVG icons use fixed dimensions and do not depend on Unicode glyph baselines.

The palette follows the plugin icon: navy #242744, white, a restrained gold accent, and muted violet charts. Cards use a shared border/radius/spacing system. Decorative tilted bubbles were removed. Manrope is bundled locally under OFL-1.1.

## Validation

The classroom flow covers keyboard switching between result tabs, clipboard copying, voting/reconnect/reset and projection. The file-origin plugin harness verifies image decoding and additive slide insertion at 360 px. Responsive checks cover 320, 390 and 760 px, logo loading, square proportions and aligned logo/wordmark centers, with reduced motion enabled. Desktop, phone and plugin screenshots are in `docs/screenshots/`.
