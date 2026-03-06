const { app } = require("@azure/functions");

app.http("receiptOCR", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {
    try {

      const { image } = await request.json();

      if (!image) {
        return {
          status: 400,
          jsonBody: { error: "No image provided" }
        };
      }

      const endpoint = process.env.AZURE_DOC_ENDPOINT;
      const key = process.env.AZURE_DOC_KEY;

      if (!endpoint || !key) {
        context.log("OCR environment variables missing");

        return {
          status: 500,
          jsonBody: { error: "OCR environment variables missing" }
        };
      }

      const analyzeUrl =
        `${endpoint.replace(/\/$/, "")}/formrecognizer/documentModels/prebuilt-receipt:analyze?api-version=2023-07-31`;

      //////////////////////////////////////////////////////////
      // Send receipt to Azure
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

      if (!operationLocation) {
        return {
          status: 500,
          jsonBody: { error: "OCR polling URL missing" }
        };
      }

      //////////////////////////////////////////////////////////
      // Poll Azure result
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
      // Extract Azure structured fields
      //////////////////////////////////////////////////////////

      const doc = result?.analyzeResult?.documents?.[0];

      let merchant =
        doc?.fields?.MerchantName?.valueString ?? "";

      let amount =
        doc?.fields?.Total?.valueCurrency?.amount ?? null;

      let date =
        doc?.fields?.TransactionDate?.valueDate ?? "";

      //////////////////////////////////////////////////////////
      // Fallback: detect total manually if Azure misses it
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
      // Category detection
      //////////////////////////////////////////////////////////

      let category = "Meals";
      const m = merchant.toLowerCase();

      if (
        m.includes("uber") ||
        m.includes("taxi") ||
        m.includes("train") ||
        m.includes("bus") ||
        m.includes("tfl")
      ) {
        category = "Travel";
      }
      else if (
        m.includes("amazon") ||
        m.includes("apple") ||
        m.includes("currys") ||
        m.includes("pc world")
      ) {
        category = "Technology";
      }
      else if (
        m.includes("ryman") ||
        m.includes("staples") ||
        m.includes("office")
      ) {
        category = "Office";
      }
      else {
        category = "Meals";
      }

      //////////////////////////////////////////////////////////
      // Log OCR result
      //////////////////////////////////////////////////////////

      context.log("OCR RESULT:", {
        merchant,
        amount,
        date,
        category
      });

      //////////////////////////////////////////////////////////
      // Return response
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

    }
    catch (error) {

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