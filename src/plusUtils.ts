/**
 * Plus utilities - License system removed, all features now free.
 * These functions are kept for API compatibility but always return true/enabled.
 */

/** Check if the model key is a Copilot Plus model - always returns false since Plus is deprecated. */
export function isPlusModel(_modelKey: string): boolean {
  return false;
}

/** Hook to get the isPlusUser setting - always returns true since all features are now free. */
export function useIsPlusUser(): boolean {
  return true;
}

/** Check if the user is a Plus user - always returns true since all features are now free. */
export async function checkIsPlusUser(_context?: Record<string, any>): Promise<boolean> {
  return true;
}

/** Check if the user is on the believer plan - always returns true since all features are now free. */
export async function isBelieverPlan(): Promise<boolean> {
  return true;
}

/** No-op: Plus settings no longer needed. */
export function applyPlusSettings(): void {
  // No-op: All features are now available to everyone
}

/** No-op: Plus page navigation removed. */
export function createPlusPageUrl(_medium: string): string {
  return "";
}

/** No-op: Plus page navigation removed. */
export function navigateToPlusPage(_medium: string): void {
  // No-op: Plus subscription removed
}

/** No-op: Always considered "Plus" user. */
export function turnOnPlus(): void {
  // No-op: All features are now available to everyone
}

/** No-op: Cannot turn off Plus since all features are free. */
export function turnOffPlus(): void {
  // No-op: All features are now available to everyone
}
