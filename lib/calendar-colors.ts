// Colores de Google Calendar: nombre ↔ colorId ↔ hex. Una sola fuente de verdad.

export const COLOR_NAMES = [
  'rojo', 'naranja', 'amarillo', 'verde', 'turquesa', 'azul',
  'morado', 'lavanda', 'flamingo', 'salvia', 'grafito',
] as const;
export type ColorName = (typeof COLOR_NAMES)[number];

export const nameToColorId: Record<ColorName, string> = {
  rojo: '11', naranja: '6', amarillo: '5', verde: '10', turquesa: '7', azul: '9',
  morado: '3', lavanda: '1', flamingo: '4', salvia: '2', grafito: '8',
};

export const colorIdToHex: Record<string, string> = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73', '5': '#f6bf26',
  '6': '#f4511e', '7': '#039be5', '8': '#616161', '9': '#3f51b5', '10': '#0b8043', '11': '#d50000',
};

export const DEFAULT_EVENT_HEX = '#039be5';

export function hexForColorId(colorId: string | null): string {
  return (colorId && colorIdToHex[colorId]) || DEFAULT_EVENT_HEX;
}
