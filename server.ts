const PANGRAM_API_URL = "https://text.api.pangramlabs.com/v3";
const PORT = 3000;

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // API route for text verification
    if (url.pathname === "/api/verify" && req.method === "POST") {
      try {
        const body = await req.json();
        const { text } = body;

        if (!text || typeof text !== "string" || text.trim().length === 0) {
          return Response.json(
            { error: "Text is required" },
            { status: 400 }
          );
        }

        const apiKey = process.env.PANGRAM_API_KEY;
        if (!apiKey) {
          return Response.json(
            { error: "API key not configured" },
            { status: 500 }
          );
        }

        const response = await fetch(PANGRAM_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            text: text.trim(),
            public_dashboard_link: true,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Pangram API error:", response.status, errorText);
          return Response.json(
            { error: `Pangram API error: ${response.status}` },
            { status: response.status }
          );
        }

        const data = await response.json();
        console.log("Pangram API response:", JSON.stringify(data, null, 2));
        return Response.json(data);
      } catch (error) {
        console.error("Error processing request:", error);
        return Response.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }
    }

    // Serve static files from public/
    let filePath = url.pathname;
    if (filePath === "/") {
      filePath = "/index.html";
    }

    const file = Bun.file(`./public${filePath}`);
    const exists = await file.exists();

    if (exists) {
      return new Response(file);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running at http://localhost:${PORT}`);
