/**
 * "Sign in to continue" — asked at the moment it is actually needed.
 *
 * On the web nobody signs up for an app they have not seen. So a visitor makes
 * a kundli, reads their chart and their panchang as a guest, and the account is
 * asked for only when they reach for something that needs one: sending a chat,
 * writing the life report, matching two kundlis, a decision. The thing they
 * were doing is remembered and finished for them after they sign in, because a
 * sign-in that loses the question is a sign-in they do twice.
 *
 * The Android app keeps its launch sign-in: it is installed, not browsed.
 */
import { useCallback } from "react";
import { useAuth } from "@/auth";

/** What they were reaching for — picks the line the sheet leads with. */
export type GateReason = "chat" | "report" | "match" | "decide" | "save" | "plan";

export interface SignInRequest {
  reason: GateReason;
  /** Run after a successful sign-in — the action they were denied. */
  retry?: () => void;
}

export const SIGNIN_EVENT = "jj-signin";

/** Open the sign-in sheet (see components/SignInSheet). */
export function askSignIn(req: SignInRequest) {
  window.dispatchEvent(new CustomEvent<SignInRequest>(SIGNIN_EVENT, { detail: req }));
}

/**
 * The gate itself.
 *
 *   const needsSignIn = useSignInGate();
 *   const send = () => { if (needsSignIn("chat", send)) return; … }
 *
 * Returns true when it has taken over (the sheet is open and the caller should
 * stop), false when the person is signed in and the caller should carry on.
 */
export function useSignInGate() {
  const { user } = useAuth();
  return useCallback(
    (reason: GateReason, retry?: () => void) => {
      if (user) return false;
      askSignIn({ reason, retry });
      return true;
    },
    [user],
  );
}
