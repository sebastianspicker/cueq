# cueq Brand Guide

cueq is a German-first workforce operations product for time tracking,
absence management, roster planning, approvals, monthly closing, and
audit-oriented university workflows.

## Name and voice

- Write the product name as `cueq`, including at the start of a sentence.
- Pronounce it “cue-cue” (German: “kju kju”).
- German descriptor: “Zeiterfassung, Abwesenheit und Dienstplanung für
  Hochschulen.”
- English descriptor: “Time tracking, absence, and roster planning for
  universities.”

Use precise, calm language. Prefer specific state, permission, freshness, and
next-action information over promotional claims. Do not describe individual
performance, productivity scoring, or monitoring as product benefits.

## Identity implementation

The application icon is [`apps/web/src/app/icon.svg`](../apps/web/src/app/icon.svg).
The workspace wordmark and compact identity are rendered by
[`BrandMark.tsx`](../apps/web/src/components/BrandMark.tsx). No separate
documentation lockup is maintained.

The mirrored c/q mark represents an orderly queue and a completed operational
cycle. Keep the mark and wordmark horizontal when space allows. Keep clear
space around the mark at least equal to one stroke width, and do not render the
standalone mark below 24 CSS pixels.

The mark is decorative when the visible `cueq` wordmark is present. Hide it
from assistive technology and give the enclosing home link the accessible name
`cueq` plus the localized descriptor when that descriptor is visible.

## Color and typography

| Role              | Light value | Dark value |
| ----------------- | ----------- | ---------- |
| Archive ink       | `#0B1622`   | `#F2F6F7`  |
| Rhine teal        | `#076371`   | `#65B8CC`  |
| Campus canvas     | `#F8FAFB`   | `#101719`  |
| Record surface    | `#FFFFFF`   | `#172124`  |
| Slate copy        | `#576169`   | `#B6C5CA`  |
| Structural border | `#B4C7CB`   | `#405158`  |

Headings, controls, body copy, and the wordmark use the humanist system sans
stack in `globals.css`. The product does not require a network font. Technical
identifiers use the native monospace stack, tabular data uses tabular numerals,
and compact headings preserve operational space. Color never carries status
meaning by itself, and text/control combinations must retain WCAG AA contrast.

## Product application

- Use one Rhine teal accent for the mark, primary actions, links, and active
  navigation.
- Keep operational surfaces quiet and record-like. Use borders, spacing, and
  rare low elevation from `globals.css`; avoid decorative color effects that
  compete with operational state. Use the separate focus-blue token for a
  clearly visible keyboard focus indicator.
- Use the full descriptor in the desktop identity block and the compact wordmark
  plus current role in the mobile header.
- Keep institution names subordinate to the cueq identity. They are deployment
  context, not part of the permanent wordmark.
- Preserve lowercase `cueq` in metadata, breadcrumbs, screenshots, and prose.

Do not rotate, stretch, outline, recolor by status, place the mark in a crest,
add gradients, or combine it with clock, shield, checkmark, or people symbols.
Do not rename `@cueq/*` packages, database identifiers, API event sources,
metrics, repository URLs, or other technical compatibility surfaces as part of
visual branding work.
