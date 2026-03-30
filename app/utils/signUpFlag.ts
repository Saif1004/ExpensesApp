/**
 * signUpFlag.ts
 *
 * Module-level flag that tells AuthProvider not to sign out an unverified
 * user during the sign-up flow.
 *
 * Problem: createUserWithEmailAndPassword creates an unverified user.
 * AuthProvider's onAuthStateChanged fires immediately and signs out
 * unverified users — before the sign-up batch writes can complete.
 *
 * Solution: sign-up sets this flag to true before creating the user,
 * and false when done. AuthProvider checks the flag before signing out.
 */

let _isSigningUp = false;

export const setIsSigningUp = (v: boolean) => { _isSigningUp = v; };
export const getIsSigningUp = () => _isSigningUp;

export default {
  setIsSigningUp,
  getIsSigningUp,
};

