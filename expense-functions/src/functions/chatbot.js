const { app } = require("@azure/functions");
const OpenAI = require("openai");
const admin = require("firebase-admin");

////////////////////////////////////////////////////
// Firebase initialization
////////////////////////////////////////////////////

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

////////////////////////////////////////////////////
// OpenAI client
////////////////////////////////////////////////////

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1`
});

////////////////////////////////////////////////////
// Chatbot function
////////////////////////////////////////////////////

app.http("chatbot", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {

    try {

      const { message, userId } = await request.json();

      if (!message) {
        return {
          status: 400,
          jsonBody: { error: "Message required" }
        };
      }

      ////////////////////////////////////////////////////
      // Fetch user's claims from Firestore
      ////////////////////////////////////////////////////

      let claimsContext = "No claim data available.";

      if (userId) {

        const snapshot = await db
          .collection("claims")
          .where("userId", "==", userId)
          .limit(20)
          .get();

        const claims = snapshot.docs.map(doc => doc.data());

        const pending =
          claims.filter(c => c.status === "pending").length;

        const approved =
          claims.filter(c => c.status === "approved").length;

        const rejected =
          claims.filter(c => c.status === "rejected").length;

        const totalSpend =
          claims.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

        const categories = {};

        claims.forEach(c => {
          if (!categories[c.category]) {
            categories[c.category] = 0;
          }
          categories[c.category]++;
        });

        claimsContext = `
User claim summary

Pending claims: ${pending}
Approved claims: ${approved}
Rejected claims: ${rejected}

Total recent spending: £${totalSpend}

Category breakdown:
${Object.entries(categories)
  .map(([k,v]) => `${k}: ${v}`)
  .join("\n")}

Recent claims:
${claims.slice(0,5).map(c =>
`${c.merchant} £${c.amount} (${c.category}) - ${c.status}`
).join("\n")}
`;
      }

      ////////////////////////////////////////////////////
      // OpenAI request
      ////////////////////////////////////////////////////

      const response =
        await client.chat.completions.create({

        model: process.env.AZURE_OPENAI_DEPLOYMENT,

        messages: [

          {
            role: "system",
            content: `
You are a helpful assistant for an expense management mobile app.

You help users with:
• submitting expense claims
• receipt scanning
• claim approvals
• company expense policies
• understanding their spending

Company expense policy:

Meals limit: £50
Technology limit: £500
Travel allowed
Office supplies allowed
Claims older than 30 days rejected
Duplicate claims rejected

Be concise, helpful and friendly.
Never invent policy rules.
`
          },

          {
            role: "system",
            content: claimsContext
          },

          {
            role: "user",
            content: message
          }

        ],

        temperature: 0.3,
        max_tokens: 200

      });

      const reply =
        response?.choices?.[0]?.message?.content ||
        "Sorry, I couldn't answer that.";

      return {
        status: 200,
        jsonBody: { reply }
      };

    } catch (error) {

      context.log("CHATBOT ERROR:", error);

      return {
        status: 500,
        jsonBody: {
          error: "Chatbot failed"
        }
      };
    }
  }
});