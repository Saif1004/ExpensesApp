const { app } = require("@azure/functions");
const OpenAI = require("openai");
const admin = require("firebase-admin");
const { authAndLimit } = require("./rateLimit");
const { secureResponse, validateString, sanitize } = require("./security");
const { checkAiKillSwitch } = require("./aiConfig");
const PLAN_LIMITS = require("./planLimits");
const { checkAndDeductCredit } = require("./aiCredits");

////////////////////////////////////////////////////
// FIREBASE INITIALIZATION
////////////////////////////////////////////////////

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    })
  });
}

const db = admin.firestore();

////////////////////////////////////////////////////
// OPENAI CLIENT (AZURE)
////////////////////////////////////////////////////

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1`
});

////////////////////////////////////////////////////
// CONFIG (SIMPLE + SAFE)
////////////////////////////////////////////////////

const MAX_AI = 100;       // max AI uses per org
const COOLDOWN = 3000;   // 3 seconds

////////////////////////////////////////////////////
// PARSE POLICY FUNCTION
////////////////////////////////////////////////////

app.http("parsePolicy", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {

    try {

////////////////////////////////////////////////////
// AUTH + RATE LIMIT (5 per 15 minutes)
////////////////////////////////////////////////////

      const auth = await authAndLimit(request, "rateLimitParsePolicy", 5, 15 * 60 * 1000);
      if (auth.error) return auth.error;

////////////////////////////////////////////////////
// AI KILL SWITCH
////////////////////////////////////////////////////

      const blocked = await checkAiKillSwitch("parsePolicy");
      if (blocked) return blocked;

////////////////////////////////////////////////////
// READ REQUEST
////////////////////////////////////////////////////

      const body   = await request.json();
      const userId = auth.uid; // use verified uid, not body

      // Validate text input
      const textResult = validateString(body.text, "text", { maxLen: 2000 });
      if (textResult.fieldError) {
        return secureResponse({ success: false, error: textResult.fieldError }, 400);
      }
      const text = sanitize(textResult.value);

////////////////////////////////////////////////////
// DERIVE orgId FROM MEMBERSHIP — never trust client
////////////////////////////////////////////////////

      const membershipSnap = await db.collection("memberships")
        .where("userId", "==", userId)
        .where("status", "==", "approved")
        .where("role", "==", "admin")
        .limit(1)
        .get();

      if (membershipSnap.empty) {
        return secureResponse({ success: false, error: "Forbidden: admin access required" }, 403);
      }

      const orgId = membershipSnap.docs[0].data().orgId;

////////////////////////////////////////////////////
// USER COOLDOWN (ANTI-SPAM)
////////////////////////////////////////////////////

      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();

      const lastCall =
        userDoc.data()?.lastAiCall?.toMillis?.() || 0;

      if (Date.now() - lastCall < COOLDOWN) {
        return secureResponse({ success: false, error: "⏳ Please wait a moment before trying again." }, 429);
      }

////////////////////////////////////////////////////
// ORG CREDIT CHECK + DEDUCT
////////////////////////////////////////////////////

      const orgRef = db.collection("organisations").doc(orgId);
      const orgDoc = await orgRef.get();

      if (!orgDoc.exists) {
        return secureResponse({ success: false, error: "Organisation not found" }, 404);
      }

      const orgData = orgDoc.data() || {};

      // Resolve effective plan (expired trial → free)
      let orgPlan = orgData.plan ?? "free";
      if (orgPlan === "trial") {
        const trialEndsAt = orgData.trialEndsAt?.toDate?.() ?? null;
        if (trialEndsAt && trialEndsAt < new Date()) orgPlan = "free";
      }

      const planConfig = PLAN_LIMITS[orgPlan] || PLAN_LIMITS.free;
      const { creditError } = await checkAndDeductCredit(orgRef, orgData, planConfig, orgPlan);
      if (creditError) return creditError;

////////////////////////////////////////////////////
// AI PROMPT
////////////////////////////////////////////////////

      const prompt = `
Convert the following company expense policy into structured JSON.

Policy:
"${text}"

Return JSON ONLY.

Choose the type that best fits:

- "receipt_required"  — policy sets an amount threshold above which a receipt must be attached
- "category_limit"    — policy caps the amount for a specific spending category
- "submission_window" — policy requires claims to be submitted within N days of purchase
- "general_rule"      — any other rule that cannot be expressed as a number (e.g. banned items, vendor restrictions, class-of-travel rules, behaviour requirements)

Format:

{
"type": "receipt_required | category_limit | submission_window | general_rule",
"category": "Meals | Travel | Office | Technology | null",
"value": number or null,
"displayText": "Professional policy sentence"
}

Examples:

Input:
Receipt required above 60

Output:
{"type":"receipt_required","category":null,"value":60,"displayText":"Receipts must be provided for expenses exceeding £60."}

Input:
Meals limit 80

Output:
{"type":"category_limit","category":"Meals","value":80,"displayText":"Meal expenses are limited to £80 per claim."}

Input:
Claims must be submitted within 14 days

Output:
{"type":"submission_window","category":null,"value":14,"displayText":"Claims must be submitted within 14 days of purchase."}

Input:
No alcohol purchases allowed

Output:
{"type":"general_rule","category":null,"value":null,"displayText":"Alcohol purchases are not permitted as business expenses."}

Input:
Only economy class flights

Output:
{"type":"general_rule","category":"Travel","value":null,"displayText":"All flights must be booked in economy class."}

Input:
No expenses at entertainment venues

Output:
{"type":"general_rule","category":null,"value":null,"displayText":"Expenses at entertainment venues are not permitted."}

Return JSON only.
`;

////////////////////////////////////////////////////
// OPENAI REQUEST
////////////////////////////////////////////////////

      const completion = await client.chat.completions.create({

        model: process.env.AZURE_OPENAI_DEPLOYMENT,

        messages: [
          {
            role: "system",
            content: "You convert expense policies into structured JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],

        temperature: 0,
        max_tokens: 200

      });

      const content =
        completion?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("AI returned empty response");
      }

////////////////////////////////////////////////////
// PARSE JSON SAFELY
// Strip markdown code fences that OpenAI sometimes wraps around JSON
// e.g.  ```json\n{...}\n```  →  {...}
////////////////////////////////////////////////////

      let parsed;

      try {

        const cleaned = content
          .replace(/^```(?:json)?\s*/i, "")  // strip leading ```json or ```
          .replace(/\s*```\s*$/,        "")  // strip trailing ```
          .trim();

        parsed = JSON.parse(cleaned);

      } catch (err) {

        context.log("AI returned invalid JSON:", content);

        return secureResponse({ success: false, error: "AI response error. Please try again." }, 500);

      }

////////////////////////////////////////////////////
// VALIDATE STRUCTURE
////////////////////////////////////////////////////

      if (!parsed.type) {
        return secureResponse({ success: false, error: "Invalid policy structure" }, 400);
      }

////////////////////////////////////////////////////
// GENERATE FALLBACK DISPLAY TEXT
////////////////////////////////////////////////////

      let displayText = parsed.displayText;

      if (!displayText) {

        if (parsed.type === "receipt_required") {
          displayText = `Receipts must be provided for expenses exceeding £${parsed.value}.`;
        }

        else if (parsed.type === "category_limit") {
          displayText = `${parsed.category} expenses are limited to £${parsed.value} per claim.`;
        }

        else if (parsed.type === "submission_window") {
          displayText = `Claims must be submitted within ${parsed.value} days of purchase.`;
        }

        else {
          displayText = text;
        }

      }

////////////////////////////////////////////////////
// UPDATE COOLDOWN (credit already deducted above)
////////////////////////////////////////////////////

      await userRef.set({
        lastAiCall: new Date()
      }, { merge: true });

////////////////////////////////////////////////////
// SAVE POLICY
////////////////////////////////////////////////////

      const policyRef = await db.collection("policies").add({

        orgId,

        type: parsed.type,
        category: parsed.category ?? null,
        value: parsed.value ?? null,

        displayText,
        originalText: text,

        createdAt: admin.firestore.FieldValue.serverTimestamp()

      });

////////////////////////////////////////////////////
// RESPONSE
////////////////////////////////////////////////////

      return secureResponse({
        success: true,
        policyId: policyRef.id,
        policy: parsed
      }, 200);

////////////////////////////////////////////////////
// ERROR HANDLER
////////////////////////////////////////////////////

    } catch (error) {

      context.log("PARSE POLICY ERROR:", error);
      return secureResponse({ success: false, error: "Something went wrong. Please try again." }, 500);

    }

  }

});