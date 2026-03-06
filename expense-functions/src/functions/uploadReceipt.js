const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");

app.http("uploadReceipt", {
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

      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

      if (!connectionString) {
        return {
          status: 500,
          jsonBody: { error: "Storage connection string missing" }
        };
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

      return {
        status: 200,
        jsonBody: {
          url: blockBlobClient.url
        }
      };
    } catch (error) {
      context.log("UPLOAD ERROR:", error?.message || error);

      return {
        status: 500,
        jsonBody: {
          error: error?.message || "Receipt upload failed"
        }
      };
    }
  }
});