export const NATURE_BACKGROUNDS: string[] = Array.from({ length: 20 }, (_, i) => `/nature/bg-${String(i + 1).padStart(2, '0')}.jpg`);

let currentBg: string | null = null;

export function getNatureBackground(): string {
  if (!currentBg) {
    currentBg = NATURE_BACKGROUNDS[Math.floor(Math.random() * NATURE_BACKGROUNDS.length)];
  }
  return currentBg;
}