// New feature: builds the share card text for a finished interview. No tests exist for this file.
export function shareText(score: number, role: string) {
  return `I scored ${score > 70 ? "well" : "okay"} in my ${role} mock interview on Rehearsal`;
}
