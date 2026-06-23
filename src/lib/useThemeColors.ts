import { useMemo } from 'react'
import { useTheme } from '../store/ThemeContext'

export interface ChartColors {
  /** Brand accent for fills/lines (stays bright cyan in both themes). */
  accent: string
  /** Readable accent for emphasis text in tooltips. */
  accentText: string
  grid: string
  axis: string
  tooltipBg: string
  tooltipBorder: string
  /** Cursor highlight fill on hover. */
  cursorFill: string
  /** Stroke separating pie slices. */
  sliceStroke: string
  /** Default secondary text inside custom tooltips. */
  mutedText: string
  fgText: string
}

const DARK: ChartColors = {
  accent: '#00f5d4',
  accentText: '#00f5d4',
  grid: 'rgba(255,255,255,0.05)',
  axis: '#64748b',
  tooltipBg: '#0c0d0f',
  tooltipBorder: 'rgba(255,255,255,0.08)',
  cursorFill: 'rgba(255,255,255,0.03)',
  sliceStroke: '#0c0d0f',
  mutedText: '#94a3b8',
  fgText: '#ffffff',
}

const LIGHT: ChartColors = {
  // Keep vivid cyan for chart FILLS (bars/areas read fine on white), but use a
  // darker teal for thin lines + emphasis text where contrast matters.
  accent: '#0d9488',
  accentText: '#0d9488',
  grid: 'rgba(15,23,42,0.07)',
  axis: '#64748b',
  tooltipBg: '#ffffff',
  tooltipBorder: 'rgba(15,23,42,0.10)',
  cursorFill: 'rgba(15,23,42,0.04)',
  sliceStroke: '#ffffff',
  mutedText: '#64748b',
  fgText: '#0f172a',
}

/** Theme-reactive color set for Recharts (which take JS color values, not classes). */
export function useThemeColors(): ChartColors {
  const { theme } = useTheme()
  return useMemo(() => (theme === 'dark' ? DARK : LIGHT), [theme])
}
