const SUPABASE_URL = "https://mjebhhagwxtvhggyjwue.supabase.co";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/profiles") {
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
      }

      const authorization = request.headers.get("Authorization");
      const apiKey = request.headers.get("apikey");
      const profileId = url.searchParams.get("id");

      if (!authorization?.startsWith("Bearer ") || !apiKey) {
        return Response.json({ message: "Wymagane jest zalogowanie." }, { status: 401 });
      }

      if (!profileId || !/^[0-9a-f-]{36}$/i.test(profileId)) {
        return Response.json({ message: "Nieprawidłowe ID profilu." }, { status: 400 });
      }

      const upstreamUrl = new URL(`${SUPABASE_URL}/rest/v1/profiles`);
      upstreamUrl.searchParams.set("select", "id,nazwa_gracza,avatar_url,utworzono,srednia,srednia_9_lotek,ilosc_180,rozegrane_mecze,wygrane_mecze,barele,shafty,groty,tarcza,auto_score,druzyna");
      upstreamUrl.searchParams.set("id", `eq.${profileId}`);
      upstreamUrl.searchParams.set("limit", "1");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(upstreamUrl, {
          headers: {
            apikey: apiKey,
            Authorization: authorization,
            Accept: "application/json",
          },
          cache: "no-store",
          signal: controller.signal,
        });

        return new Response(response.body, {
          status: response.status,
          headers: {
            "Content-Type": response.headers.get("Content-Type") || "application/json",
            "Cache-Control": "no-store",
          },
        });
      } catch (error) {
        const message = error.name === "AbortError" ? "Przekroczono limit czasu połączenia z bazą." : "Worker nie połączył się z bazą danych.";
        return Response.json({ message }, { status: 502, headers: { "Cache-Control": "no-store" } });
      } finally {
        clearTimeout(timeoutId);
      }
    }

    return env.ASSETS.fetch(request);
  },
};