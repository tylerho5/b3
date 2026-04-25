const PORT = Number(process.env.B3_PORT ?? 4477);

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok");
    return new Response("b3 server", { status: 200 });
  },
});

console.log(`b3 server listening on http://${server.hostname}:${server.port}`);
