const { app } = require("@azure/functions");

app.http("receiptOCR", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {

    try {

      const body = await request.json();
      const image = body?.image;

      if (!image) {
        return {
          status: 400,
          jsonBody: { error: "No image provided" }
        };
      }

      const endpoint = process.env.AZURE_DOC_ENDPOINT;
      const key = process.env.AZURE_DOC_KEY;

      if (!endpoint || !key) {
        context.log("Missing AZURE_DOC_ENDPOINT or AZURE_DOC_KEY");

        return {
          status: 500,
          jsonBody: { error: "OCR environment variables missing" }
        };
      }

      const cleanEndpoint = endpoint.replace(/\/$/, "");

      const analyzeUrl =
        `${cleanEndpoint}/formrecognizer/documentModels/prebuilt-receipt:analyze?api-version=2023-07-31`;

      // STEP 1: Send receipt to Azure
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

        const text = await analyzeResponse.text();

        context.log("Azure analyze failed:", text);

        return {
          status: 500,
          jsonBody: { error: "Azure analyze request failed" }
        };
      }

      const operationLocation =
        analyzeResponse.headers.get("operation-location");

      if (!operationLocation) {

        context.log("No operation-location header returned");

        return {
          status: 500,
          jsonBody: { error: "Azure OCR polling URL missing" }
        };
      }

      // STEP 2: Poll until finished
      let result;

      while (true) {

        const pollResponse = await fetch(operationLocation, {
          method: "GET",
          headers: {
            "Ocp-Apim-Subscription-Key": key
          }
        });

        result = await pollResponse.json();

        if (result.status === "succeeded") break;

        if (result.status === "failed") {

          context.log("OCR processing failed:", result);

          return {
            status: 500,
            jsonBody: { error: "OCR processing failed" }
          };
        }

        await new Promise(r => setTimeout(r, 1500));
      }

      // STEP 3: Parse result safely
      const doc =
        result?.analyzeResult?.documents?.[0];

      if (!doc) {

        context.log("No receipt detected");

        return {
          jsonBody: {
            merchant: "",
            amount: null,
            date: ""
          }
        };
      }

      const merchant =
        doc.fields?.MerchantName?.valueString ?? "";

      const amount =
        doc.fields?.Total?.valueCurrency?.amount ?? null;

      const date =
        doc.fields?.TransactionDate?.valueDate ?? "";

      return {
        jsonBody: {
          merchant,
          amount,
          date
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