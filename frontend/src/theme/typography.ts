/**
 * Co-op Design System — Typography tokens (Stitch Stage R0).
 *
 * Inter is the exclusive typeface (400 / 600 / 700). The scale is deliberately
 * limited — no more than three distinct type levels on a single view
 * (DESIGN.md, Typography) — and `labelCaps` provides the utilitarian,
 * uppercase metadata/headers treatment.
 */

export const fontFamily =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export const fontWeight = {
  regular: 400,
  semibold: 600,
  bold: 700,
} as const;

export interface TypeStyle {
  fontSize: number;
  /** Line height in PX. Must carry the unit: React writes numeric style
   * values as-is, and a unitless CSS line-height is a multiplier of the
   * font size — lineHeight: 20 on 13px text would produce a 260px line
   * box (huge gaps above/below text). */
  lineHeight: string;
  fontWeight: number;
  /** em-based letter spacing (0 = normal). */
  letterSpacing: number;
}

export const type: Record<string, TypeStyle> = {
  // 32/40/700, tight tracking — desktop page titles
  pageTitle: { fontSize: 32, lineHeight: '40px', fontWeight: 700, letterSpacing: -0.02 },
  // 24/32/700 — mobile page titles
  pageTitleMobile: { fontSize: 24, lineHeight: '32px', fontWeight: 700, letterSpacing: -0.01 },
  // 20/28/600 — section & card headings
  sectionHeading: { fontSize: 20, lineHeight: '28px', fontWeight: 600, letterSpacing: 0 },
  // 16/24/600 — sub-headings, chart titles, emphasized list items
  titleMd: { fontSize: 16, lineHeight: '24px', fontWeight: 600, letterSpacing: 0 },
  // 16/24/400 — default body / paragraphs
  bodyDefault: { fontSize: 16, lineHeight: '24px', fontWeight: 400, letterSpacing: 0 },
  // 14/20/400 — dense tables, secondary descriptions
  bodyCompact: { fontSize: 14, lineHeight: '20px', fontWeight: 400, letterSpacing: 0 },
  // 12/16/600 + 0.05em — uppercase metadata, table headers, pills
  labelCaps: { fontSize: 12, lineHeight: '16px', fontWeight: 600, letterSpacing: 0.05 },
} as const;

export type TextStyleName = keyof typeof type;
