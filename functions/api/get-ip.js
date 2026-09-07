export async function onRequest(context) {
  const clientIP = context.request.headers.get("CF-Connecting-IP") || "nieznane";

  return new Response(JSON.stringify({ ip: clientIP }), {
    headers: { "Content-Type": "application/json" }
  });
}