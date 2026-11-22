const GUIDE_SEEN = 'banana-guide-seen';

export function hasSeenGuide(): boolean {
  try {
    return localStorage.getItem(GUIDE_SEEN) === '1';
  } catch {
    return false;
  }
}

export function markGuideSeen(): void {
  try {
    localStorage.setItem(GUIDE_SEEN, '1');
  } catch {
    /* ignore */
  }
}
