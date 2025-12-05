import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

app.get("/", (c) => c.json({ message: "Hello from Hono on Node!" }));
app.get("/healthz", (c) => c.text("ok"));

const port = Number(process.env.PORT ?? 3000);

serve({
	fetch: app.fetch,
	port,
});

console.log(`Hono server running at http://localhost:${port}`);
