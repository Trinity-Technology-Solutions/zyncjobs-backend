import express from "express";

const router = express.Router();

const AI_SERVICE_URL = process.env.AI_GATEWAY_URL || "http://localhost:8001";

router.all("*", async (req, res) => {
  try {
    const targetPath = req.originalUrl.replace("/api/ai-proxy", "");
    const targetUrl = `${AI_SERVICE_URL}${targetPath}`;

    const headers = { ...req.headers };
    delete headers.host;
    delete headers["content-length"];
    delete headers["transfer-encoding"];
    delete headers.connection;

    const fetchOptions = { method: req.method, headers };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const contentType = req.headers["content-type"] || "";

      // Handle multipart/form-data (file uploads)
      if (contentType.startsWith("multipart/form-data")) {
        // Multer has parsed the form data into req.body (fields) and req.files
        const formData = new FormData();
        // Add regular fields
        if (req.body && typeof req.body === "object") {
          for (const [key, value] of Object.entries(req.body)) {
            formData.append(key, value);
          }
        }
        // Add files
        if (req.files && Array.isArray(req.files)) {
          for (const file of req.files) {
            const blob = new Blob([file.buffer], { type: file.mimetype });
            formData.append(file.fieldname, blob, file.originalname);
          }
        }
        fetchOptions.body = formData;
        // Let fetch set the correct content-type with boundary
        delete headers["content-type"];
      } else if (Buffer.isBuffer(req.body)) {
        fetchOptions.body = req.body;
        if (!headers["content-type"]) {
          headers["content-type"] = "application/octet-stream";
        }
      } else if (typeof req.body === "object" && req.body !== null) {
        fetchOptions.body = JSON.stringify(req.body);
        headers["content-type"] = "application/json";
      } else if (req.body) {
        fetchOptions.body = req.body;
      }
    }

    const response = await fetch(targetUrl, fetchOptions);

    // Forward only content-type, NOT all headers (would overwrite Express CORS headers)
    if (response.headers.get("content-type")) {
      res.setHeader("content-type", response.headers.get("content-type"));
    }

    const body = await response.text();
    res.status(response.status).send(body);
  } catch (error) {
    console.error("AI proxy error:", error.message);
    res.status(502).json({
      error: "AI service unavailable",
      detail: error.message,
    });
  }
});

export default router;
