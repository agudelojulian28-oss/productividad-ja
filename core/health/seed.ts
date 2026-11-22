import { ok, type Result, type ActorContext } from '@/core/types';
import type { HealthSeedNode, HealthRepo, GroceryInsert } from './ports';

// Plan inicial transcrito de la "Planeación final 2026 y 2027 — Inquebrantable" de Julián
// (fotos del cuaderno + "Compromisos con Dios"). Todo es editable; lo que no se leyó bien
// en el manuscrito va con needsReview=true para revisarlo en la app.

type SeedNode = HealthSeedNode;

const L = 1, M = 2, Mi = 3, J = 4, V = 5, S = 6, D = 7;

export const SEED_PLAN: SeedNode[] = [
  // ── Espiritual ────────────────────────────────────────────────────────────
  { section: 'espiritual', kind: 'compromiso', title: 'No trabajar los domingos', sortOrder: 1 },
  { section: 'espiritual', kind: 'compromiso', title: 'Celebrar la misa una vez a la semana', sortOrder: 2 },
  { section: 'espiritual', kind: 'compromiso', title: 'Diezmar el 10% de mis ingresos', sortOrder: 3 },
  { section: 'espiritual', kind: 'compromiso', title: 'Confiar sin duda', sortOrder: 4 },
  { section: 'espiritual', kind: 'compromiso', title: 'Arrepentirme de mis pecados', sortOrder: 5 },
  { section: 'espiritual', kind: 'compromiso', title: 'Vivir según la Biblia', sortOrder: 6 },
  { section: 'espiritual', kind: 'compromiso', title: 'Ser congruente con lo que pido y doy', sortOrder: 7 },
  { section: 'espiritual', kind: 'compromiso', title: 'Amar a mi familia y consentirme', sortOrder: 8 },
  {
    section: 'espiritual',
    kind: 'habito',
    title: 'Hora dorada',
    detail: 'Rutina espiritual de ~30 minutos.',
    durationMin: 30,
    trackable: true,
    sortOrder: 10,
    children: [
      { kind: 'habito', title: 'Oración de la hora dorada', durationMin: 5, sortOrder: 1 },
      { kind: 'habito', title: 'Mantras y creencias', durationMin: 5, sortOrder: 2 },
      { kind: 'habito', title: 'Meditación: recorrido del día', durationMin: 10, sortOrder: 3 },
      { kind: 'habito', title: 'Diario personal', durationMin: 5, sortOrder: 4 },
      { kind: 'habito', title: 'Revisar agenda y escribir qué necesito para cada tarea del día', durationMin: 5, sortOrder: 5 },
      { kind: 'habito', title: 'Leer la Biblia y escribir reflexiones', detail: 'Durante el día.', sortOrder: 6 },
    ],
  },

  // ── Cuerpo (tratamiento del pelo) ─────────────────────────────────────────
  { section: 'cuerpo', kind: 'tratamiento', title: 'Pastillas (tratamiento de pelo)', detail: '2 al día.', trackable: true, sortOrder: 1 },
  { section: 'cuerpo', kind: 'tratamiento', title: 'Minoxidil', detail: '3 al día (revisar dosis).', trackable: true, needsReview: true, sortOrder: 2 },

  // ── Entrenamiento: semana L A1 · M B · Mi A2 · J B · V A1 · S B · D descanso ──
  {
    section: 'entrenamiento',
    kind: 'rutina',
    title: 'A1 · Full body',
    detail: 'Calentamiento + hombro con bandas · cardio. 3–4 series; 1 de aproximación en todos los ejercicios.',
    weekdays: [L, V],
    durationMin: 105,
    trackable: true,
    sortOrder: 1,
    children: [
      { kind: 'ejercicio', title: 'Biserie: press militar con barra + sentadilla libre', detail: 'Alternado con vuelos y … (revisar).', needsReview: true, sortOrder: 1 },
      { kind: 'ejercicio', title: 'Press de pecho acostado con mancuernas', sortOrder: 2 },
      { kind: 'ejercicio', title: 'Jalón al pecho en polea', sortOrder: 3 },
      { kind: 'ejercicio', title: 'Biserie: extensión de tríceps en polea + curl de bíceps (polea / martillo con disco)', needsReview: true, sortOrder: 4 },
      { kind: 'ejercicio', title: 'Abdomen: jalón de cadera en polea', sortOrder: 5 },
      { kind: 'ejercicio', title: 'Cierre — biserie: hiperextensión de espalda baja + curl de cuello', sortOrder: 6 },
    ],
  },
  {
    section: 'entrenamiento',
    kind: 'rutina',
    title: 'B · Cardio',
    detail: 'Todos los días B iguales. Calentamiento + terapia + calistenia.',
    weekdays: [M, J, S],
    durationMin: 105,
    trackable: true,
    sortOrder: 2,
    children: [
      { kind: 'ejercicio', title: 'Calentamiento', sortOrder: 1 },
      { kind: 'ejercicio', title: 'Terapia / estiramiento', durationMin: 45, sortOrder: 2 },
      { kind: 'ejercicio', title: 'Spiderman (calistenia): 10 flexiones · 15 sentadillas · 10 jalones de pecho', detail: '20 min sin parar.', sortOrder: 3 },
    ],
  },
  {
    section: 'entrenamiento',
    kind: 'rutina',
    title: 'A2 · Full body',
    detail: 'Cardio, calentamiento + hombro.',
    weekdays: [Mi],
    durationMin: 105,
    trackable: true,
    sortOrder: 3,
    children: [
      { kind: 'ejercicio', title: 'Biserie: peso muerto + remo', needsReview: true, sortOrder: 1 },
      { kind: 'ejercicio', title: 'Press de pecho acostado con mancuernas', sortOrder: 2 },
      { kind: 'ejercicio', title: 'Misma biserie pero sentado + extensión de tríceps sobre la cabeza', sortOrder: 3 },
      { kind: 'ejercicio', title: 'Abdomen y mismo cierre', sortOrder: 4 },
    ],
  },
  {
    section: 'entrenamiento',
    kind: 'rutina',
    title: 'Descanso / recuperación',
    detail: 'Domingo: sin entrenamiento ni trabajo. Día de recuperación.',
    weekdays: [D],
    sortOrder: 4,
  },

  // ── Dieta ─────────────────────────────────────────────────────────────────
  { section: 'dieta', kind: 'comida', title: 'Desayuno', detail: '100 g de carbohidratos + 2 huevos.', timeOfDay: '11:00', durationMin: 30, trackable: true, sortOrder: 1 },
  { section: 'dieta', kind: 'comida', title: 'Almuerzo', detail: '100 g de carbohidratos + ensalada (pico de gallo con pepino) + 150 g de pollo o carne.', timeOfDay: '15:00', durationMin: 30, trackable: true, sortOrder: 2 },
  { section: 'dieta', kind: 'comida', title: 'Postre o algo', detail: 'Yogurt griego + whey + banano + canela + miel.', timeOfDay: '16:00', durationMin: 30, trackable: true, sortOrder: 3 },
  { section: 'dieta', kind: 'comida', title: 'Cena', detail: 'Tortillas de arroz y maíz (carbohidratos) + ensalada + 150 g de pescado.', timeOfDay: '18:00', durationMin: 30, trackable: true, sortOrder: 4 },
  { section: 'dieta', kind: 'comida', title: 'Postcena', detail: 'Helado en Ninja Creamy (2 días): mango + sandía · remolacha y fresa con whey.', timeOfDay: '20:00', durationMin: 30, trackable: true, needsReview: true, sortOrder: 5 },
  { section: 'dieta', kind: 'habito', title: 'Preparar comida (domingo)', detail: '2 horas de cocina. Hacer la lista y mercar.', weekdays: [D], durationMin: 120, trackable: true, sortOrder: 6 },
  { section: 'dieta', kind: 'habito', title: 'Preparación diaria', detail: '30 minutos al día: dejar casi listas todas las comidas.', durationMin: 30, sortOrder: 7 },
  { section: 'dieta', kind: 'salvavidas', title: 'Comida extra: 100 g de carbohidratos + 2 huevos', sortOrder: 1 },
  { section: 'dieta', kind: 'salvavidas', title: 'Bebida dulce: Red Bull sin azúcar', sortOrder: 2 },
  { section: 'dieta', kind: 'salvavidas', title: 'Snack: uvas congeladas (máx. 10) con limón y tajín', sortOrder: 3 },
  { section: 'dieta', kind: 'salvavidas', title: 'Snack: zanahoria con limón y sal', sortOrder: 4 },
  { section: 'dieta', kind: 'salvavidas', title: 'Almuerzo con sopa del pack de la sopería', detail: 'Depende del hambre.', sortOrder: 5 },
];

/** Lista de mercado sugerida a partir de la dieta (sin precios: los pones tú). */
export const SEED_GROCERIES: GroceryInsert[] = [
  { name: 'Huevos', quantity: '30', frequency: 'semanal', sortOrder: 1 },
  { name: 'Pollo o carne', quantity: '~1 kg', frequency: 'semanal', sortOrder: 2 },
  { name: 'Pescado', quantity: '~1 kg', frequency: 'semanal', sortOrder: 3 },
  { name: 'Carbohidratos (arroz / papa / tortillas)', frequency: 'semanal', sortOrder: 4 },
  { name: 'Verduras para pico de gallo + pepino', frequency: 'semanal', sortOrder: 5 },
  { name: 'Yogurt griego', frequency: 'semanal', sortOrder: 6 },
  { name: 'Banano', frequency: 'semanal', sortOrder: 7 },
  { name: 'Frutas para helado (mango, sandía, fresa, remolacha)', frequency: 'semanal', sortOrder: 8 },
  { name: 'Uvas', frequency: 'semanal', sortOrder: 9 },
  { name: 'Zanahoria', frequency: 'semanal', sortOrder: 10 },
  { name: 'Proteína whey', frequency: 'mensual', sortOrder: 11 },
  { name: 'Pack de la sopería', frequency: 'semanal', sortOrder: 12 },
];

/** Precarga el plan y la lista UNA sola vez en la vida de la cuenta, en una sola
 *  transacción (repo.seedPlan): o queda todo o nada, nadie ve el plan a medias y dos cargas
 *  simultáneas no duplican. Si ya hay elementos, no los pisa. */
export async function seedHealthPlan(
  _ctx: ActorContext,
  repo: HealthRepo,
): Promise<Result<{ seeded: boolean }>> {
  const settings = await repo.getSettings();
  if (settings?.seededAt) return ok({ seeded: false }); // camino rápido (ya precargado)
  const seeded = await repo.seedPlan(SEED_PLAN, SEED_GROCERIES);
  return ok({ seeded });
}
