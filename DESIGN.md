---
name: cueq
description: Trusted operations workspace for university time and workforce administration
colors:
  accent: '#155F75'
  accent-hover: '#0E4C5E'
  accent-soft: '#E1F1F4'
  canvas: '#F5F7F8'
  surface: '#FFFFFF'
  surface-subtle: '#EAF0F2'
  ink: '#152126'
  ink-muted: '#4B5C63'
  border: '#C8D3D7'
  success: '#16704B'
  warning: '#8A5A08'
  danger: '#A73737'
  focus: '#087EA4'
  dark-canvas: '#101719'
  dark-surface: '#172124'
  dark-surface-subtle: '#202D31'
  dark-ink: '#F2F6F7'
  dark-ink-muted: '#B6C5CA'
  dark-border: '#405158'
typography:
  headline:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '1.5rem'
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: '-0.015em'
  title:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: '-0.01em'
  body:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 'normal'
  label:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: 'normal'
rounded:
  sm: '6px'
  md: '8px'
  lg: '12px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
  xl: '32px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.surface}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: '10px 16px'
    height: '40px'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: '10px 16px'
    height: '40px'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: '9px 12px'
    height: '40px'
  status-chip:
    backgroundColor: '{colors.surface-subtle}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    padding: '4px 8px'
---

# Design System: cueq

## Overview

**Creative North Star: "Trusted Operations Desk"**

Staff use cueq in bright university offices and quieter after-hours operations,
reviewing sensitive queues where a wrong action has payroll, legal, or privacy
consequences. The interface is therefore light-first, compact, and materially
quiet, with an equally complete dark theme for low-light work. It borrows
Stripe's alignment precision, Linear's state discipline, and Raycast's command
efficiency without imitating their branding.

The shell behaves as a precision workspace. Queue-and-detail arrangements lead
approvals, closing, audit, and reporting. Drawers hold secondary context only;
primary status and action prerequisites remain in the main reading order.
Solid tonal layers and fine borders carry structure. Decoration never competes
with permission, state, or evidence.

**Key Characteristics:**

- Dense but calm operational hierarchy.
- German-first labels with exact English parity.
- Role-aware navigation and action presentation.
- Solid cool-neutral surfaces with one restrained civic accent.
- Complete state vocabulary across light, dark, desktop, and mobile layouts.

## Colors

The palette uses cool institutional neutrals and a deep blue-teal civic accent;
semantic colors communicate state and never become decoration.

### Primary

- **Ledger Blue:** Reserved for the active location, primary action, selected
  state, and focus-adjacent emphasis. It occupies no more than ten percent of a
  typical screen.
- **Ledger Blue Hover:** The deliberate pressed and hover response for primary
  actions, never a decorative alternate accent.
- **Ledger Wash:** A low-emphasis selected or informational surface that always
  retains dark readable text.

### Neutral

- **Office Canvas:** The page background in the light theme.
- **Working Surface:** The primary reading and editing surface.
- **Queue Layer:** Toolbars, side navigation, selected rows, and grouped detail.
- **Record Ink / Muted Record Ink:** Primary and supporting copy with WCAG 2.1
  AA contrast.
- **Rule Line:** Table divisions, control outlines, and structural boundaries.
- **Night Canvas / Night Surface / Night Queue:** Dark-theme equivalents with
  the same hierarchy, not an alternate visual identity.

### Named Rules

**The One Civic Accent Rule.** Accent marks an actionable or selected state. It
never fills dashboards for atmosphere.

**The Semantic Restraint Rule.** Success, warning, and danger appear with text
or icons and only where the state exists; color alone never carries meaning.

## Typography

**Display Font:** System UI sans with platform fallbacks
**Body Font:** System UI sans with platform fallbacks

**Character:** A single familiar sans family keeps labels, records, and actions
coherent. Weight and spacing establish hierarchy without theatrical display
type.

### Hierarchy

- **Headline** (700, 1.5rem, 1.25): Page and detail titles only.
- **Title** (650, 1.125rem, 1.35): Sections, queue groups, and dialogs.
- **Body** (400, 1rem, 1.5): Instructions and record content; prose is capped at
  72 characters per line.
- **Label** (600, 0.875rem, 1.35): Controls, metadata labels, and compact table
  headers; sentence case is the default.

### Named Rules

**The Operational Scale Rule.** Product headings use a fixed rem scale. No
fluid hero typography, display font, or tracked uppercase eyebrow is permitted.

## Elevation

cueq is flat by default. Tonal layers and fine borders express structure;
shadow appears only when a drawer, menu, or sticky toolbar must sit above
scrolling content. The maximum structural shadow uses an 8px blur.

### Shadow Vocabulary

- **Floating control** (`0 2px 8px rgba(10, 31, 38, 0.14)`): Menus and drawers
  only, without a decorative border-and-wide-shadow pairing.

### Named Rules

**The Structural Shadow Rule.** If a surface does not overlap other content, it
does not receive a shadow.

## Components

Components are compact, familiar, and complete across default, hover, focus,
active, disabled, loading, error, and success states.

### Buttons

- **Shape:** Gently squared (8px), 40px high, with 10px by 16px padding.
- **Primary:** Ledger Blue with white text; one primary action per local task
  region.
- **Hover / Focus:** Darker tonal response in 180ms and a visible 2px focus ring
  with 2px offset.
- **Secondary / Ghost / Danger:** Solid surface with structural border, quiet
  text-only treatment, or semantic danger treatment respectively. Disabled
  actions retain readable labels and an adjacent reason.

### Chips

- **Style:** Compact 6px corners, solid tonal background, readable text, and a
  text or icon cue in addition to semantic color.
- **State:** Status chips are informational; interactive filters use button
  semantics and visible selected state.

### Cards / Containers

- **Corner Style:** 8px for work panels and 12px for major drawers.
- **Background:** Solid Working Surface or Queue Layer.
- **Shadow Strategy:** None at rest; use the structural shadow only for overlap.
- **Border:** One fine Rule Line where tonal separation is insufficient.
- **Internal Padding:** 16px compact, 24px standard, 32px only for an empty state.

### Inputs / Fields

- **Style:** Solid surface, 1px structural outline, 8px corners, and persistent
  visible labels.
- **Focus:** 2px Focus ring with offset; never color-only.
- **Error / Disabled:** Inline privacy-safe explanation, semantic icon or text,
  and AA-readable content.

### Navigation

The desktop workspace uses a stable compact rail and page toolbar. Active state
combines position, weight, and a tonal fill. Mobile collapses to an accessible
navigation drawer while preserving route names and focus order. Unauthorized
destinations are omitted; unavailable services show connection state globally.

### Queue and Detail Workspace

Approvals, closing, audit, and reporting use a selectable queue beside a detail
region on wide screens and a reversible list-to-detail flow on small screens.
Primary facts and prerequisites remain visible; secondary evidence opens in a
contextual drawer.

## Do's and Don'ts

### Do:

- **Do** show permission, current state, prerequisites, freshness, and the next
  valid action in the main reading order.
- **Do** use 8–12px surface radii, solid tonal layers, subtle borders, and
  150–250ms state motion with a reduced-motion alternative.
- **Do** omit unauthorized controls and pair authorized-but-invalid disabled
  controls with an adjacent explanation.
- **Do** preserve German-first copy, English parity, keyboard access, visible
  focus, and light/dark semantic equivalence.

### Don't:

- **Don't** use SaaS gamification, competitive productivity scores,
  surveillance metrics, or attention-seeking dashboards.
- **Don't** use marketing hero layouts, oversized metric cards, action clutter,
  or decorative empty space that buries evidence.
- **Don't** use glassmorphism, blur, gradients, gradient text, broad ambient
  shadows, oversized radii, bounce motion, or decorative animation.
- **Don't** use a colored side-stripe border, identical icon-card grids, tracked
  uppercase eyebrows, or status color without text.
- **Don't** imply permission with a visible unauthorized control or hide the
  reason an authorized action is temporarily unavailable.
