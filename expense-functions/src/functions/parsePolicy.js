const { app } = require("@azure/functions");
const OpenAI = require("openai");
const admin = require("firebase-admin");

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
// PARSE POLICY FUNCTION
////////////////////////////////////////////////////

app.http("parsePolicy", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {

    try {

////////////////////////////////////////////////////
// READ REQUEST
////////////////////////////////////////////////////

      const { text, orgId } = await request.json();

      if (!text || !orgId) {
        return {
          status: 400,
          jsonBody: {
            success: false,
            error: "Missing policy text or orgId"
          }
        };
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

        return {
          status: 500,
          jsonBody: {
            success: false,
            error: "AI returned invalid JSON"
          }
        };

      }

////////////////////////////////////////////////////
// VALIDATE STRUCTURE
////////////////////////////////////////////////////

      if (!parsed.type) {
        return {
          status: 400,
          jsonBody: {
            success: false,
            error: "Invalid policy structure"
          }
        };
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

      return {
        status: 200,
        jsonBody: {
          success: true,
          policyId: policyRef.id,
          policy: parsed
        }
      };

////////////////////////////////////////////////////
// ERROR HANDLER
////////////////////////////////////////////////////

    } catch (error) {

      context.log("PARSE POLICY ERROR:", error);

      return {
        status: 500,
        jsonBody: {
          success: false,
          error: error.message
        }
      };

    }

  }

});