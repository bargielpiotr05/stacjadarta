const SUPABASE_URL = "https://mjebhhagwxtvhggyjwue.supabase.co";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname === "/api/supabase-request") {
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

      const { path, method, headers: clientHeaders = {}, body, accessToken } = payload || {};
      if (typeof path !== "string" || !["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"].includes(method)) {
        return Response.json({ message: "Nieprawidłowa ścieżka lub metoda REST." }, { status: 400 });
      }

      let upstreamUrl;
      try {
        upstreamUrl = new URL(path, SUPABASE_URL);
      } catch {
        return Response.json({ message: "Nieprawidłowa ścieżka REST." }, { status: 400 });
      }
      if (
        upstreamUrl.origin !== SUPABASE_URL ||
        (!upstreamUrl.pathname.startsWith("/rest/v1/") && !upstreamUrl.pathname.startsWith("/auth/v1/"))
      ) {
        return Response.json({ message: "Dozwolone są wyłącznie ścieżki PostgREST i Auth." }, { status: 400 });
      }

      const allowedHeaders = new Set(["accept", "accept-profile", "content-type", "content-profile", "prefer", "range", "range-unit", "if-match", "if-none-match", "x-client-info"]);
      const upstreamHeaders = new Headers({ apikey: apiKey });
      for (const [name, value] of Object.entries(clientHeaders)) {
        const normalizedName = name.toLowerCase();
        if (allowedHeaders.has(normalizedName) && typeof value === "string") upstreamHeaders.set(normalizedName, value);
      }
      if (typeof accessToken === "string" && accessToken) upstreamHeaders.set("Authorization", `Bearer ${accessToken}`);

      const hasBody = !["GET", "HEAD"].includes(method) && typeof body === "string";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const startedAt = Date.now();
      const route = upstreamUrl.pathname;
      console.log("Supabase SDK proxy start", method, route);

      try {
        const upstreamResponse = await fetch(upstreamUrl, {
          method,
          headers: upstreamHeaders,
          ...(hasBody ? { body } : {}),
          cache: "no-store",
          signal: controller.signal,
        });
        const noBody = ["HEAD"].includes(method) || [204, 205, 304].includes(upstreamResponse.status);
        const responseBody = noBody ? null : await upstreamResponse.arrayBuffer();
        const responseHeaders = new Headers();

        for (const name of ["content-type", "content-range", "content-profile", "content-location", "preference-applied", "location", "etag", "last-modified", "vary"]) {
          const value = upstreamResponse.headers.get(name);
          if (value) responseHeaders.set(name, value);
        }
        responseHeaders.set("Cache-Control", "no-store");

        console.log("Supabase SDK proxy response", method, route, upstreamResponse.status, Date.now() - startedAt);
        return new Response(responseBody, { status: upstreamResponse.status, headers: responseHeaders });
      } catch (error) {
        const message = error.name === "AbortError" ? "Przekroczono limit czasu połączenia z bazą." : "Worker nie połączył się z bazą danych.";
        console.error("Supabase SDK proxy failure", method, route, error.name, Date.now() - startedAt);
        return Response.json({ message }, { status: 502, headers: { "Cache-Control": "no-store" } });
      } finally {
        clearTimeout(timeoutId);
      }
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
      const allowedParams = new Set(["select", "status", "zapraszajacy_id", "zapraszany_id", "kod_pokoju", "od_kogo_id", "do_kogo_id", "id", "limit", "nazwa_gracza", "or", "host_id", "gosc_id", "order"]);
      if (!new Set(["znajomi", "profiles", "rooms", "game_invites", "matches"]).has(table) || !params || typeof params !== "object") {
        return Response.json({ message: "Nieprawidłowa tabela lub parametry." }, { status: 400 });
      }
      if ((table === "znajomi" || table === "game_invites") && (typeof accessToken !== "string" || !accessToken)) {
        return Response.json({ message: "Brak tokenu sesji." }, { status: 401 });
      }
      if (table === "rooms" && params.select !== "id,kod_pokoju,host_id,gosc_id,host_nazwa,gosc_nazwa,format_gry,punkty_startowe,docelowe_legi,dystans,zasady_wejscia,zasady_wyjscia,limit_lotek,status,aktualny_gracz_id,stan_meczu,stan_gry,wynik_host,wynik_gosc") {
        return Response.json({ message: "Niedozwolony zakres odczytu pokoju." }, { status: 400 });
      }
      if (table === "game_invites" && !["status,kod_pokoju", "id,status,kod_pokoju", "status,kod_pokoju,od_kogo_id"].includes(params.select)) {
        return Response.json({ message: "Niedozwolony zakres odczytu zaproszenia." }, { status: 400 });
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
        const responseBody = [204, 205, 304].includes(upstreamResponse.status) ? null : await upstreamResponse.arrayBuffer();
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

      const allowedTables = new Set(["znajomi", "rooms", "game_invites", "matches"]);
      if (!allowedTables.has(table)) return Response.json({ message: "Nieobsługiwana tabela." }, { status: 400 });

      const upstreamUrl = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
      let method;
      let body;
      let returnRepresentation = false;

      if (operation === "insert") {
        const records = Array.isArray(values) ? values : [values];
        const allowedFieldsByTable = {
          znajomi: new Set(["zapraszajacy_id", "zapraszany_id"]),
          rooms: new Set(["kod_pokoju", "host_id", "host_nazwa", "punkty_startowe", "docelowe_legi", "dystans", "zasady_wejscia", "zasady_wyjscia", "format_gry", "status", "czy_prywatny"]),
          game_invites: new Set(["od_kogo_id", "od_kogo_nick", "do_kogo_id", "kod_pokoju"]),
          matches: new Set(["host_id", "gosc_id", "zwyciezca_id", "wynik_host", "wynik_gosc", "format_gry", "pelny_przebieg_meczu", "statystyki_graczy"]),
        };
        const allowedFields = allowedFieldsByTable[table];
        if (!records.length || records.some((record) => !record || Object.keys(record).some((key) => !allowedFields.has(key)))) {
          return Response.json({ message: "Nieprawidłowe dane zapisu." }, { status: 400 });
        }
        if (table === "rooms" || table === "game_invites" || table === "matches") {
          const requiredFields = table === "rooms" 
            ? ["kod_pokoju", "host_id", "host_nazwa", "format_gry", "status"] 
            : (table === "game_invites" 
                ? ["od_kogo_id", "od_kogo_nick", "do_kogo_id", "kod_pokoju"] 
                : ["host_id", "format_gry"]);
          if (records.some((record) => requiredFields.some((field) => record[field] === undefined || record[field] === null))) {
            return Response.json({ message: "Brak wymaganych pól zapisu." }, { status: 400 });
          }
        }
        method = "POST";
        body = JSON.stringify(records);
        returnRepresentation = table === "rooms";
      } else if (operation === "update") {
        if (table === "znajomi") {
          if (!filters.id || !values || values.status !== "zaakceptowane" || Object.keys(values).some((key) => key !== "status")) {
            return Response.json({ message: "Nieprawidłowa aktualizacja relacji." }, { status: 400 });
          }
          upstreamUrl.searchParams.set("id", `eq.${filters.id}`);
          method = "PATCH";
          body = JSON.stringify(values);
        } else if (table === "rooms") {
          const allowedFields = new Set(["gosc_id", "gosc_nazwa", "status", "aktualny_gracz_id", "stan_meczu"]);
          if (
            !filters.kod_pokoju ||
            filters.status !== "waiting" ||
            filters.gosc_id !== null ||
            !values?.gosc_id ||
            values.status !== "in_progress" ||
            values.aktualny_gracz_id === undefined ||
            Object.keys(values).some((key) => !allowedFields.has(key))
          ) {
            return Response.json({ message: "Nieprawidłowe przypisanie gościa do pokoju." }, { status: 400 });
          }
          upstreamUrl.searchParams.set("kod_pokoju", `eq.${filters.kod_pokoju}`);
          upstreamUrl.searchParams.set("status", "eq.waiting");
          upstreamUrl.searchParams.set("gosc_id", "is.null");
          method = "PATCH";
          body = JSON.stringify(values);
          returnRepresentation = true;
        } else if (table === "game_invites") {
          const allowedFields = new Set(["status"]);
          if (
            (!filters.kod_pokoju && !filters.id) ||
            !values ||
            (values.status !== "odrzucone" && values.status !== "zaakceptowane") ||
            Object.keys(values).some((key) => !allowedFields.has(key))
          ) {
            return Response.json({ message: "Nieprawidłowa aktualizacja statusu zaproszenia." }, { status: 400 });
          }
          if (filters.kod_pokoju) upstreamUrl.searchParams.set("kod_pokoju", `eq.${filters.kod_pokoju}`);
          if (filters.id) upstreamUrl.searchParams.set("id", `eq.${filters.id}`);
          method = "PATCH";
          body = JSON.stringify(values);
        } else {
          return Response.json({ message: "Nieprawidłowa aktualizacja." }, { status: 400 });
        }
      } else if (operation === "delete") {
        if (table === "znajomi" && filters.id) {
          upstreamUrl.searchParams.set("id", `eq.${filters.id}`);
        } else if (table === "rooms" && filters.kod_pokoju) {
          upstreamUrl.searchParams.set("kod_pokoju", `eq.${filters.kod_pokoju}`);
          if (filters.status === "neq.finished") upstreamUrl.searchParams.set("status", filters.status);
          else if (filters.status !== undefined) return Response.json({ message: "Nieprawidłowy filtr statusu pokoju." }, { status: 400 });
        } else {
          return Response.json({ message: "Brak filtra usuwania." }, { status: 400 });
        }
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
        const responseBody = [204, 205, 304].includes(upstreamResponse.status) ? null : await upstreamResponse.arrayBuffer();
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

      if (!profileId || !profileId.trim()) {
        return Response.json({ message: "Brak ID lub nazwy gracza." }, { status: 400 });
      }

      const cleanProfileId = profileId.trim();
      const isUuid = /^[0-9a-f-]{36}$/i.test(cleanProfileId);
      const upstreamUrl = new URL(`${SUPABASE_URL}/rest/v1/profiles`);
      upstreamUrl.searchParams.set("select", "id,nazwa_gracza,avatar_url,utworzono,srednia,srednia_9_lotek,ilosc_180,rozegrane_mecze,wygrane_mecze,barele,shafty,groty,tarcza,auto_score,druzyna");
      if (isUuid) {
        upstreamUrl.searchParams.set("id", `eq.${cleanProfileId}`);
      } else {
        upstreamUrl.searchParams.set("nazwa_gracza", `ilike.${cleanProfileId}`);
      }
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

    if (url.pathname.startsWith("/api/supabase/rest/v1/") || url.pathname.startsWith("/api/supabase/storage/v1/")) {
      if (!["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"].includes(request.method)) {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS" } });
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
        if (route.startsWith("/storage/v1/")) {
          upstreamHeaders.set("apikey", "sb_publishable_1n3SqWhrrIzojpyFgnmaTw_a1pfzi5R");
          upstreamHeaders.set("authorization", "Bearer sb_publishable_1n3SqWhrrIzojpyFgnmaTw_a1pfzi5R");
        } else {
          if (!upstreamHeaders.has("apikey")) {
            upstreamHeaders.set("apikey", "sb_publishable_1n3SqWhrrIzojpyFgnmaTw_a1pfzi5R");
          }
          if (!upstreamHeaders.has("authorization")) {
            upstreamHeaders.set("authorization", `Bearer sb_publishable_1n3SqWhrrIzojpyFgnmaTw_a1pfzi5R`);
          }
        }
        if (request.method === "GET" && url.pathname === "/api/supabase/rest/v1/profiles") {
          upstreamHeaders.delete("Authorization");
        }

        const forwardedRequest = new Request(upstreamRequest, { headers: upstreamHeaders, signal: controller.signal });
        const upstreamResponse = await fetch(forwardedRequest);
        const buffersSmallResult = ["/rest/v1/znajomi", "/rest/v1/profiles", "/rest/v1/rooms"].includes(route) || route.startsWith("/storage/v1/object/list/");
        const noBody = request.method === "HEAD" || [204, 205, 304].includes(upstreamResponse.status);
        const responseBody = noBody ? null : buffersSmallResult ? await upstreamResponse.arrayBuffer() : upstreamResponse.body;
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