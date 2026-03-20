const { app } = require("@azure/functions");
const OpenAI = require("openai");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1`
});

const MAX_CREDITS = 100;
const COOLDOWN = 2000;
const MAX_REQUESTS_PER_MINUTE = 20;

app.http("chatbot", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {

    try {

      const authHeader = request.headers.get("authorization");

      if (!authHeader) {
        return { status:401, jsonBody:{success:false,error:"Unauthorized"} };
      }

      const token = authHeader.split("Bearer ")[1];
      const decoded = await admin.auth().verifyIdToken(token);
      const userId = decoded.uid;

      const { message, history=[] } = await request.json();

      const userRef = db.collection("users").doc(userId);

      if(message==="__getCredits__"){
        const snap = await userRef.get();
        return {
          status:200,
          jsonBody:{
            success:true,
            remaining:snap.data()?.aiCredits ?? MAX_CREDITS
          }
        };
      }

      ////////////////////////////////////////////////////
      // CLAIM DATA (FULL)
      ////////////////////////////////////////////////////

      const snapshot = await db
        .collection("claims")
        .where("userId","==",userId)
        .get();

      const claims = snapshot.docs.map(d=>d.data());

      let claimsContext = "User has no claims.";

      if(claims.length){

        const total = claims.reduce((s,c)=>s+(Number(c.amount)||0),0);

        const approved = claims.filter(c=>c.status==="approved").length;
        const pending = claims.filter(c=>c.status==="pending").length;
        const rejected = claims.filter(c=>c.status==="rejected").length;

        const recent = claims.slice(0,5)
          .map(c=>`${c.category} £${c.amount} (${c.status})`)
          .join("\n");

        claimsContext = `
USER CLAIM DATA:

Total Spend: £${total}
Approved: ${approved}
Pending: ${pending}
Rejected: ${rejected}

Recent Claims:
${recent}
`;
      }

      ////////////////////////////////////////////////////
      // AI CALL
      ////////////////////////////////////////////////////

      const aiRes = await client.chat.completions.create({
        model:process.env.AZURE_OPENAI_DEPLOYMENT,
        messages:[
          {
            role:"system",
            content:`
You are a smart expense assistant.

IMPORTANT:
- You DO have access to the user's financial data below
- NEVER say you don't have access
- ALWAYS use the data when answering

Policy:
Meals £50
Tech £500
`
          },
          { role:"system", content:claimsContext },
          ...history.map(m=>({
            role:m.sender==="user"?"user":"assistant",
            content:m.text
          })),
          { role:"user", content:message }
        ],
        temperature:0.3,
        max_tokens:200
      });

      const reply = aiRes.choices[0].message.content;

      await userRef.update({
        aiCredits: admin.firestore.FieldValue.increment(-1)
      });

      const snap = await userRef.get();

      return {
        status:200,
        jsonBody:{
          success:true,
          reply,
          remaining:snap.data().aiCredits
        }
      };

    } catch (err) {
      return {
        status:200,
        jsonBody:{
          success:false,
          error:err.message
        }
      };
    }

  }
});