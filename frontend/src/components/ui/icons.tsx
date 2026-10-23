/**
 * Co-op icon set.
 *
 * The design system's iconography is Material Symbols (Rounded). To stay
 * dependency-free and offline-safe (Electron), the few signature glyphs the
 * design relies on are provided as inline SVGs here; everything else keeps
 * using @ant-design/icons (themed via ConfigProvider).
 */
import React from 'react';

export interface CoopIconProps {
  size?: number;
  color?: string;
  /** Solid (filled) rendering, e.g. the active nav mark. */
  filled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * `auto_awesome` — the Zeno sparkle: one large 4-point star with two
 * small companions. This is the AI identity mark (Stage R1).
 */
export const SparkleIcon: React.FC<CoopIconProps> = ({
  size = 20,
  color = 'currentColor',
  className,
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    aria-hidden
    className={className}
    style={style}
  >
    <path d="M13.2 2.4c.2-.5 1-.5 1.2 0l1.9 5.3c.1.2.3.4.5.5l5.3 1.9c.5.2.5 1 0 1.2l-5.3 1.9c-.2.1-.4.3-.5.5l-1.9 5.3c-.2.5-1 .5-1.2 0l-1.9-5.3a.7.7 0 0 0-.5-.5l-5.3-1.9c-.5-.2-.5-1 0-1.2l5.3-1.9c.2-.1.4-.3.5-.5l1.9-5.3Z" />
    <path d="M5.2 15.9c.13-.36.63-.36.76 0l.8 2.2c.04.1.12.19.22.23l2.2.8c.36.13.36.63 0 .76l-2.2.8a.35.35 0 0 1-.22.22l-2.2.8c-.36.13-.63-.36-.5-.76l.8-2.2a.35.35 0 0 0-.22-.22l-2.2-.8c-.36-.13-.19-.63.17-.5l2.2.8a.35.35 0 0 1-.4-.76l.83-2.24Z" />
    <path d="M19.4 2.6c.1-.27.47-.27.57 0l.6 1.66c.03.08.09.14.17.17l1.66.6c.27.1.27.47 0 .57l-1.66.6a.25.25 0 0 0-.17.17l-.6 1.66c-.1.27-.47.27-.57 0l-.6-1.66a.25.25 0 0 0-.17-.17l-1.66-.6c-.27-.1-.27-.47 0-.57l1.66-.6a.25.25 0 0 0 .17-.17l.6-1.66Z" />
  </svg>
);

/** `dashboard` mark — used for the brand tile on mobile headers. */
export const DashboardMark: React.FC<CoopIconProps> = ({
  size = 20,
  color = 'currentColor',
  className,
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    aria-hidden
    className={className}
    style={style}
  >
    <path d="M3 3h8v10H3V3Zm10 0h8v6h-8V3Zm0 8h8v10h-8V11ZM3 15h8v6H3v-6Z" />
  </svg>
);

/** `trending_up` — KPI trend pill. */
export const TrendUpIcon: React.FC<CoopIconProps> = ({ size = 14, color = 'currentColor', className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden className={className} style={style}>
    <path d="M3.5 13.5 9 19l4-4 7 7" stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="translate(0,-3)" />
    <path d="M14 10h5v5" stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="translate(0,-3)" />
  </svg>
);

/** `trending_down` — KPI trend pill. */
export const TrendDownIcon: React.FC<CoopIconProps> = ({ size = 14, color = 'currentColor', className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden className={className} style={style}>
    <path d="M3.5 10.5 9 5l4 4 7-7" stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="translate(0,3)" />
    <path d="M14 13h5v-5" stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="translate(0,3)" />
  </svg>
);
