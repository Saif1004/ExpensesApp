const { app } = require("@azure/functions");
const admin = require("firebase-admin");

//////////////////////////////////////////////////////
// FIREBASE INIT
//////////////////////////////////////////////////////

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

//////////////////////////////////////////////////////
// VALIDATE CLAIM
//////////////////////////////////////////////////////

app.http("validateClaim", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {

    try {

      const {
        amount,
        category,
        purchaseDate,
        receiptUrl,
        userId,
        merchant,
        userEmail
      } = await request.json();

//////////////////////////////////////////////////////
// BASIC VALIDATION
//////////////////////////////////////////////////////

      if (!amount || !category || !purchaseDate || !userId || !merchant?.trim()) {
        return {
          status: 400,
          jsonBody: { valid:false, reason:"Missing required fields." }
        };
      }

      const numericAmount = Number(amount);

      if (isNaN(numericAmount) || numericAmount <= 0) {
        return {
          status: 400,
          jsonBody: { valid:false, reason:"Invalid amount." }
        };
      }

//////////////////////////////////////////////////////
// FIND USER ORG
//////////////////////////////////////////////////////

      const membershipSnap = await db
        .collection("memberships")
        .where("userId","==",userId)
        .limit(1)
        .get();

      if(membershipSnap.empty){
        return {
          status:400,
          jsonBody:{valid:false,reason:"User not assigned to organisation."}
        };
      }

      const orgId = membershipSnap.docs[0].data().orgId;

//////////////////////////////////////////////////////
// LOAD POLICIES
//////////////////////////////////////////////////////

      const policiesSnap = await db
        .collection("policies")
        .where("orgId","==",orgId)
        .get();

//////////////////////////////////////////////////////
// DEFAULT RULES
//////////////////////////////////////////////////////

      let receiptThreshold = 25;

      const categoryLimits = {
        Meals:50,
        Travel:300,
        Office:500,
        Technology:3000
      };

//////////////////////////////////////////////////////
// APPLY POLICIES
//////////////////////////////////////////////////////

      policiesSnap.forEach(doc=>{

        const policy = doc.data();

        if(policy.type === "receipt_required"){
          receiptThreshold = policy.value ?? receiptThreshold;
        }

        if(policy.type === "category_limit" && policy.category){
          categoryLimits[policy.category] = policy.value;
        }

      });

//////////////////////////////////////////////////////
// RECEIPT POLICY
//////////////////////////////////////////////////////

      const hasReceipt = !!receiptUrl;

      if(numericAmount > receiptThreshold && !hasReceipt){
        return {
          status:400,
          jsonBody:{
            valid:false,
            reason:`Receipt required above £${receiptThreshold}`
          }
        };
      }

//////////////////////////////////////////////////////
// CATEGORY LIMIT
//////////////////////////////////////////////////////

      if(numericAmount > categoryLimits[category]){
        return {
          status:400,
          jsonBody:{
            valid:false,
            reason:`${category} limit exceeded`
          }
        };
      }

//////////////////////////////////////////////////////
// DATE POLICY
//////////////////////////////////////////////////////

      const today = new Date();
      const expenseDate = new Date(purchaseDate);

      const diffDays =
        (today.getTime()-expenseDate.getTime())/(1000*60*60*24);

      if(diffDays > 30){
        return {
          status:400,
          jsonBody:{
            valid:false,
            reason:"Submission window expired."
          }
        };
      }

//////////////////////////////////////////////////////
// SAVE CLAIM
//////////////////////////////////////////////////////

      const claimRef = await db.collection("claims").add({

        userId,
        userEmail,
        orgId,

        merchant:merchant.trim(),
        amount:numericAmount,
        category,
        purchaseDate,

        receiptUrl,
        hasReceipt,

        status:"pending",

        createdAt:admin.firestore.FieldValue.serverTimestamp()

      });

//////////////////////////////////////////////////////
// RESPONSE
//////////////////////////////////////////////////////

      return{
        status:200,
        jsonBody:{
          valid:true,
          claimId:claimRef.id,
          status:"pending"
        }
      };

    }

//////////////////////////////////////////////////////
// ERROR HANDLER
//////////////////////////////////////////////////////

    catch(error){

      context.log("VALIDATE CLAIM ERROR:",error);

      return{
        status:500,
        jsonBody:{
          valid:false,
          reason:"Internal server error."
        }
      };

    }

  }

});