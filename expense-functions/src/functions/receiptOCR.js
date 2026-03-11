const { app } = require("@azure/functions");
const OpenAI = require("openai");

//////////////////////////////////////////////////////////
// SAFE OPENAI CLIENT
//////////////////////////////////////////////////////////

function getOpenAIClient() {

  const key = process.env.AZURE_OPENAI_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;

  if (!key || !endpoint) {
    throw new Error("Azure OpenAI credentials not configured");
  }

  return new OpenAI({
    apiKey: key,
    baseURL: `${endpoint}/openai/v1`
  });
}

//////////////////////////////////////////////////////////
// AI CATEGORY CLASSIFIER
//////////////////////////////////////////////////////////

async function classifyExpense(merchant, receiptText, items) {

  const client = getOpenAIClient();

  const prompt = `
You are an expense classification system for a company expense platform.

Your task is to classify an expense into ONE of the following categories:

Meals
Travel
Technology
Office

Classification rules:

Meals
- Restaurants
- Cafes
- Coffee shops
- Food purchases
- Takeaways
- Grocery food items

Travel
- Taxi / Uber / Bolt
- Train / Bus / Metro
- Flights
- Hotels
- Fuel / Petrol
- Parking / tolls
- Public transport tickets

Technology
- Electronics
- Computer equipment
- Software
- Online technology retailers
- Chargers, cables, accessories
- Phones, laptops, tablets

Office
- Stationery
- Paper
- Printer supplies
- Office equipment
- Work materials

If unsure, use the merchant name and items to infer the category.

Expense information:

Merchant:
${merchant}

Items:
${items.join(", ")}

Full receipt text:
${receiptText}

Return ONLY ONE word from this list:

Meals
Travel
Technology
Office
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
// RECEIPT OCR FUNCTION
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
      // DOCUMENT INTELLIGENCE CONFIG
      //////////////////////////////////////////////////////////

      const endpoint = process.env.AZURE_DOC_ENDPOINT;
      const key = process.env.AZURE_DOC_KEY;

      if (!endpoint || !key) {
        throw new Error("Azure Document Intelligence credentials missing");
      }

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

      for (let i = 0; i < 20; i++) {

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
      // RESPONSE
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