const SUPABASE_URL = "https://mjebhhagwxtvhggyjwue.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1n3SqWhrrIzojpyFgnmaTw_a1pfzi5R";

// 1. Zabezpieczenie przed tworzeniem duplikatów klienta w Safari (wspólny obiekt)
if (!window.supabaseClient && !window.supabaseKlient && window.supabase) {
    const instancja = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });
    window.supabaseClient = instancja;
    window.supabaseKlient = instancja;
}

const supabaseKlient = window.supabaseClient || window.supabaseKlient;

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
    if (event.persisted || performance?.getEntriesByType("navigation")[0]?.type === "back_forward") {
        await sprawdzStanLogowania();
    }
});

document.addEventListener("DOMContentLoaded", wczytajWspolneElementy);