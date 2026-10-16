export const EXPRESSIONS = {
  auto: 'Otomatis', neutral: 'Netral', smile: 'Senyum', pleased: 'Senang',
  happy: 'Bahagia', laugh: 'Tertawa', sad: 'Sedih', angry: 'Marah',
  surprised: 'Terkejut', thinking: 'Berpikir', serious: 'Serius',
} as const;
export type ExpressionId = keyof typeof EXPRESSIONS;
export interface ExpressionSettings {
  expression: ExpressionId;
  intensity: number;
  speaking?: boolean;
}
