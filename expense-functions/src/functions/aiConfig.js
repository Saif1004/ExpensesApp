/**
 * aiConfig.js
 *
 * Reads the AI kill-switch document from Firestore:
 *   /config/ai
 *
 * Fields (all boolean, default true if missing):
 *   enabled      — master switch: disables ALL AI when false
 *   chatbot      — chatbot endpoint
 *   ocr          — receipt OCR + classification
 *   analytics    — analytics insights
 *   parsePolicy  — policy parser
 *
 * Results are cached in memory for CACHE_TTL_MS (30 seconds) so
 * every request does NOT trigger a Firestore read.  When you flip
 * the switch in the Firebase Console the change propagates within
 * 30 seconds across all running function instances.
 *
 * HOW TO USE THE KILL SWITCH:
 *   Firebase Console → Firestore → config → ai
 *   Set  enabled: false  to cut ALL AI immediately.
 *   Set  chatbot: false  to cut only the chatbot, etc.
 */

const admin = require("firebase-admin");

////////////////////////////////////////////////////
// IN-MEMORY CACHE (per function instance)
////////////////////////////////////////////////////

const CACHE_TTL_MS = 30 * 1000; // 30 seconds

let _cache     = null;
let _cacheTime = 0;

////////////////////////////////////////////////////
// DEFAULTS (used if document is missing)
////////////////////////////////////////////////////

const DEFAULTS = {
  enabled:     true,
  chatbot:     true,
  ocr:         true,
  analytics:   true,
  parsePolicy: true,
};

////////////////////////////////////////////////////
// FETCH CONFIG (with cache)
////////////////////////////////////////////////////

async function getAiConfig() {
  const now = Date.now();

  // Return cached value if still fresh
  if (_cache && now - _cacheTime < CACHE_TTL_MS) {
    return _cache;
  }

  try {
    const snap = await admin.firestore()
      .collection("config")
      .doc("ai")
      .get();

    _cache     = snap.exists ? { ...DEFAULTS, ...snap.data() } : { ...DEFAULTS };
    _cacheTime = now;
  } catch {
    // If Firestore is unreachable, fail open (don't block AI)
    _cache     = { ...DEFAULTS };
    _cacheTime = now;
  }

  return _cache;
}

////////////////////////////////////////////////////
// CONVENIENCE CHECKERS
////////////////////////////////////////////////////

/**
 * Returns a 503 Response if the given feature is disabled,
 * or null if it is allowed.
 *
 * Usage:
 *   const block = await checkAiKillSwitch("chatbot");
 *   if (block) return block;
 */
async function checkAiKillSwitch(feature) {
  const config = await getAiConfig();

  if (!config.enabled) {
    return new Response(
      JSON.stringify({ success: false, error: "AI features are temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  if (feature && config[feature] === false) {
    return new Response(
      JSON.stringify({ success: false, error: `The ${feature} feature is temporarily unavailable.` }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  return null; // allowed — proceed
}

module.exports = { getAiConfig, checkAiKillSwitch };
