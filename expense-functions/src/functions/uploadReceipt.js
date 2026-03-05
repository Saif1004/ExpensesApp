const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");

app.http("uploadReceipt", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request) => {

    const { image } = await request.json();

    const connectionString =
      process.env.AZURE_STORAGE_CONNECTION_STRING;

    const blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);

    const containerClient =
      blobServiceClient.getContainerClient("receipts");

    const fileName =
      `receipt-${Date.now()}.jpg`;

    const blockBlobClient =
      containerClient.getBlockBlobClient(fileName);

    const buffer = Buffer.from(image, "base64");

    await blockBlobClient.uploadData(buffer);

    return {
      jsonBody: {
        url: blockBlobClient.url
      }
    };

  }
});