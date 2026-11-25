# Mockup stacks

A mockup is throwaway code, built in the product's own stack, components and
tokens, that lets the owner decide a design question by trying the
alternatives. The [design package](design-package.md) takes its frames from it.
Choose the form from what already exists.

| What exists | Mockup form |
|---|---|
| An app with a page that will host the change | Variants rendered inside that page behind a development-only switch, such as a `?variant=` URL parameter, using the page's own components, tokens and data access, with a floating switcher that production builds leave out |
| An app, and the change is a new top-level surface | A throwaway prototype route that follows the app's routing convention, with `prototype` in its path or file name |
| No app yet | One standalone HTML file with inline CSS and script, using the product's tokens or a neutral token set, that opens by double-click |
| A native mobile app | A prototype screen in a development build, rendered on a simulator or emulator |

Prefer the host page whenever one plausibly exists. On an empty page, problems
caused by the real header, sidebar, data and density do not appear, so the
owner cannot judge them.
When no repository exists yet, choose the stack first with the
[`new-product-setup` archetype](archetypes/new-product-setup.json), then build
the mockup in that stack.

## The switcher

The switcher is a small fixed bar at the bottom of the screen, visibly
different from the design under review. It has previous and next buttons and
shows the current variant's key and name. Each click updates the URL
parameter, so a variant can be reloaded and shared. The left and right arrow
keys also cycle the variants, except while focus is in a text field or an
editable area. Only development builds render the bar.

## Notes for common stacks

Library details change between versions. Look up the current documentation for
the installed version at the time of use instead of relying on memory.

- **Next.js App Router:** read the variant from the page's search parameters,
  whose exact type has changed between major versions. A client switcher uses
  `useSearchParams` and `router.replace`. A new surface goes in a route folder
  such as `app/prototype/<name>/`. Gate the switcher on
  `process.env.NODE_ENV !== "production"`.
- **Vite and React Router:** read and set the variant with `useSearchParams`.
  Gate the switcher and any prototype route on `import.meta.env.DEV`, so that
  the production build leaves them out.
- **Expo Router and React Native:** add a prototype screen as a route file,
  read the variant with `useLocalSearchParams`, and gate the screen on
  `__DEV__`. Open it by deep link on the iOS Simulator or an Android emulator,
  and capture frames with `xcrun simctl io booted screenshot <file>` or
  `adb exec-out screencap -p > <file>`.
- **SwiftUI:** write one `#Preview` per variant at the target device sizes to
  compare layouts. Then run a development-only screen behind `#if DEBUG` on
  the simulator, because previews do not prove interaction. Capture frames
  with `xcrun simctl io booted screenshot <file>`.
- **Plain HTML with Tailwind:** a standalone file should open with no network
  access, so do not depend on the Tailwind CDN script, which is also meant for
  development only. Compile the classes once with the project's configuration
  and inline the output, or write plain CSS with the tokens as custom
  properties.

## Rules

- Variants differ in structure, layout and primary action. Two variants that
  differ only in colour or copy are adjustments of one design.
- Build two or three variants, and never more than five.
- Prototypes are read-only. Point anything that would save, send or charge at a
  stub, and mark every stubbed service as simulated in the prototype and in the
  manifest.
- Keep variants independent. They may share a header, but each variant has its
  own layout, because the layout is what the owner is comparing.
- Prototype code never ships. Rebuild the winning variant properly, with tests
  and error handling, on the build branch.
- Record the verdict: which variant won, why, and which parts of the others the
  owner wants kept. Keep the losing variants on a throwaway branch named in
  that record, and remove the switcher and prototype routes from the main
  branch.

Credit: in-page variants, the switcher and the throwaway-branch rule are
adapted from Matt Pocock's prototype skill, github.com/mattpocock/skills (MIT
licence).
