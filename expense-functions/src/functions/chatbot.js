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
      // Fetch user's claims
      ////////////////////////////////////////////////////

      let claimsContext = "No user claim data available.";

      if (userId) {

        const snapshot = await db
          .collection("claims")
          .where("userId","==",userId)
          .orderBy("createdAt","desc")
          .limit(10)
          .get();

        const claims = snapshot.docs.map(d => d.data());

        const pending =
          claims.filter(c => c.status==="pending").length;

        const approved =
          claims.filter(c => c.status==="approved").length;

        const rejected =
          claims.filter(c => c.status==="rejected").length;

        const totalSpend =
          claims.reduce((sum,c)=>sum+(c.amount||0),0);

        claimsContext = `
User claim summary:

Pending claims: ${pending}
Approved claims: ${approved}
Rejected claims: ${rejected}

Total recent spending: £${totalSpend}

Recent claims:
${claims.map(c =>
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

        messages:[
          {
            role:"system",
            content:`
You are an AI assistant for an expense management app.

You help users with:
- submitting claims
- explaining claim results
- expense categories
- receipt scanning
- company policy

Company policy:

Meals limit £50
Technology limit £500
Travel allowed
Office supplies allowed
Claims older than 30 days rejected
Duplicate claims rejected

You will also receive a summary of the user's claims.
Use it to answer questions about their spending.
Be concise and helpful.
`
          },

          {
            role:"system",
            content:claimsContext
          },

          {
            role:"user",
            content:message
          }
        ],

        temperature:0.3,
        max_tokens:200
      });

      const reply =
        response.choices?.[0]?.message?.content
        || "Sorry, I couldn't answer that.";

      return {
        status:200,
        jsonBody:{ reply }
      };

    } catch (error) {

      context.log("CHATBOT ERROR:",error);

      return {
        status:500,
        jsonBody:{ error:"Chatbot failed" }
      };
    }
  }
});