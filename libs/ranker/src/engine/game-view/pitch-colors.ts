// Each pitch type's color, by its name as MLB's feeds give it (the game view's pitch chart and arsenal, the
// Heat Maps' pitch-type picker; the rest grey)
const PITCH_COLORS: Record<string, string> = {
  'Four-seam FB': '#ff5a4f',
  'Four-Seam Fastball': '#ff5a4f',
  Fastball: '#ff5a4f',
  Sinker: '#ff9f40',
  'Two-seam FB': '#ff9f40',
  'Two-Seam Fastball': '#ff9f40',
  Cutter: '#c9875a',
  Slider: '#ffd54a',
  Sweeper: '#d4b400',
  Slurve: '#b9d04a',
  Curve: '#5ab4ff',
  Curveball: '#5ab4ff',
  'Knuckle Curve': '#3d8bd9',
  Changeup: '#3ecf6e',
  Splitter: '#2fd3c5',
  'Split-Finger': '#2fd3c5',
  Forkball: '#2fd3c5',
  Knuckleball: '#b48cff',
  Eephus: '#e0e0e0',
};

export const pitchColor = (type: string): string => PITCH_COLORS[type] ?? '#9aa0a6';
