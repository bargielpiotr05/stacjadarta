// ==============================================================================
// WSPÓLNY MODUŁ WYBORU GRACZY (BEZ DARTBOTA DLA TRYBÓW TRENINGOWYCH / DODATKOWYCH)
// ==============================================================================

(function(window) {
    let graczeUczestnicy = ["Gracz 1"];
    let zalogowanyNickGlobalny = "";
    let zalogowanyUserIdGlobalny = null;
    let onPlayersChangedCallback = null;

    try {
        window.idZnajomychWGrze = JSON.parse(localStorage.getItem("sd_id_znajomych_w_grze") || "{}");
    } catch (e) {
        window.idZnajomychWGrze = {};
    }

    function odczytajZalogowanegoZStorage() {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const klucz = localStorage.key(i);
                if (klucz && (klucz.startsWith("sb-") && klucz.endsWith("-auth-token") || klucz === "supabase.auth.token")) {
                    const raw = localStorage.getItem(klucz);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        const user = parsed?.user;
                        if (user) {
                            return {
                                id: user.id,
                                nick: user.user_metadata?.username || user.user_metadata?.nazwa_gracza || (user.email ? user.email.split("@")[0] : "Gracz")
                            };
                        }
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    // Modal HTML do dodawania gracza (Znajomi, Ty, Gość - BEZ DARTBOTA)
    function upewnijSieZeModalIstnieje() {
        if (document.getElementById("popup-dodaj-gracza")) return;

        const modalHtml = `
            <div id="popup-dodaj-gracza" class="custom-popup-overlay" style="display: none">
                <div class="custom-popup-box dodawanie-uczestnikow">
                    <div class="dodawanie-uczestnikow-div-inside">
                        <h3 class="dodaj-uczestnika-head">Dodaj Uczestnika</h3>
                        <button type="button" class="btn-zamknij-popup-uczestnicy" onclick="zamknijPopupDodajGracza()">✖</button>
                    </div>

                    <!-- ZAKŁADKI KATEGORII (BEZ DARTBOTA) -->
                    <div id="kontener-opcji-graczy" class="opcje-graczy-tabs">
                        <button type="button" class="btn-opcja-gracza aktywna-opcja" data-target="gracz-znajomi">Znajomi</button>
                        <button type="button" class="btn-opcja-gracza" data-target="gracz-ty">Ty</button>
                        <button type="button" class="btn-opcja-gracza" data-target="gracz-gosc">Gość</button>
                    </div>

                    <div id="kontener-dodawania-gracza">
                        <!-- 1. GOŚĆ -->
                        <div id="gracz-gosc" class="zakladka-dodaj-tresc" style="display: none">
                            <label>
                                <h4>Nazwa gracza:</h4>
                                <input type="text" id="nazwa-gracza-popup" class="wspolny-input" placeholder="Wpisz imię gracza..." />
                            </label>
                            <div class="custom-popup-buttons">
                                <button type="button" class="popup-btn popup-btn-yes" onclick="zatwierdzDodanieGoscia()">Dodaj gracza</button>
                                <button type="button" class="popup-btn popup-btn-no" onclick="zamknijPopupDodajGracza()">Anuluj</button>
                            </div>
                        </div>

                        <!-- 2. TY -->
                        <div id="gracz-ty" class="zakladka-dodaj-tresc" style="display: none">
                            <div id="gracz-ty-niezalogowany" style="display: none">
                                <p style="color:#cbd5e1; font-size:14px; margin: 10px 0;">Musisz być zalogowany, aby dodać swoje konto.</p>
                                <div class="custom-popup-buttons">
                                    <button type="button" class="popup-btn popup-btn-yes" onclick="window.location.href = './logowanie.html'">Zaloguj się</button>
                                    <button type="button" class="popup-btn popup-btn-no" onclick="zamknijPopupDodajGracza()">Anuluj</button>
                                </div>
                            </div>
                            <div id="gracz-ty-zalogowany" style="display: none">
                                <label>
                                    <h4>Zalogowane konto:</h4>
                                    <input type="text" id="nazwa-gracza-ty" class="wspolny-input" style="opacity: 0.7; cursor: not-allowed" readonly />
                                </label>
                                <div class="custom-popup-buttons">
                                    <button type="button" id="btn-dodaj-siebie" class="popup-btn popup-btn-yes" onclick="zatwierdzDodanieSiebie()">Dodaj moje konto</button>
                                    <button type="button" class="popup-btn popup-btn-no" onclick="zamknijPopupDodajGracza()">Anuluj</button>
                                </div>
                            </div>
                        </div>

                        <!-- 3. ZNAJOMI -->
                        <div id="gracz-znajomi" class="zakladka-dodaj-tresc" style="display: flex">
                            <h4>Wybierz znajomego z listy:</h4>
                            <div id="lista-znajomych-popup">
                                <p style="color:#94a3b8; font-size: 14px; text-align: center;">Ładowanie znajomych...</p>
                            </div>
                            <div class="custom-popup-buttons">
                                <button type="button" class="popup-btn popup-btn-no" onclick="zamknijPopupDodajGracza()">Zamknij</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML("beforeend", modalHtml);
        podepnijZakladkiPopupu();
    }

    function renderujPolaUczestnikow() {
        const kontener = document.getElementById("kontener-nazw-graczy");
        if (!kontener) return;
        kontener.innerHTML = "";

        const moznaUsunac = graczeUczestnicy.length > 1;
        const nickiZnajomychWGrze = Object.keys(window.idZnajomychWGrze || {});

        graczeUczestnicy.forEach((nazwa, idx) => {
            const nr = idx + 1;
            const czyToMojeKonto = zalogowanyNickGlobalny !== "" && nazwa === zalogowanyNickGlobalny;
            const czyToKontoZnajomego = nickiZnajomychWGrze.includes(nazwa) || nickiZnajomychWGrze.some((n) => n.toLowerCase() === (nazwa || "").toLowerCase());
            const czyZablokowaneEdycja = czyToMojeKonto || czyToKontoZnajomego;

            const atrybutyInputa = czyZablokowaneEdycja
                ? 'readonly style="opacity: 0.7; cursor: not-allowed; pointer-events: none;" title="Oficjalnego konta nie można edytować ręcznie"'
                : `oninput="window.zaktualizujNazweGracza(${idx}, this.value)"`;

            kontener.innerHTML += `
                <label>
                    <h4>Gracz ${nr}:</h4>
                    <div id="default-dodaj-gracza">
                        <input type="text" id="nazwa-gracza${nr}" 
                               class="wspolny-input input-nazwa-gracza" 
                               placeholder="Gracz ${nr}" value="${nazwa}"
                               ${atrybutyInputa}>
                        ${moznaUsunac ? `<button type="button" class="wspolny-input usun-pole-gracza" style="${czyZablokowaneEdycja ? "opacity: 0.8;" : ""}" onclick="window.usunGraczaZeSlotu(${idx})">✖</button>` : ""}
                    </div>
                </label>
            `;
        });

        if (graczeUczestnicy.length < 4) {
            kontener.innerHTML += `
                <label style="display: flex; flex-direction: column; justify-content: flex-end;">
                    <h4>&nbsp;</h4>
                    <button type="button" class="wspolny-input btn-dodaj-kolejnego-gracza" onclick="window.otworzPopupDodajGracza('gracz-znajomi')">
                        + Dodaj gracza
                    </button>
                </label>
            `;
        }

        if (typeof onPlayersChangedCallback === "function") {
            onPlayersChangedCallback([...graczeUczestnicy]);
        }
    }

    window.zaktualizujNazweGracza = function(idx, nowaNazwa) {
        graczeUczestnicy[idx] = nowaNazwa;
        if (typeof onPlayersChangedCallback === "function") {
            onPlayersChangedCallback([...graczeUczestnicy]);
        }
    };

    window.usunGraczaZeSlotu = function(index) {
        if (graczeUczestnicy.length <= 1) return;
        const usunietyNick = graczeUczestnicy[index];
        if (usunietyNick && window.idZnajomychWGrze) {
            delete window.idZnajomychWGrze[usunietyNick];
            delete window.idZnajomychWGrze[usunietyNick.trim()];
            delete window.idZnajomychWGrze[usunietyNick.trim().toLowerCase()];
            try {
                localStorage.setItem("sd_id_znajomych_w_grze", JSON.stringify(window.idZnajomychWGrze));
            } catch (e) {}
        }
        graczeUczestnicy.splice(index, 1);
        renderujPolaUczestnikow();
    };

    window.otworzPopupDodajGracza = function(domyslnaZakladka = "gracz-znajomi") {
        upewnijSieZeModalIstnieje();
        const popup = document.getElementById("popup-dodaj-gracza");
        if (!popup) return;

        const inputGosc = document.getElementById("nazwa-gracza-popup");
        if (inputGosc) inputGosc.value = `Gracz ${graczeUczestnicy.length + 1}`;

        const czyZalogowany = !!zalogowanyNickGlobalny;
        const czyJuzWGrze = czyZalogowany && graczeUczestnicy.includes(zalogowanyNickGlobalny);

        if (!czyZalogowany && (domyslnaZakladka === "gracz-znajomi" || domyslnaZakladka === "gracz-ty")) {
            domyslnaZakladka = "gracz-gosc";
        }

        const divZalogowany = document.getElementById("gracz-ty-zalogowany");
        const divNiezalogowany = document.getElementById("gracz-ty-niezalogowany");
        const inputTy = document.getElementById("nazwa-gracza-ty");

        if (czyZalogowany) {
            if (divZalogowany) divZalogowany.style.display = "block";
            if (divNiezalogowany) divNiezalogowany.style.display = "none";
            if (inputTy) inputTy.value = zalogowanyNickGlobalny;
        } else {
            if (divZalogowany) divZalogowany.style.display = "none";
            if (divNiezalogowany) divNiezalogowany.style.display = "block";
        }

        const btnTy = document.querySelector('.btn-opcja-gracza[data-target="gracz-ty"]');
        if (btnTy) {
            const zablokujTy = !czyZalogowany || czyJuzWGrze;
            btnTy.style.opacity = zablokujTy ? "0.4" : "1";
            btnTy.style.cursor = zablokujTy ? "not-allowed" : "pointer";
        }

        const btnZnajomi = document.querySelector('.btn-opcja-gracza[data-target="gracz-znajomi"]');
        if (btnZnajomi) {
            btnZnajomi.style.opacity = czyZalogowany ? "1" : "0.4";
            btnZnajomi.style.cursor = czyZalogowany ? "pointer" : "not-allowed";
        }

        if (domyslnaZakladka === "gracz-znajomi") {
            pobierzZnajomychDoPopupu();
        }

        przelaczZakladkePopupu(domyslnaZakladka);
        popup.style.display = "flex";

        if (domyslnaZakladka === "gracz-gosc" && inputGosc) {
            inputGosc.focus();
            inputGosc.select();
        }
    };

    window.zamknijPopupDodajGracza = function() {
        const popup = document.getElementById("popup-dodaj-gracza");
        if (popup) popup.style.display = "none";
    };

    function przelaczZakladkePopupu(targetId) {
        document.querySelectorAll(".btn-opcja-gracza").forEach((b) => {
            b.classList.toggle("aktywna-opcja", b.getAttribute("data-target") === targetId);
        });
        document.querySelectorAll(".zakladka-dodaj-tresc").forEach((div) => {
            div.style.display = div.id === targetId ? "flex" : "none";
        });
    }

    function podepnijZakladkiPopupu() {
        document.querySelectorAll(".btn-opcja-gracza").forEach((btn) => {
            btn.onclick = () => {
                const target = btn.getAttribute("data-target");
                if (target === "gracz-ty" && zalogowanyNickGlobalny && graczeUczestnicy.includes(zalogowanyNickGlobalny)) {
                    alert("Jesteś już dodany do tej gry!");
                    return;
                }
                if ((target === "gracz-ty" || target === "gracz-znajomi") && !zalogowanyNickGlobalny) {
                    alert("Musisz być zalogowany, aby użyć tej opcji!");
                    return;
                }
                if (target === "gracz-znajomi") {
                    pobierzZnajomychDoPopupu();
                }
                przelaczZakladkePopupu(target);
            };
        });
    }

    window.zatwierdzDodanieGoscia = function() {
        if (graczeUczestnicy.length >= 4) return;
        const inputGosc = document.getElementById("nazwa-gracza-popup");
        graczeUczestnicy.push(inputGosc?.value.trim() || `Gracz ${graczeUczestnicy.length + 1}`);
        zamknijPopupDodajGracza();
        renderujPolaUczestnikow();
    };

    window.zatwierdzDodanieSiebie = function() {
        if (graczeUczestnicy.length >= 4) return;
        const nick = zalogowanyNickGlobalny || "Ja";
        if (graczeUczestnicy.some((g) => (g || "").toLowerCase() === nick.toLowerCase())) {
            alert("Jesteś już dodany do tej gry!");
            return;
        }
        graczeUczestnicy.push(nick);
        zamknijPopupDodajGracza();
        renderujPolaUczestnikow();
    };

    window.zatwierdzDodanieZnajomego = function(id, nick) {
        if (graczeUczestnicy.length >= 4) return;
        if (!nick) nick = "Znajomy";
        if (graczeUczestnicy.some((g) => (g || "").toLowerCase() === nick.toLowerCase())) return;

        graczeUczestnicy.push(nick);
        if (id) {
            window.idZnajomychWGrze[nick] = id;
            window.idZnajomychWGrze[nick.toLowerCase()] = id;
            try {
                localStorage.setItem("sd_id_znajomych_w_grze", JSON.stringify(window.idZnajomychWGrze));
            } catch (e) {}
        }
        zamknijPopupDodajGracza();
        renderujPolaUczestnikow();
    };

    async function pobierzZnajomychDoPopupu() {
        const kontener = document.getElementById("lista-znajomych-popup");
        if (!kontener) return;
        kontener.innerHTML = `<p style="color:#94a3b8; font-size: 14px; text-align: center;">Sprawdzam znajomych...</p>`;

        const supa = window.supabaseClient || window.supabaseKlient;
        if (!supa) {
            kontener.innerHTML = `<p style="color:#94a3b8; font-size: 14px; text-align: center;">Brak połączenia z bazą.</p>`;
            return;
        }

        try {
            let userId = zalogowanyUserIdGlobalny;
            if (!userId && supa.auth) {
                const { data } = await supa.auth.getSession();
                userId = data?.session?.user?.id;
            }
            if (!userId) {
                kontener.innerHTML = `<p style="color:#94a3b8; font-size: 14px; text-align: center;">Zaloguj się, aby zobaczyć znajomych.</p>`;
                return;
            }

            // Pobierz relacje zaakceptowane
            const { data: relacje } = await supa
                .from("znajomi")
                .select("zapraszajacy_id, zapraszany_id")
                .eq("status", "zaakceptowane")
                .or(`zapraszajacy_id.eq.${userId},zapraszany_id.eq.${userId}`);

            if (!relacje || !relacje.length) {
                kontener.innerHTML = `<p style="color:#94a3b8; font-size: 14px; text-align: center;">Nie masz jeszcze znajomych.</p>`;
                return;
            }

            const ids = relacje.map((r) => r.zapraszajacy_id === userId ? r.zapraszany_id : r.zapraszajacy_id);
            const { data: profiles } = await supa
                .from("profiles")
                .select("id, nazwa_gracza, avatar_url")
                .in("id", ids);

            if (!profiles || !profiles.length) {
                kontener.innerHTML = `<p style="color:#94a3b8; font-size: 14px; text-align: center;">Brak dostępnych profili.</p>`;
                return;
            }

            let html = '<div style="display:flex; flex-direction:column; gap:10px; max-height:260px; overflow-y:auto; padding-right:5px;">';
            profiles.forEach((p) => {
                const juzDodan = graczeUczestnicy.some((g) => (g || "").toLowerCase() === (p.nazwa_gracza || "").toLowerCase());
                const safeNick = (p.nazwa_gracza || "Gracz").replace(/'/g, "\\'");
                html += `
                    <div style="display:flex; align-items:center; justify-content:space-between; background:var(--primary-color-lighter); padding:10px; border-radius:8px; border:1px solid var(--primary-color-border);">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${p.avatar_url || "./loga/logo.png"}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;">
                            <strong style="color:white; font-size:14px;">${p.nazwa_gracza}</strong>
                        </div>
                        <button type="button" class="popup-btn popup-btn-yes" style="padding:8px 14px; max-width:90px; opacity:${juzDodan ? "0.4" : "1"}; cursor:${juzDodan ? "not-allowed" : "pointer"}" 
                                onclick="${juzDodan ? "" : `zatwierdzDodanieZnajomego('${p.id}', '${safeNick}')`}">
                            ${juzDodan ? "Dodano" : "Dodaj"}
                        </button>
                    </div>
                `;
            });
            html += "</div>";
            kontener.innerHTML = html;
        } catch (e) {
            kontener.innerHTML = `<p style="color:#f87171; font-size: 14px; text-align: center;">Błąd: ${e.message}</p>`;
        }
    }

    async function inicjalizujUzytkownika() {
        const u = odczytajZalogowanegoZStorage();
        if (u) {
            zalogowanyNickGlobalny = u.nick;
            zalogowanyUserIdGlobalny = u.id;
            if (graczeUczestnicy[0] === "Gracz 1") {
                graczeUczestnicy[0] = u.nick;
            }
        }

        const supa = window.supabaseClient || window.supabaseKlient;
        if (supa?.auth) {
            try {
                const { data } = await supa.auth.getSession();
                const sessionUser = data?.session?.user;
                if (sessionUser) {
                    zalogowanyUserIdGlobalny = sessionUser.id;
                    const nick = sessionUser.user_metadata?.username || sessionUser.user_metadata?.nazwa_gracza || (sessionUser.email ? sessionUser.email.split("@")[0] : "");
                    if (nick) {
                        zalogowanyNickGlobalny = nick;
                        if (graczeUczestnicy[0] === "Gracz 1") {
                            graczeUczestnicy[0] = nick;
                        }
                    }
                }
            } catch (e) {}
        }

        renderujPolaUczestnikow();
    }

    window.PlayerSetupModule = {
        init(options = {}) {
            if (options.onPlayersChanged) {
                onPlayersChangedCallback = options.onPlayersChanged;
            }
            upewnijSieZeModalIstnieje();
            inicjalizujUzytkownika();
        },
        getPlayers() {
            return [...graczeUczestnicy];
        },
        setPlayers(arr) {
            if (Array.isArray(arr) && arr.length > 0) {
                graczeUczestnicy = [...arr];
                renderujPolaUczestnikow();
            }
        }
    };
})(window);

