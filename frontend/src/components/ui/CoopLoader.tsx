/**
 * CO OP loader — the equalizer-bar spinner used for every in-app loading
 * state (route changes, splash, auth resolution) so the app feels consistent
 * with the boot loader. Themed via the active palette's primary color.
 */
import React from 'react';
import { useCoopTheme } from '../../theme-provider';

export interface CoopLoaderProps {
  /** Width in px (height follows the 0.75 aspect ratio). Default 45. */
  size?: number;
  /** Accessible label. */
  label?: string;
  style?: React.CSSProperties;
}

const CoopLoader: React.FC<CoopLoaderProps> = ({ size = 45, label = 'Loading', style }) => {
  const { colors } = useCoopTheme();
  return (
    <div
      role="status"
      aria-label={label}
      className="loader"
      style={
        {
          width: size,
          '--loader-color': colors.primary,
          ...style,
        } as React.CSSProperties
      }
    />
  );
};

export default CoopLoader;
