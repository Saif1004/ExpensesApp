const { app } = require("@azure/functions");
const OpenAI = require("openai");

//////////////////////////////////////////////////////////
// OpenAI client (CORRECT AZURE CONFIG)
//////////////////////////////////////////////////////////

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1`
});

//////////////////////////////////////////////////////////
// AI CATEGORY CLASSIFIER
//////////////////////////////////////////////////////////

async function classifyExpense(merchant, receiptText, items) {

  const prompt = `
Classify this expense into ONE category only.

Categories:
Meals
Travel
Technology
Office

Merchant: ${merchant}

Items:
${items.join(", ")}

Receipt text:
${receiptText}

Return ONLY the category name.
`;

  const response = await client.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT,
    messages: [
      { role: "system", content: "You classify business expenses." },
      { role: "user", content: prompt }
    ],
    temperature: 0,
    max_tokens: 10
  });

  return response.choices[0].message.content.trim();
}

//////////////////////////////////////////////////////////
// OCR FUNCTION
//////////////////////////////////////////////////////////

app.http("receiptOCR", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {

    try {

      //////////////////////////////////////////////////////////
      // REQUEST BODY
      //////////////////////////////////////////////////////////

      const { image } = await request.json();

      if (!image) {
        return {
          status: 400,
          jsonBody: { error: "No image provided" }
        };
      }

      //////////////////////////////////////////////////////////
      // OCR CREDENTIALS
      //////////////////////////////////////////////////////////

      const endpoint = process.env.AZURE_DOC_ENDPOINT;
      const key = process.env.AZURE_DOC_KEY;

      const analyzeUrl =
        `${endpoint.replace(/\/$/, "")}/formrecognizer/documentModels/prebuilt-receipt:analyze?api-version=2023-07-31`;

      //////////////////////////////////////////////////////////
      // SEND IMAGE TO OCR
      //////////////////////////////////////////////////////////

      const analyzeResponse = await fetch(analyzeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Ocp-Apim-Subscription-Key": key
        },
        body: JSON.stringify({
          base64Source: image
        })
      });

      if (!analyzeResponse.ok) {

        const errText = await analyzeResponse.text();
        context.log("Azure analyze error:", errText);

        return {
          status: 500,
          jsonBody: { error: "Azure analyze request failed" }
        };
      }

      const operationLocation =
        analyzeResponse.headers.get("operation-location");

      //////////////////////////////////////////////////////////
      // POLL OCR RESULT
      //////////////////////////////////////////////////////////

      let result;

      while (true) {

        const pollResponse = await fetch(operationLocation, {
          headers: {
            "Ocp-Apim-Subscription-Key": key
          }
        });

        result = await pollResponse.json();

        if (result.status === "succeeded") break;

        if (result.status === "failed") {

          context.log("OCR failed:", result);

          return {
            status: 500,
            jsonBody: { error: "OCR processing failed" }
          };
        }

        await new Promise(r => setTimeout(r, 1500));
      }

      //////////////////////////////////////////////////////////
      // EXTRACT FIELDS
      //////////////////////////////////////////////////////////

      const doc = result?.analyzeResult?.documents?.[0];

      let merchant =
        doc?.fields?.MerchantName?.valueString ?? "";

      let amount =
        doc?.fields?.Total?.valueCurrency?.amount ?? null;

      let date =
        doc?.fields?.TransactionDate?.valueDate ?? "";

      //////////////////////////////////////////////////////////
      // EXTRACT ITEMS
      //////////////////////////////////////////////////////////

      let items = [];

      if (doc?.fields?.Items?.valueArray) {

        items = doc.fields.Items.valueArray
          .map(i => i?.valueObject?.Description?.valueString)
          .filter(Boolean)
          .map(v => v.toLowerCase());

      }

      //////////////////////////////////////////////////////////
      // FALLBACK AMOUNT DETECTION
      //////////////////////////////////////////////////////////

      if (!amount) {

        const text = result?.analyzeResult?.content ?? "";

        const prices =
          text.match(/[0-9]+\.[0-9]{2}/g)
          ?.map(Number)
          ?.filter(v => !isNaN(v)) || [];

        if (prices.length > 0) {
          amount = Math.max(...prices);
        }

      }

      //////////////////////////////////////////////////////////
      // AI CATEGORY CLASSIFICATION
      //////////////////////////////////////////////////////////

      let category = "Meals";

      try {

        const receiptText =
          result?.analyzeResult?.content || "";

        const aiCategory = await classifyExpense(
          merchant,
          receiptText,
          items
        );

        context.log("AI CATEGORY RAW:", aiCategory);

        const clean = aiCategory
          .toLowerCase()
          .replace(".", "")
          .trim();

        if (clean.includes("travel")) category = "Travel";
        else if (clean.includes("technology")) category = "Technology";
        else if (clean.includes("office")) category = "Office";
        else if (clean.includes("meal") || clean.includes("food"))
          category = "Meals";

      } catch (err) {

        context.log("AI classification failed:", err);

      }

      //////////////////////////////////////////////////////////
      // LOG RESULT
      //////////////////////////////////////////////////////////

      context.log("OCR RESULT:", {
        merchant,
        amount,
        date,
        items,
        category
      });

      //////////////////////////////////////////////////////////
      // RETURN RESPONSE
      //////////////////////////////////////////////////////////

      return {
        status: 200,
        jsonBody: {
          merchant,
          amount,
          date,
          category
        }
      };

    } catch (error) {

      context.log("OCR ERROR:", error);

      return {
        status: 500,
        jsonBody: {
          error: "Internal OCR error"
        }
      };

    }

  }
});