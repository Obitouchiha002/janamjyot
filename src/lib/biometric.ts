/**
 * Biometric app lock.
 *
 * Birth details, charts and private questions are sensitive, so the app can be
 * put behind the phone's own fingerprint / face unlock. We never store or see
 * any biometric data — the OS does the check and simply tells us pass or fail.
 *
 * Enabled per-device (localStorage), and only offered where the hardware
 * actually supports it. Device PIN/pattern is allowed as a fallback so a user
 * whose fingerprint fails is never locked out of their own app.
 */
import { isNative } from './native';

const KEY = 'jj:lock';

export function isLockEnabled(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setLockEnabled(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

/** True when this device can actually do a biometric / device-credential check. */
export async function biometricAvailable(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
    const info = await BiometricAuth.checkBiometry();
    // `strongReason`-less devices still pass when a PIN/pattern exists, which
    // we allow as a fallback below.
    return !!(info?.isAvailable || info?.deviceIsSecure);
  } catch {
    return false;
  }
}

/**
 * Ask the OS to verify the user. Resolves true on success, false if they
 * cancelled or failed. Never throws — callers just branch on the boolean.
 */
export async function authenticate(reason = 'Unlock JanamJyot'): Promise<boolean> {
  if (!isNative) return true; // nothing to lock against on the web
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Cancel',
      androidTitle: 'Unlock JanamJyot',
      androidSubtitle: 'Use your fingerprint or screen lock',
      // Let the device PIN/pattern stand in, so a failing fingerprint never
      // permanently locks someone out of their own kundlis.
      allowDeviceCredential: true,
    });
    return true;
  } catch {
    return false;
  }
}
