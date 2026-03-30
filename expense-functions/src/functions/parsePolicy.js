const { app } = require("@azure/functions");
const OpenAI = require("openai");
const admin = require("firebase-admin");
const { authAndLimit } = require("./rateLimit");
const { secureResponse, validateString, sanitize } = require("./security");
const { checkAiKillSwitch } = require("./aiConfig");

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
// READ REQUEST
////////////////////////////////////////////////////

      const body = await request.json();
      const orgId = sanitize(body.orgId ?? "");
      const userId = auth.uid; // use verified uid, not body

      // Validate text input
      const textResult = validateString(body.text, "text", { maxLen: 2000 });
      if (textResult.fieldError) {
        return secureResponse({ success: false, error: textResult.fieldError }, 400);
      }
      const text = sanitize(textResult.value);

      if (!orgId) {
        return secureResponse({ success: false, error: "Missing required fields" }, 400);
      }

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
// ORG USAGE LIMIT
////////////////////////////////////////////////////

      const orgRef = db.collection("organisations").doc(orgId);
      const orgDoc = await orgRef.get();

      if (!orgDoc.exists) {
        return secureResponse({ success: false, error: "Organisation not found" }, 404);
      }

      const aiUsage = orgDoc.data()?.aiUsage || 0;

      if (aiUsage >= MAX_AI) {
        return secureResponse({ success: false, error: "🚫 AI limit reached. Upgrade to continue using AI features." }, 403);
      }

////////////////////////////////////////////////////
// AI PROMPT
////////////////////////////////////////////////////

      const prompt = `
Convert the following company expense policy into structured JSON.

Policy:
"${text}"

Return JSON ONLY.

Format:

{
"type": "receipt_required | category_limit | approval_required | submission_window",
"category": "Meals | Travel | Office | Technology | null",
"value": number,
"displayText": "Professional policy sentence"
}

Examples:

Input:
Receipt required above 60

Output:
{
"type":"receipt_required",
"category":null,
"value":60,
"displayText":"Receipts must be provided for expenses exceeding £60."
}

Input:
Meals limit 80

Output:
{
"type":"category_limit",
"category":"Meals",
"value":80,
"displayText":"Meal expenses are limited to £80 per claim."
}

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
////////////////////////////////////////////////////

      let parsed;

      try {

        parsed = JSON.parse(content);

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
// UPDATE USAGE + COOLDOWN
////////////////////////////////////////////////////

      await Promise.all([

        orgRef.update({
          aiUsage: aiUsage + 1
        }),

        userRef.set({
          lastAiCall: new Date()
        }, { merge: true })

      ]);

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
        policy: parsed,
        remaining: MAX_AI - (aiUsage + 1)
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