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