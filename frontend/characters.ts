export const CHARACTERS = {
  harry: { name: 'Harry Potter', url: '/models/harry.glb' },
  ardi: { name: 'Ardi', url: '/models/character.glb' },
} as const;
export type CharacterId = keyof typeof CHARACTERS;
