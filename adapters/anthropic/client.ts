import Anthropic from '@anthropic-ai/sdk';

export function anthropicClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
}

// Por defecto Sonnet 5 (lo que presupuesta docs/arquitectura-v2 §9). Configurable.
export const AGENT_MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-5';

// Precios por millón de tokens (Sonnet 5 estándar). Para el circuit breaker de costo.
export const PRICE = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };
