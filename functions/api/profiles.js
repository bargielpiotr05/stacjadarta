const SUPABASE_URL = "https://mjebhhagwxtvhggyjwue.supabase.co";

export async function onRequestGet({ request }) {
  const authorization = request.headers.get("Authorization");
  const apiKey = request.headers.get("apikey");
  const profileId = new URL(request.url).searchParams.get("id");

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

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        apikey: apiKey,
        Authorization: authorization,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type": upstreamResponse.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ message: "Serwer strony nie połączył się z bazą danych." }, { status: 502 });
  }
}