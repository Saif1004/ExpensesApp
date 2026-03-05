const { app } = require("@azure/functions");

app.http("receiptOCR", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request) => {

    const { image } = await request.json();

    const endpoint = process.env.AZURE_DOC_ENDPOINT;
    const key = process.env.AZURE_DOC_KEY;

    const url =
      `${endpoint}/formrecognizer/documentModels/prebuilt-receipt:analyze?api-version=2023-07-31`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": key
      },
      body: JSON.stringify({
        base64Source: image
      })
    });

    const operationLocation =
      response.headers.get("operation-location");

    // Wait for Azure to finish analyzing receipt
    let result;

    while (true) {

      const poll = await fetch(operationLocation, {
        headers: {
          "Ocp-Apim-Subscription-Key": key
        }
      });

      result = await poll.json();

      if (result.status === "succeeded") break;

      await new Promise(r => setTimeout(r, 1500));
    }

    const receipt =
      result.analyzeResult.documents[0];

    const merchant =
      receipt.fields?.MerchantName?.valueString ?? "";

    const amount =
      receipt.fields?.Total?.valueCurrency?.amount ?? null;

    const date =
      receipt.fields?.TransactionDate?.valueDate ?? "";

    return {
      jsonBody: {
        merchant,
        amount,
        date
      }
    };
  }
});