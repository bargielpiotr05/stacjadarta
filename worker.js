const SUPABASE_URL = "https://mjebhhagwxtvhggyjwue.supabase.co";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname === "/api/supabase-read") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
      }

      const apiKey = request.headers.get("apikey");
      if (!apiKey) return Response.json({ message: "Brak klucza API." }, { status: 401 });

      let payload;
      try {
        payload = await request.json();
      } catch {
        return Response.json({ message: "Nieprawidłowe body żądania." }, { status: 400 });
      }

      const { table, params, accessToken } = payload || {};
      const allowedParams = new Set(["select", "status", "zapraszajacy_id", "zapraszany_id", "id", "limit", "nazwa_gracza", "or"]);
      if (!new Set(["znajomi", "profiles"]).has(table) || !params || typeof params !== "object") {
        return Response.json({ message: "Nieprawidłowa tabela lub parametry." }, { status: 400 });
      }
      if (table === "znajomi" && (typeof accessToken !== "string" || !accessToken)) {
        return Response.json({ message: "Brak tokenu sesji." }, { status: 401 });
      }

      const upstreamUrl = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
      for (const [name, value] of Object.entries(params)) {
        if (!allowedParams.has(name) || typeof value !== "string") {
          return Response.json({ message: "Nieprawidłowy parametr zapytania." }, { status: 400 });
        }
        upstreamUrl.searchParams.set(name, value);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const startedAt = Date.now();
      const route = `/rest/v1/${table}`;
      console.log("Supabase REST proxy start", request.method, route);

      try {
        const headers = { apikey: apiKey, Accept: "application/json" };
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

        const upstreamResponse = await fetch(upstreamUrl, {
          headers,
          cache: "no-store",
          signal: controller.signal,
        });
        const responseBody = await upstreamResponse.arrayBuffer();
        const responseHeaders = new Headers({
          "Content-Type": upstreamResponse.headers.get("Content-Type") || "application/json",
          "Cache-Control": "no-store",
        });
        const contentRange = upstreamResponse.headers.get("Content-Range");
        if (contentRange) responseHeaders.set("Content-Range", contentRange);

        console.log("Supabase REST proxy response", request.method, route, upstreamResponse.status, Date.now() - startedAt);
        return new Response(responseBody, { status: upstreamResponse.status, headers: responseHeaders });
      } catch (error) {
        const message = error.name === "AbortError" ? "Przekroczono limit czasu połączenia z bazą." : "Worker nie połączył się z bazą danych.";
        console.error("Supabase REST proxy failure", request.method, route, error.name, Date.now() - startedAt);
        return Response.json({ message }, { status: 502, headers: { "Cache-Control": "no-store" } });
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (url.pathname === "/api/supabase-write") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
      }

      const apiKey = request.headers.get("apikey");
      if (!apiKey) return Response.json({ message: "Brak klucza API." }, { status: 401 });

      let payload;
      try {
        payload = await request.json();
      } catch {
        return Response.json({ message: "Nieprawidłowe body żądania." }, { status: 400 });
      }

      const { table, operation, filters = {}, values, accessToken } = payload || {};
      if (typeof accessToken !== "string" || !accessToken) {
        return Response.json({ message: "Brak tokenu sesji." }, { status: 401 });
      }

      const allowedTables = new Set(["znajomi", "rooms", "game_invites"]);
      if (!allowedTables.has(table)) return Response.json({ message: "Nieobsługiwana tabela." }, { status: 400 });

      const upstreamUrl = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
      let method;
      let body;
      let returnRepresentation = false;

      if (operation === "insert") {
        const records = Array.isArray(values) ? values : [values];
        const allowedFieldsByTable = {
          znajomi: new Set(["zapraszajacy_id", "zapraszany_id"]),
          rooms: new Set(["kod_pokoju", "host_id", "host_nazwa", "punkty_startowe", "docelowe_legi", "zasady_wejscia", "zasady_wyjscia", "format_gry", "status", "czy_prywatny"]),
          game_invites: new Set(["od_kogo_id", "od_kogo_nick", "do_kogo_id", "kod_pokoju"]),
        };
        const allowedFields = allowedFieldsByTable[table];
        if (!records.length || records.some((record) => !record || Object.keys(record).some((key) => !allowedFields.has(key)))) {
          return Response.json({ message: "Nieprawidłowe dane zaproszenia." }, { status: 400 });
        }
        if (table === "rooms" || table === "game_invites") {
          const requiredFields = table === "rooms" ? ["kod_pokoju", "host_id", "host_nazwa", "format_gry", "status"] : ["od_kogo_id", "od_kogo_nick", "do_kogo_id", "kod_pokoju"];
          if (records.some((record) => requiredFields.some((field) => record[field] === undefined || record[field] === null))) {
            return Response.json({ message: "Brak wymaganych pól zapisu." }, { status: 400 });
          }
        }
        method = "POST";
        body = JSON.stringify(records);
        returnRepresentation = table === "rooms";
      } else if (operation === "update") {
        if (table !== "znajomi" || !filters.id || !values || values.status !== "zaakceptowane" || Object.keys(values).some((key) => key !== "status")) {
          return Response.json({ message: "Nieprawidłowa aktualizacja relacji." }, { status: 400 });
        }
        upstreamUrl.searchParams.set("id", `eq.${filters.id}`);
        method = "PATCH";
        body = JSON.stringify(values);
      } else if (operation === "delete") {
        if (table !== "znajomi" || !filters.id) return Response.json({ message: "Brak ID relacji." }, { status: 400 });
        upstreamUrl.searchParams.set("id", `eq.${filters.id}`);
        method = "DELETE";
      } else {
        return Response.json({ message: "Nieobsługiwana operacja." }, { status: 400 });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const startedAt = Date.now();
      const route = `/rest/v1/${table}`;
      console.log("Supabase REST write start", method, route);

      try {
        const upstreamResponse = await fetch(upstreamUrl, {
          method,
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
            Prefer: returnRepresentation ? "return=representation" : "return=minimal",
          },
          body,
          cache: "no-store",
          signal: controller.signal,
        });
        const responseBody = await upstreamResponse.arrayBuffer();
        const headers = new Headers({ "Cache-Control": "no-store" });
        const contentType = upstreamResponse.headers.get("Content-Type");
        if (contentType) headers.set("Content-Type", contentType);

        console.log("Supabase REST write response", method, route, upstreamResponse.status, Date.now() - startedAt);
        return new Response(responseBody, { status: upstreamResponse.status, headers });
      } catch (error) {
        const message = error.name === "AbortError" ? "Przekroczono limit czasu połączenia z bazą." : "Worker nie połączył się z bazą danych.";
        console.error("Supabase REST write failure", method, route, error.name, Date.now() - startedAt);
        return Response.json({ message }, { status: 502, headers: { "Cache-Control": "no-store" } });
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (url.pathname === "/api/profiles") {
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
      }

      const apiKey = request.headers.get("apikey");
      const profileId = url.searchParams.get("id");

      if (!apiKey) {
        return Response.json({ message: "Brak klucza API." }, { status: 401 });
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

    if (url.pathname.startsWith("/api/supabase/rest/v1/")) {
      if (!["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"].includes(request.method)) {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD, POST, PATCH, DELETE, OPTIONS" } });
      }

      const upstreamUrl = new URL(`${SUPABASE_URL}${url.pathname.slice("/api/supabase".length)}${url.search}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const startedAt = Date.now();
      const route = url.pathname.slice("/api/supabase".length);
      console.log("Supabase REST proxy start", request.method, route);

      try {
        const upstreamRequest = new Request(upstreamUrl, request);
        const upstreamHeaders = new Headers(upstreamRequest.headers);
        if (request.method === "GET" && url.pathname === "/api/supabase/rest/v1/profiles") {
          upstreamHeaders.delete("Authorization");
        }

        const forwardedRequest = new Request(upstreamRequest, { headers: upstreamHeaders, signal: controller.signal });
        const upstreamResponse = await fetch(forwardedRequest);
        const buffersSmallResult = ["/rest/v1/znajomi", "/rest/v1/profiles", "/rest/v1/rooms"].includes(route);
        const responseBody = buffersSmallResult ? await upstreamResponse.arrayBuffer() : upstreamResponse.body;
        const headers = new Headers();

        for (const name of ["content-type", "content-range", "content-profile", "content-location", "preference-applied", "location", "etag"]) {
          const value = upstreamResponse.headers.get(name);
          if (value) headers.set(name, value);
        }

        headers.set("Cache-Control", "no-store");
        console.log("Supabase REST proxy response", request.method, route, upstreamResponse.status, Date.now() - startedAt);
    return new Response(responseBody, { status: upstreamResponse.status, headers });
      } catch (error) {
        const message = error.name === "AbortError" ? "Przekroczono limit czasu połączenia z bazą." : "Worker nie połączył się z bazą danych.";
        console.error("Supabase REST proxy failure", request.method, route, error.name, Date.now() - startedAt);
        return Response.json({ message }, { status: 502, headers: { "Cache-Control": "no-store" } });
      } finally {
        clearTimeout(timeoutId);
      }
    }

    return env.ASSETS.fetch(request);
  },
};