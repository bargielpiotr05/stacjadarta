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
            const userMeta = session.user.user_metadata || {};
            const nick = userMeta.username || session.user.email.split("@")[0];
            const avatarUrl = userMeta.avatar_url;

            // Jeśli użytkownik ma zapisany avatar_url, wstawiamy <img>, w przeciwnym razie domyślne 👤
            const avatarHtml = avatarUrl
                ? `<img src="${avatarUrl}" alt="${nick}" class="header-avatar-img" />`
                : `<span class="user-avatar-icon">👤</span>`;

            // Wersja komputerowa
            const joinUsDesktop = document.querySelector(".wersja-komputer .join-us");
            if (joinUsDesktop) {
                joinUsDesktop.outerHTML = `
                    <div class="user-profile-badge">
                        <a href="./profil.html" class="user-profile-link" title="Twój profil">
                            <span class="user-avatar-wrap">${avatarHtml}</span>
                            <span class="user-name">${nick}</span>
                        </a>
                    </div>
                `;
            }

            // Wersja mobilna
            const joinUsMobile = document.querySelector(".mobilny-menu-links .join-us");
            if (joinUsMobile) {
                const liContainer = joinUsMobile.closest("li") || joinUsMobile;
                liContainer.innerHTML = `
                    <div class="user-profile-badge-mobile">
                        <a href="./profil.html" class="user-profile-link">
                            <span class="user-avatar-wrap">${avatarHtml}</span>
                            <span class="user-name">${nick}</span>
                        </a>
                    </div>
                `;
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