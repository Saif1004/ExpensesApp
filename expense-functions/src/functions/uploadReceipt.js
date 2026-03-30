const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const { authAndLimit } = require("./rateLimit");
const { secureResponse } = require("./security");

app.http("uploadReceipt", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {
    try {
      // AUTH + RATE LIMIT (10 uploads per minute per user)
      const auth = await authAndLimit(request, "rateLimitUpload", 10);
      if (auth.error) return auth.error;

      const { image } = await request.json();

      if (!image) {
        return secureResponse({ error: "No image provided" }, 400);
      }

      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

      if (!connectionString) {
        return secureResponse({ error: "Storage connection string missing" }, 500);
      }

      context.log("Starting receipt upload...");

      const blobServiceClient =
        BlobServiceClient.fromConnectionString(connectionString);

      const containerClient =
        blobServiceClient.getContainerClient("receipts");

      await containerClient.createIfNotExists();

      const fileName = `receipt-${Date.now()}.jpg`;

      const blockBlobClient =
        containerClient.getBlockBlobClient(fileName);

      const buffer = Buffer.from(image, "base64");

      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: {
          blobContentType: "image/jpeg"
        }
      });

      context.log("Receipt uploaded successfully:", blockBlobClient.url);

      return secureResponse({ url: blockBlobClient.url }, 200);

    } catch (error) {
      context.log("UPLOAD ERROR:", error?.message || error);
      return secureResponse({ error: error?.message || "Receipt upload failed" }, 500);
    }
  }
});