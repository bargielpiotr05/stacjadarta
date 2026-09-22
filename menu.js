const SUPABASE_URL = "https://mjebhhagwxtvhggyjwue.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1n3SqWhrrIzojpyFgnmaTw_a1pfzi5R";

let supabaseKlient = null;
if (window.supabase) {
    supabaseKlient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function wczytajFragment(sciezka, selektor, element) {
    const odpowiedz = await fetch(sciezka);
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
        console.error("Nie udało się wczytać wspólnych elementów strony.", blad);
        return;
    }

    uruchomMenuMobilne();
    await sprawdzStanLogowania();
}

async function sprawdzStanLogowania() {
    if (!supabaseKlient) return;

    try {
        const { data: { session } } = await supabaseKlient.auth.getSession();

        if (session && session.user) {
            const user = session.user;
            const userMeta = user.user_metadata || {};

            // 1. Pobieramy aktualne dane bezpośrednio z tabeli profiles
            let nick = userMeta.username || (user.email ? user.email.split("@")[0] : "Gracz");
            let avatarUrl = userMeta.avatar_url;

            const { data: profil } = await supabaseKlient
                .from("profiles")
                .select("nazwa_gracza, avatar_url")
                .eq("id", user.id)
                .maybeSingle();

            if (profil) {
                if (profil.nazwa_gracza) nick = profil.nazwa_gracza;
                if (profil.avatar_url) avatarUrl = profil.avatar_url;
            }

            const avatarHtml = avatarUrl
                ? `<img src="${avatarUrl}" alt="${nick}" class="header-avatar-img" />`
                : `<span class="user-avatar-icon">👤</span>`;

            // 2. Wersja komputerowa: podmieniamy cały blok .dropdown-konto lub dawny .join-us
            const desktopKonto = document.querySelector(".wersja-komputer .dropdown-konto, .wersja-komputer .join-us");
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

            // 3. Wersja mobilna: podmieniamy przycisk logowania na profil, a rejestrację usuwamy
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

                // Usuwamy pozostałe linki autoryzacyjne (np. "ZAREJESTRUJ SIĘ")
                for (let i = 1; i < mobileAuthLinks.length; i++) {
                    mobileAuthLinks[i].closest("li")?.remove();
                }
            }
        }
    } catch (err) {
        console.error("Błąd podczas weryfikacji sesji:", err);
    }
}

function uruchomMenuMobilne() {
    const mobilnyMenuBtn = document.getElementById("mobilny-menu-btn");
    const mobilnyMenuOverlay = document.getElementById("mobilny-menu-overlay");
    const mobilnyMenuZamknij = document.getElementById("mobilny-menu-zamknij");

    if (mobilnyMenuBtn && mobilnyMenuOverlay && mobilnyMenuZamknij) {
        mobilnyMenuBtn.addEventListener("click", () => {
            mobilnyMenuOverlay.classList.add("otwarte");
            document.body.style.overflow = "hidden";
        });

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

document.addEventListener("DOMContentLoaded", wczytajWspolneElementy);