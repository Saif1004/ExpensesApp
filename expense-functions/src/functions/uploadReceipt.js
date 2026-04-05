const { app } = require("@azure/functions");
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");
const { authAndLimit } = require("./rateLimit");
const { secureResponse } = require("./security");

//////////////////////////////////////////////////////
// Parse AccountName and AccountKey from connection string
//////////////////////////////////////////////////////
function parseConnectionString(connStr) {
  const parts = {};
  connStr.split(";").forEach((segment) => {
    const idx = segment.indexOf("=");
    if (idx > 0) {
      parts[segment.substring(0, idx)] = segment.substring(idx + 1);
    }
  });
  return {
    accountName: parts["AccountName"] ?? "",
    accountKey:  parts["AccountKey"]  ?? "",
  };
}

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

      if (typeof image !== "string") {
        return secureResponse({ error: "image must be a base64 string" }, 400);
      }

      // Validate base64 format
      if (!/^[A-Za-z0-9+/]+=*$/.test(image)) {
        return secureResponse({ error: "image must be valid base64" }, 400);
      }

      // Enforce 10 MB limit (base64 is ~4/3x raw size, so 10 MB raw ≈ 13.3 MB base64)
      const MAX_BASE64_LENGTH = 13_500_000;
      if (image.length > MAX_BASE64_LENGTH) {
        return secureResponse({ error: "image exceeds the 10 MB size limit" }, 400);
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

      //////////////////////////////////////////////////////
      // Generate a read-only SAS URL (10-year expiry) so the
      // receipt image is accessible from the mobile app without
      // requiring the Blob container to be publicly accessible.
      //////////////////////////////////////////////////////

      const { accountName, accountKey } = parseConnectionString(connectionString);
      const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

      const expiresOn = new Date();
      expiresOn.setFullYear(expiresOn.getFullYear() + 1);

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: "receipts",
          blobName:       fileName,
          permissions:    BlobSASPermissions.parse("r"), // read-only
          expiresOn,
        },
        sharedKeyCredential
      ).toString();

      const sasUrl = `${blockBlobClient.url}?${sasToken}`;

      return secureResponse({ url: sasUrl }, 200);

    } catch (error) {
      context.log("UPLOAD ERROR:", error?.message || error);
      return secureResponse({ error: error?.message || "Receipt upload failed" }, 500);
    }
  }
});