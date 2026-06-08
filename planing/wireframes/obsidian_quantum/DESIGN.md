---
name: Obsidian Quantum
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#ccc3d8'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#958da1'
  outline-variant: '#4a4455'
  surface-tint: '#d2bbff'
  primary: '#d2bbff'
  on-primary: '#3f008e'
  primary-container: '#7c3aed'
  on-primary-container: '#ede0ff'
  inverse-primary: '#732ee4'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#ffb3ad'
  on-tertiary: '#68000a'
  tertiary-container: '#c6252b'
  on-tertiary-container: '#ffdfdc'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#eaddff'
  primary-fixed-dim: '#d2bbff'
  on-primary-fixed: '#25005a'
  on-primary-fixed-variant: '#5a00c6'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  data-lg:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
  data-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-margin: 24px
  gutter: 16px
  panel-padding: 20px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The design system is engineered for institutional-grade AI trading, where precision, speed, and security are paramount. The brand personality is authoritative and sophisticated, evoking the feeling of a high-tech command center. 

The aesthetic is **Dark-Mode First Glassmorphism**, blending the depth of a "Deep Space" environment with the technical clarity of a professional financial tool. It utilizes semi-transparent surfaces, ultra-fine borders, and selective background blurs to create a sense of layered intelligence. The UI should feel immersive but never cluttered, using high-contrast typography and neon accents to direct user attention to critical market shifts and AI-generated signals.

## Colors

This design system utilizes a high-contrast, dark-centric palette designed for prolonged professional use and instant data recognition.

- **Backgrounds:** The foundation is a deep, obsidian navy (`#020617`). Surfaces use a translucent slate (`#1E293B` at 50% opacity) to facilitate glassmorphic layering.
- **Accents:** 
    - **Electric Violet (`#7C3AED`):** Reserved for AI insights, signals, and primary actions. It represents the "intelligence" layer of the platform.
    - **Neon Emerald (`#10B981`):** Represents growth, "up" movements, and successful executions.
    - **Crimson (`#EF4444`):** Represents decline, "down" movements, and critical alerts.
- **Borders:** Subtle, low-opacity white or slate borders provide structure without adding visual bulk.

## Typography

The typography system prioritizes legibility and data density. **Inter** is used for all UI labels and prose to ensure a clean, modern aesthetic. 

Crucially, **JetBrains Mono** (or Inter with `tnum` settings) is employed for all financial figures, price tickers, and quantitative data. This ensures tabular alignment, preventing the UI from "shaking" when numbers update rapidly. Headlines should remain tight and bold, while labels utilize increased letter spacing and uppercase styling for quick scanning of complex dashboards.

## Layout & Spacing

This design system uses a **fluid-grid model** with a base 4px rhythm. Layouts are structured around a 12-column system for desktop, collapsing to a single column for mobile. 

- **Panels:** The UI is composed of "Panels" rather than standard cards. These panels should sit edge-to-edge or with minimal 16px gutters to maximize screen real estate for charts.
- **Density:** High density is preferred. Vertical spacing between data rows should be kept to a minimum (8px) to allow traders to see maximum information without scrolling.
- **Breakpoints:**
  - **Mobile:** < 768px (Sidebars hidden, single-column feed)
  - **Tablet:** 768px - 1280px (Collapsible sidebars, 2-column dashboard)
  - **Desktop:** > 1280px (Permanent sidebars, multi-panel layout)

## Elevation & Depth

Depth is conveyed through **Tonal Layering** and **Glassmorphism** rather than traditional drop shadows.

1.  **Level 0 (Background):** Deepest navy (`#020617`), strictly flat.
2.  **Level 1 (Panels):** Semi-transparent surfaces with a 12px-20px backdrop blur. Borders are a crisp 1px solid `rgba(255, 255, 255, 0.08)`.
3.  **Level 2 (Modals/Popovers):** Higher opacity surfaces with a subtle "Outer Glow" in the primary color (Violet) or Neutral. Shadow property: `0 0 20px rgba(0, 0, 0, 0.5)`.
4.  **Active State:** Elements like active trading pairs or selected AI signals use a 1px border of the Primary color to denote focus.

## Shapes

The shape language is **Soft (0.25rem / 4px)**. While the platform feels "sharp" and professional, a minimal radius is applied to panels and buttons to prevent a dated, "brutalist" look. 

- **Buttons & Inputs:** Use the 4px base radius.
- **Panels/Cards:** Use the 8px (rounded-lg) radius to define major layout sections.
- **Status Indicators:** Chips and small badges should be fully rounded (pill-shaped) to distinguish them from actionable buttons.

## Components

- **Buttons:** Primary buttons use a solid Electric Violet. Secondary buttons use a "Ghost" style with a 1px border and a subtle hover glow.
- **Financial Charts:** Candlestick charts should use the Neon Emerald (Up) and Crimson (Down) colors. The Area chart for portfolio history should use a Violet gradient with a high-transparency fill.
- **Input Fields:** Darker than the panel surface (`rgba(0,0,0,0.2)`) with 1px borders that glow Violet on focus.
- **Status Indicators:** Small, circular "pulse" indicators next to "Live" data streams.
- **AI Signal Cards:** These should feature a vertical accent bar on the left in Electric Violet and a subtle backdrop-glow to separate them from standard market data.
- **Data Tables:** Zebra striping is discouraged. Use thin 1px horizontal dividers and hover states to highlight rows.