---
name: "EduPay Académico"
description: "La Ruta de Aprendizaje: un entorno académico cálido, claro y orientado al próximo paso."
colors:
  default-primary: "#334e68"
  default-primary-medium: "#486581"
  default-primary-dark: "#243b53"
  default-accent: "#d5a021"
  default-accent-hover: "#b78212"
  default-educational: "#3d777b"
  default-creative: "#735b7b"
  default-background: "#f5f6f4"
  default-surface: "#ffffff"
  default-surface-secondary: "#eef1f3"
  default-selected: "#e4ebf0"
  default-border: "#d5dce1"
  default-text: "#243b53"
  default-text-secondary: "#526777"
  default-success: "#267052"
  default-warning: "#8d6000"
  default-error: "#ac3f47"
  default-focus: "#e1a51c"
  conquistadores-primary: "#1d2f70"
  conquistadores-primary-medium: "#2d4b82"
  conquistadores-primary-dark: "#14234f"
  conquistadores-accent: "#e6b83f"
  conquistadores-accent-hover: "#c99520"
  conquistadores-educational: "#477e82"
  conquistadores-creative: "#74527d"
  conquistadores-background: "#f5f3ee"
  conquistadores-surface: "#fffefa"
  conquistadores-surface-secondary: "#f0f1f5"
  conquistadores-selected: "#e4e9f1"
  conquistadores-border: "#d7dce5"
  conquistadores-text: "#263149"
  conquistadores-text-secondary: "#5f687b"
  conquistadores-success: "#2e765a"
  conquistadores-warning: "#9a6500"
  conquistadores-warning-foreground: "#885900"
  conquistadores-error: "#b1444b"
  conquistadores-focus: "#f0b429"
  on-brand: "#ffffff"
  on-accent: "#252016"
typography:
  display:
    fontFamily: "var(--font-montserrat, 'Montserrat'), 'Montserrat', 'Avenir Next', Avenir, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.55rem)"
    fontWeight: 790
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "var(--font-montserrat, 'Montserrat'), 'Montserrat', 'Avenir Next', Avenir, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.45rem, 3vw, 2.15rem)"
    fontWeight: 700
    lineHeight: 1.16
    letterSpacing: "-0.03em"
  title:
    fontFamily: "var(--font-montserrat, 'Montserrat'), 'Montserrat', 'Avenir Next', Avenir, 'Segoe UI', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "var(--font-montserrat, 'Montserrat'), 'Montserrat', 'Avenir Next', Avenir, 'Segoe UI', sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "var(--font-montserrat, 'Montserrat'), 'Montserrat', 'Avenir Next', Avenir, 'Segoe UI', sans-serif"
    fontSize: "0.72rem"
    fontWeight: 750
    lineHeight: 1.1
rounded:
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  pill: "999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
  2xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.conquistadores-primary}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.sm}"
    padding: "0.68rem 1rem"
    height: "44px"
  button-accent:
    backgroundColor: "{colors.conquistadores-accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "0.68rem 1rem"
    height: "44px"
  input:
    backgroundColor: "{colors.conquistadores-surface}"
    textColor: "{colors.conquistadores-text}"
    rounded: "{rounded.sm}"
    padding: "0.7rem 0.82rem"
    height: "44px"
  badge-warning:
    textColor: "{colors.conquistadores-warning-foreground}"
    rounded: "{rounded.pill}"
    padding: "0.28rem 0.58rem"
    height: "26px"
  card:
    backgroundColor: "{colors.conquistadores-surface}"
    textColor: "{colors.conquistadores-text}"
    rounded: "{rounded.lg}"
---

# Design System: EduPay Académico

## Overview

**Creative North Star: "La Ruta de Aprendizaje"**

EduPay Académico is a warm, professional learning workspace whose hierarchy always points to the next meaningful step. Institutional structure is calm and dependable; tactile route markers and restrained educational accents make progress visible without resembling an ERP, generic LMS, or glass dashboard.

The default theme supplies a tenant-neutral slate foundation. Colegio Conquistadores overrides the same semantic roles with its institutional navy, warm paper surfaces, and precise yellow attention color; components never fork by tenant.

**Key Characteristics:**

- Work-first hierarchy with the next action visible early.
- Warm paper surfaces, disciplined institutional color, and restrained depth.
- Montserrat across interface roles, with tight tracking only at larger scales.
- Circular markers for sequence and progress; rounded rectangles for work surfaces.
- Semantic tenant theming without component forks.

## Colors

The default palette is slate-led and neutral; Colegio Conquistadores maps the same roles to deeper navy, warmer surfaces, and a brighter attention yellow.

### Primary

- **Institutional Route:** `default-primary` / `conquistadores-primary` anchors navigation, progress, route markers, and primary actions.
- **Navigation State:** `default-primary-medium` / `conquistadores-primary-medium` identifies active and hovered institutional controls.
- **Deep Authority:** `default-primary-dark` / `conquistadores-primary-dark` carries sidebars, tooltips, and strong hover states.

### Secondary

- **Attention Yellow:** the accent pair marks deadlines and forward action; it always uses `on-accent`, never white text.
- **Educational Teal:** the educational pair distinguishes learning progress and assessment-oriented content.

### Tertiary

- **Creative Purple:** the creative pair differentiates announcements or creative learning content without competing with primary actions.

### Neutral

- Background, surface, secondary-surface, selected, border, text, and secondary-text pairs preserve the same contrast hierarchy in both themes.
- Success, warning, error, and focus pairs are semantic state roles and always receive a text or icon cue.
- `on-brand` and `on-accent` are shared contrast colors.

**The Yellow Carries Meaning Rule.** Yellow is reserved for attention and forward action and never carries white text.

**The Semantic Tenant Rule.** Change tenant identity through semantic tokens, never through component forks.

## Typography

**Display, Body, and Label Font:** Montserrat, with Avenir Next, Avenir, Segoe UI, and sans-serif fallbacks.

**Character:** One clear, contemporary academic voice. Weight, scale, spacing, and color create hierarchy; decorative font changes do not.

### Hierarchy

- **Display:** bold, tightly tracked page greetings and decisive assignment titles.
- **Headline:** major next-step panels and subject headers.
- **Title:** section headings and compact surface titles.
- **Body:** open, readable explanations and guidance, generally held near 60–68 characters per line.
- **Label:** compact badges, metadata, and category names.

**The One Academic Voice Rule.** Use Montserrat throughout application chrome; Georgia is permitted only inside simulated document content.

## Layout

The desktop shell uses a 16.5rem sidebar, a 4.3rem top bar, and a centered content area capped at 86rem. Content padding is fluid from 1.35rem to 2.6rem. At 1180px, broad card grids reduce density; at 900px, the sidebar becomes an off-canvas drawer and primary work layouts become one column; at 680px, padding tightens and essential navigation moves to a three-item bottom bar; at 400px, compound actions stack.

Spacing follows the 0.25, 0.5, 0.75, 1, 1.25, and 2rem rhythm. Interactive targets retain an approximately 44×44px floor.

**The Next Step First Rule.** Place the meaningful learning or review action in the first viewport; supporting administration follows.

## Elevation & Depth

Depth combines tonal layering with restrained ambient shadow. The warm background and paper surfaces do most structural work; shadow confirms interactive lift, overlays, navigation drawers, and the primary route surface.

### Shadow Vocabulary

- **Ambient Surface:** a low 0 3px 12px shadow for cards and grouped panels.
- **Interactive Lift:** a 0 12px 32px shadow for hovered cards, menus, dialogs, and drawers.
- **Route Emphasis:** a deeper 0 14px 32px navy shadow reserved for the student next-step hero.

**The Ambient-First Rule.** Stronger lift appears only for hierarchy, overlay, or interaction.

## Shapes

Compact controls use the 0.5rem radius, grouped alerts and resource blocks use 0.75rem, and cards, dialogs, and major panels use 1rem. Pills communicate compact status; circles mark identity, subject codes, route progress, instructions, and attention. Dashed borders are reserved for upload dropzones and explicit institutional-logo placeholders.

**The Route Marker Rule.** Circular markers are functional landmarks in a learning sequence, not free-floating decoration.

## Components

### Buttons

Buttons are tactile and confident with a 44px minimum height. Primary blue deepens on hover; accent yellow shifts to ochre; secondary and ghost variants use quiet tonal fills. Focus uses a 3px semantic focus outline with a 3px offset, and disabled controls use 58% opacity.

### Chips

Badges are compact 26px semantic pills with bold labels and optional icons. Quiet mixed-color fills support status, but status is never color-only.

### Cards / Containers

Cards use the 1rem radius, paper surface, and ambient shadow. Interactive cards lift 2px into the stronger shadow over 220ms. Typical internal padding is 1–1.25rem.

### Inputs / Fields

Fields use a 1px semantic border, paper background, 0.5rem radius, visible labels, and a 44px minimum height. Hover shifts the border toward medium primary; focus uses the global ring; errors pair red with explicit copy.

### Navigation

Desktop navigation is a deep-primary fixed sidebar with quiet white labels and a medium-primary active state. It becomes an off-canvas drawer at 900px and gains the essential three-item bottom bar at 680px.

### Learning Route

The signature route uses a thin vertical guide, numbered circular unit markers, paper groups, and semantic item accents. On mobile, metadata reflows beneath titles while the visible sequence remains intact.

## Do's and Don'ts

### Do:

- **Do** place the next meaningful learning or review action before broad summaries.
- **Do** preserve visible labels, non-color status cues, strong focus rings, and 44px targets.
- **Do** use the same semantic component structure for every tenant.
- **Do** preserve the vertical route and circular markers for learning sequence.

### Don't:

- **Don't** turn the workspace into a dense ERP dashboard, generic LMS grid, marketing page, or glassmorphic control center.
- **Don't** use white text on yellow or use yellow as a general decorative fill.
- **Don't** invent a Colegio Conquistadores crest; keep the explicit placeholder until an approved asset exists.
- **Don't** imply grades, attendance, finance, chat, or unresolved submission semantics through visual copy.
