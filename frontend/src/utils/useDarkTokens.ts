/**
 * useDarkTokens — returns the current design-token values based on the
 * active color scheme. All colors match the CSS custom properties defined
 * in index.css, so they are always in sync.
 *
 * Usage:
 *   const t = useDarkTokens();
 *   <Box style={{ backgroundColor: t.surface, color: t.textPrimary }} />
 */
import { useMantineColorScheme } from "@mantine/core";

export interface DarkTokens {
  isDark: boolean;

  // Backgrounds
  bg: string;
  surface: string;
  surfaceRaised: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Borders
  border: string;
  borderStrong: string;

  // Accent (blue) — identical in both modes
  accent: string;
  accentHover: string;
  accentSurface: string;
  accentBorder: string;

  // Status
  green: string;
  greenSurface: string;
  red: string;
  redSurface: string;
  yellow: string;
  yellowSurface: string;
  purple: string;
  purpleSurface: string;
  teal: string;
  tealSurface: string;
}

export function useDarkTokens(): DarkTokens {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  if (isDark) {
    return {
      isDark: true,
      bg:              "#000000",
      surface:         "#111111",
      surfaceRaised:   "#1A1A1A",
      textPrimary:     "#FFFFFF",
      textSecondary:   "#A0A0A0",
      textMuted:       "#606060",
      border:          "rgba(255,255,255,0.09)",
      borderStrong:    "rgba(255,255,255,0.16)",
      accent:          "#2563EB",
      accentHover:     "#3B82F6",
      accentSurface:   "rgba(37,99,235,0.15)",
      accentBorder:    "rgba(37,99,235,0.4)",
      green:           "#16A34A",
      greenSurface:    "rgba(22,163,74,0.12)",
      red:             "#DC2626",
      redSurface:      "rgba(220,38,38,0.12)",
      yellow:          "#D97706",
      yellowSurface:   "rgba(217,119,6,0.12)",
      purple:          "#7C3AED",
      purpleSurface:   "rgba(124,58,237,0.12)",
      teal:            "#0D9488",
      tealSurface:     "rgba(13,148,136,0.12)",
    };
  }

  return {
    isDark: false,
    bg:              "#F8FAFC",
    surface:         "#FFFFFF",
    surfaceRaised:   "#F1F5F9",
    textPrimary:     "#0F172A",
    textSecondary:   "#64748B",
    textMuted:       "#94A3B8",
    border:          "#E2E8F0",
    borderStrong:    "#CBD5E1",
    accent:          "#2563EB",
    accentHover:     "#1D4ED8",
    accentSurface:   "#EFF6FF",
    accentBorder:    "#BFDBFE",
    green:           "#16A34A",
    greenSurface:    "#F0FDF4",
    red:             "#DC2626",
    redSurface:      "#FEF2F2",
    yellow:          "#D97706",
    yellowSurface:   "#FFFBEB",
    purple:          "#7C3AED",
    purpleSurface:   "#F5F3FF",
    teal:            "#0D9488",
    tealSurface:     "#F0FDFA",
  };
}
