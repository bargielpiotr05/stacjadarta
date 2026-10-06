const SUPABASE_URL = "https://mjebhhagwxtvhggyjwue.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1n3SqWhrrIzojpyFgnmaTw_a1pfzi5R";

async function supabaseProxyFetch(input, init) {
    // 1. W środowisku lokalnym (Live Server, LAN np. 192.168.x.x, localhost) endpoint proxy nie istnieje.
    // Natychmiast wykonujemy bezpośrednie połączenie z Supabase bez opóźnień i prób proxy.
    const isLocal =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
         window.location.hostname === "127.0.0.1" ||
         window.location.hostname.startsWith("192.168.") ||
         window.location.hostname.startsWith("10.") ||
         window.location.hostname.endsWith(".local") ||
         window.location.port !== "" ||
         window.location.protocol === "file:");

    if (isLocal) {
        return fetch(input, init);
    }

    const request = input instanceof Request ? input : new Request(input, init);
    let url;
    try {
        url = new URL(request.url);
    } catch {
        return fetch(input, init);
    }

    if (
        url.origin !== SUPABASE_URL ||
        (!url.pathname.startsWith("/rest/v1/") && !url.pathname.startsWith("/auth/v1/"))
    ) {
        return fetch(input, init);
    }

    const forwardedHeaders = {};
    for (const name of ["accept", "accept-profile", "content-type", "content-profile", "prefer", "range", "range-unit", "if-match", "if-none-match", "x-client-info"]) {
        const value = request.headers.get(name);
        if (value) forwardedHeaders[name] = value;
    }

    const authorization = request.headers.get("authorization") || "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "") || null;

    let body = null;
    if (!["GET", "HEAD"].includes(request.method)) {
        if (init && typeof init.body === "string") {
            body = init.body;
        } else if (typeof input === "object" && input && typeof input.body === "string") {
            body = input.body;
        } else {
            try {
                // Zabezpieczenie przed zawieszaniem WebKit / Safari na request.clone().text()
                body = await Promise.race([
                    request.clone().text(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout clone")), 1000))
                ]);
            } catch {
                return fetch(input, init);
            }
        }
    }

    const payload = { path: `${url.pathname}${url.search}`, method: request.method, headers: forwardedHeaders, body, accessToken };

    const wyslijZLimitem = (token) => {
        const controller = new AbortController();
        const timerId = setTimeout(() => controller.abort(), 8000);
        return fetch("/api/supabase-request", {
            method: "POST",
            headers: {
                apikey: request.headers.get("apikey") || SUPABASE_ANON_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ ...payload, accessToken: token }),
            cache: "no-store",
            signal: controller.signal,
        }).finally(() => clearTimeout(timerId));
    };

    let response;
    try {
        response = await wyslijZLimitem(accessToken);
    } catch (err) {
        // Serwer lokalny / błąd sieciowy / timeout proxy – fallback do bezpośredniego połączenia
        return fetch(input, init);
    }

    // Jeśli endpoint nie istnieje (np. Live Server zwraca 404 lub 405 Method Not Allowed)
    if (response.status === 404 || response.status === 405) {
        return fetch(input, init);
    }

    if (response.status === 401) {
        let errorBody = {};
        try {
            errorBody = await response.clone().json();
        } catch {}

        if (/JWT issued at future/i.test(errorBody.message || "")) {
            const klient = window.supabaseClient || window.supabaseKlient;
            try {
                const refreshed = await Promise.race([
                    klient?.auth?.refreshSession(),
                    new Promise((r) => setTimeout(() => r(null), 3000))
                ]);
                const freshToken = refreshed?.data?.session?.access_token;
                if (!refreshed?.error && freshToken) {
                    try {
                        response = await wyslijZLimitem(freshToken);
                    } catch {
                        return fetch(input, init);
                    }
                }
            } catch {
                return fetch(input, init);
            }
        }
    }

    return response;
}

window.supabaseProxyFetch = supabaseProxyFetch;

async function inicjalizujSupabaseGlobalnie() {
    if (window.supabaseClient) {
        window.supabaseKlient = window.supabaseClient;
        return window.supabaseClient;
    }

    const maksProby = 50;
    for (let i = 0; i < maksProby; i += 1) {
        if (window.supabase) {
            window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                global: { fetch: supabaseProxyFetch },
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                    lock: async (name, acquireTimeout, fn) => await fn()
                }
            });
            window.supabaseKlient = window.supabaseClient;
            return window.supabaseClient;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.error("Biblioteka Supabase nie została załadowana przed menu.js!");
    return null;
}

window.inicjalizujSupabaseGlobalnie = inicjalizujSupabaseGlobalnie;

(async () => {
    await inicjalizujSupabaseGlobalnie();
})();

window.supabaseKlient = window.supabaseClient;
const supabaseKlient = window.supabaseClient;

window.pobierzAktywnaSesjeSupabase = async function () {
    const klient = window.supabaseClient || window.supabaseKlient;
    if (!klient?.auth) return null;

    try {
        let { data: { session }, error } = await klient.auth.getSession();
        if (error) console.warn("Supabase getSession error:", error);

        if (!session?.user) {
            const { data: userData, error: userError } = await klient.auth.getUser();
            if (userError) console.warn("Supabase getUser error:", userError);

            if (userData?.user) {
                const refreshed = await klient.auth.refreshSession();
                if (refreshed?.data?.session) {
                    session = refreshed.data.session;
                } else {
                    session = { user: userData.user };
                }
            }
        }

        return session || null;
    } catch (err) {
        console.warn("Błąd pobierania aktywnej sesji:", err);
        return null;
    }
};

async function wczytajFragment(sciezka, selektor, element) {
    // Cache-busting dla iOS Safari (zapobiega serwowaniu starego nagłówka z pamięci)
    const url = `${sciezka}?t=${Date.now()}`;
    const odpowiedz = await fetch(url, { cache: "no-store" });
    if (!odpowiedz.ok) throw new Error(`Nie udało się wczytać ${sciezka}`);

    const html = await odpowiedz.text();
    const dokument = new DOMParser().parseFromString(html, "text/html");
    const fragment = dokument.querySelector(selektor);
    if (fragment) element.innerHTML = fragment.innerHTML;
}

async function wczytajWspolneElementy() {
    try {
        const naglowek = document.getElementById("wspolny-header");
        const stopka = document.getElementById("wspolny-footer");

        if (naglowek) await wczytajFragment("./header.html", "header", naglowek);
        if (stopka) await wczytajFragment("./footer.html", "footer", stopka);
    } catch (blad) {
        console.error("Nie udało się wczytać elementów strony:", blad);
        return;
    }

    uruchomMenuMobilne();
    await sprawdzStanLogowania();
    podepnijNasluchLogowania();
}

function zaktualizujWidokZalogowanego(user, daneZProfilu = null) {
    if (!user) return;

    const userMeta = user.user_metadata || {};
    let nick = daneZProfilu?.nazwa_gracza || userMeta.nazwa_gracza || userMeta.username || (user.email ? user.email.split("@")[0] : "Gracz");
    let avatarUrl = daneZProfilu?.avatar_url || userMeta.avatar_url;

    const avatarHtml = avatarUrl
        ? `<img src="${avatarUrl}" alt="${nick}" class="header-avatar-img" />`
        : `<span class="user-avatar-icon">👤</span>`;

    // 1. Podmiana w wersji desktop
    const desktopKonto = document.querySelector(".wersja-komputer .dropdown-konto, .wersja-komputer .join-us, .wersja-komputer .user-profile-badge");
    if (desktopKonto) {
        desktopKonto.outerHTML = `
            <div class="user-profile-badge">
                <a href="./profil.html" class="user-profile-link" title="Twój profil">
                    <span class="user-avatar-wrap">${avatarHtml}</span>
                    <span class="user-name">${nick}</span>
                </a>
            </div>
        `;
    }

    // 2. Podmiana w menu mobilnym (iOS / Android)
    const mobileAuthLinks = document.querySelectorAll(".mobilny-menu-links .konto");
    if (mobileAuthLinks.length > 0) {
        const pierwszyLi = mobileAuthLinks[0].closest("li");
        if (pierwszyLi) {
            pierwszyLi.innerHTML = `
                <div class="user-profile-badge-mobile">
                    <a href="./profil.html" class="user-profile-link">
                        <span class="user-avatar-wrap">${avatarHtml}</span>
                        <span class="user-name">${nick}</span>
                    </a>
                </div>
            `;
        }

        // Usunięcie zbędnego linku "Zarejestruj się"
        for (let i = 1; i < mobileAuthLinks.length; i++) {
            mobileAuthLinks[i].closest("li")?.remove();
        }
    } else {
        const mobileBadge = document.querySelector(".user-profile-badge-mobile");
        if (mobileBadge) {
            mobileBadge.innerHTML = `
                <a href="./profil.html" class="user-profile-link">
                    <span class="user-avatar-wrap">${avatarHtml}</span>
                    <span class="user-name">${nick}</span>
                </a>
            `;
        }
    }
}

async function sprawdzStanLogowania() {
    if (!supabaseKlient) return;

    try {
        let { data: { session } } = await supabaseKlient.auth.getSession();

        // Dodatkowa weryfikacja sieciowa dla WebKit
        if (!session) {
            const { data: userData } = await supabaseKlient.auth.getUser();
            if (userData?.user) {
                const refreshed = await supabaseKlient.auth.getSession();
                session = refreshed.data?.session || { user: userData.user };
            }
        }

        if (session && session.user) {
            const user = session.user;
            zaktualizujWidokZalogowanego(user);

            // Aktualizacja profilu z bazy w tle
            supabaseKlient
                .from("profiles")
                .select("nazwa_gracza, avatar_url")
                .eq("id", user.id)
                .maybeSingle()
                .then(({ data: profil }) => {
                    if (profil) zaktualizujWidokZalogowanego(user, profil);
                })
                .catch(() => {});
        }
    } catch (err) {
        console.warn("Błąd sesji w Safari:", err);
    }
}

function podepnijNasluchLogowania() {
    if (!supabaseKlient) return;
    supabaseKlient.auth.onAuthStateChange((event, session) => {
        if (session && session.user) {
            zaktualizujWidokZalogowanego(session.user);
        }
    });
}

function uruchomMenuMobilne() {
    const mobilnyMenuBtn = document.getElementById("mobilny-menu-btn");
    const mobilnyMenuOverlay = document.getElementById("mobilny-menu-overlay");
    const mobilnyMenuZamknij = document.getElementById("mobilny-menu-zamknij");

    if (mobilnyMenuBtn && mobilnyMenuOverlay && mobilnyMenuZamknij) {
        // Obsługa click oraz touchstart dla Safari
        const otworzMenu = (e) => {
            e.preventDefault();
            sprawdzStanLogowania(); // Natychmiastowe sprawdzenie sesji przy kliknięciu w hamburger
            mobilnyMenuOverlay.classList.add("otwarte");
            document.body.style.overflow = "hidden";
        };

        mobilnyMenuBtn.addEventListener("click", otworzMenu);

        mobilnyMenuZamknij.addEventListener("click", () => {
            mobilnyMenuOverlay.classList.remove("otwarte");
            document.body.style.overflow = "";
        });

        mobilnyMenuOverlay.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", () => {
                mobilnyMenuOverlay.classList.remove("otwarte");
                document.body.style.overflow = "";
            });
        });

        mobilnyMenuOverlay.addEventListener("click", (e) => {
            if (e.target === mobilnyMenuOverlay) {
                mobilnyMenuOverlay.classList.remove("otwarte");
                document.body.style.overflow = "";
            }
        });
    }
}

// 2. KLUCZOWE DLA SAFARI NA iOS:
// Obsługa powrotu na stronę z pamięci podręcznej (bfcache)
window.addEventListener("pageshow", async (event) => {
    if (window.SUPABASE_CLIENT_ONLY) return;
    if (event.persisted || performance?.getEntriesByType("navigation")[0]?.type === "back_forward") {
        await sprawdzStanLogowania();
    }
});

document.addEventListener("DOMContentLoaded", () => {
    if (window.SUPABASE_CLIENT_ONLY) return;
    wczytajWspolneElementy();
});
// ==========================================
// GLOBALNY SYSTEM ZAPROSZEŃ DO GRY (REALTIME)
// ==========================================

async function inicjalizujGlobalneZaproszenia() {
    const klient = window.supabaseClient || window.supabaseKlient;
    if (!klient) return;

    const { data: { session } } = await klient.auth.getSession();
    if (!session?.user) return; // Nasłuchują tylko zalogowani
    const myId = session.user.id;

    // 1. Wstrzykujemy globalny HTML popupa do dokumentu (niewidoczny domyślnie)
    const popupHtml = `
        <div id="global-invite-popup" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 99999; justify-content: center; align-items: center; padding: 20px; box-sizing: border-box;">
            <div style="background: var(--primary-color, #16124f); border: 3px solid var(--secondary-color, #40da40); border-radius: 15px; padding: 30px; text-align: center; max-width: 400px; width: 100%; box-shadow: 0 0 30px rgba(64, 218, 64, 0.3);">
                <h3 style="color: var(--secondary-color, #40da40); margin-top: 0; font-size: 22px;">ZAPROSZENIE DO GRY! 🎯</h3>
                <p style="color: #fff; font-size: 16px; margin: 20px 0;">
                    Gracz <strong id="invite-sender-nick" style="color: #38bdf8;">KTOŚ</strong> chce z Tobą zagrać!
                </p>
                <div style="display: flex; gap: 15px; justify-content: center; margin-top: 25px;">
                    <button id="btn-akceptuj-zaproszenie" style="flex: 1; padding: 12px; background: var(--secondary-color, #40da40); color: #000; font-weight: bold; border: none; border-radius: 8px; cursor: pointer;">Akceptuj</button>
                    <button id="btn-odrzuc-zaproszenie" style="flex: 1; padding: 12px; background: #ef4444; color: #fff; font-weight: bold; border: none; border-radius: 8px; cursor: pointer;">Odrzuć</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', popupHtml);

    // 2. Podpinamy nasłuch na tabelę 'game_invites' przez Supabase Realtime
    klient.channel('custom-invite-channel')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'game_invites',
                filter: `do_kogo_id=eq.${myId}` // Nasłuchuj TYLKO zaproszeń skierowanych do mnie
            },
            (payload) => {
                const noweZaproszenie = payload.new;
                pokazGlobalnyPopup(noweZaproszenie);
            }
        )
        .subscribe();

    // 3. Funkcja wyświetlająca i obsługująca wstrzyknięty popup
    function pokazGlobalnyPopup(invite) {
        const popup = document.getElementById("global-invite-popup");
        document.getElementById("invite-sender-nick").textContent = invite.od_kogo_nick;
        popup.style.display = "flex";

        // Co się stanie po kliknięciu Akceptuj
        document.getElementById("btn-akceptuj-zaproszenie").onclick = async () => {
            // Opcjonalnie: Zaktualizuj status w bazie na 'zaakceptowane'
            await klient.from('game_invites').update({ status: 'zaakceptowane' }).eq('id', invite.id);
            popup.style.display = "none";
            // Przeniesienie do gry
            window.location.href = `./klasyczna.html?pokoj=${invite.kod_pokoju}`;
        };

        // Co się stanie po kliknięciu Odrzuć
        document.getElementById("btn-odrzuc-zaproszenie").onclick = async () => {
            await klient.from('game_invites').update({ status: 'odrzucone' }).eq('id', invite.id);
            popup.style.display = "none";
        };
    }
}

// Uruchamiamy system zaproszeń zaraz po załadowaniu DOM (razem z resztą menu)
document.addEventListener("DOMContentLoaded", () => {
    if (window.SUPABASE_CLIENT_ONLY) return;
    inicjalizujGlobalneZaproszenia();
});