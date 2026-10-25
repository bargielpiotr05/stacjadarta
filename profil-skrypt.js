(() => {
        // ==============================================================================
        // 1. POŁĄCZENIE Z SUPABASE I STRUKTURA DANYCH STATYSTYK
        // ==============================================================================
        const SUPA_URL = "https://mjebhhagwxtvhggyjwue.supabase.co";
        const SUPA_KEY = "sb_publishable_1n3SqWhrrIzojpyFgnmaTw_a1pfzi5R";

        let client = window.supabaseKlient || window.supabaseClient || null;
        let supaClient = client;
        if (!client && window.supabase && typeof window.supabase.createClient === "function") {
            client = window.supabase.createClient(SUPA_URL, SUPA_KEY);
            supaClient = client;
        }

        let aktualnyUser = null;
        let aktualnyProfil = null;
        let ostatnieMeczeCache = [];
        let pelnaHistoriaMeczowCache = null;
        let czyWszystkieMeczeRozwiniete = false;
        let pelnyRankingDoublesCache = [];
        let czyRankingDoublesRozwiniety = false;
        let pelnyRankingAroundCache = [];
        let czyRankingAroundRozwiniety = false;
        let pelnyRankingShanghaiCache = [];
        let czyRankingShanghaiRozwiniety = false;

        function odczytajZalogowanegoZStorage() {
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const klucz = localStorage.key(i);
                    if (klucz && ((klucz.startsWith("sb-") && klucz.endsWith("-auth-token")) || klucz === "supabase.auth.token")) {
                        const raw = localStorage.getItem(klucz);
                        if (raw) {
                            const parsed = JSON.parse(raw);
                            if (parsed?.user) return parsed.user;
                        }
                    }
                }
            } catch (e) {}
            return null;
        }

        function pobierzSesjeZStorage() {
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const klucz = localStorage.key(i);
                    if (klucz && ((klucz.startsWith("sb-") && klucz.includes("-auth-token")) || klucz === "supabase.auth.token")) {
                        const raw = localStorage.getItem(klucz);
                        if (raw) {
                            const parsed = JSON.parse(raw);
                            if (parsed?.access_token) {
                                return {
                                    token: parsed.access_token,
                                    user: parsed.user || null,
                                    expiresAt: parsed.expires_at || 0,
                                };
                            }
                        }
                    }
                }
            } catch (e) {}
            return { token: null, user: null, expiresAt: 0 };
        }

        let DANE_STATYSTYK = {
            klasyczna: {
                mecze: 0,
                srednia: 0,
                srednia_9: 0,
                wygrane: 0,
                ilosc_180: 0,
                najwyzszy_checkout: 0,
                historia_meczow: [],
            },
            shanghai: {
                mecze: 0,
                wygrane: 0,
                suma_punktow: 0,
                rekord_punktow: 0,
                srednia_na_gre: 0,
                liczba_shanghai: 0,
                suma_rzutow: 0,
                suma_trafien: 0,
                skutecznosc: 0,
                rundy: {},
                historia_meczow: [],
            },
            around_the_world: {
                mecze: 0,
                wygrane: 0,
                skutecznosc: 0,
                suma_rzutow: 0,
                suma_trafien: 0,
                rekord_najmniej_lotek: null,
                sektory: {},
                historia_meczow: [],
            },
            checkout_121: {
                sukcesy: 0,
                podejscia: 0,
                max_poziom: 121,
                najlepsza_seria: 0,
                historia_meczow: [],
            },
            doubles: {
                mecze: 0,
                wygrane: 0,
                skutecznosc: 0,
                suma_rzutow: 0,
                suma_trafien: 0,
                sektory: {},
                historia_meczow: [],
            },
            sprzet: {
                barele: "-",
                shafty: "-",
                groty: "-",
                tarcza: "-",
                auto_score: "-",
                druzyna: "-",
            },
        };

        const sekwencjaTarczy = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

        // Formatowanie skuteczności: np. "50% (13/26)"
        function formatujSkutecznosc(trafienia, rzuty, procentWprost = null) {
            const t = Number(trafienia) || 0;
            const r = Number(rzuty) || 0;
            if (r > 0) {
                const proc = (t / r) * 100;
                const procStr = Number.isInteger(proc) ? proc : proc.toFixed(1);
                return `${procStr}% (${t}/${r})`;
            }
            if (procentWprost !== null && procentWprost !== undefined && Number(procentWprost) > 0) {
                const p = Number(procentWprost);
                const pStr = Number.isInteger(p) ? p : p.toFixed(1);
                return t > 0 ? `${pStr}% (${t} traf.)` : `${pStr}%`;
            }
            if (t > 0) {
                return `${t} trafień`;
            }
            return "0% (0/0)";
        }

        // ==============================================================================
        // 2. GENEROWANIE SIATEK SVG DLA TARCZY DARTA
        // ==============================================================================
        function generujSiatkeDlaSvg(svgElement, prefiks = "") {
            if (!svgElement) return;

            const R_DOUBLE_OUT = 37.3;
            const R_DOUBLE_IN = 3.0;
            const R_BULL = 3.0;

            const polar = (radius, angle) => {
                const rad = ((angle - 90) * Math.PI) / 180;
                return { x: 50 + radius * Math.cos(rad), y: 50 + radius * Math.sin(rad) };
            };

            const SVG_NS = "http://www.w3.org/2000/svg";
            svgElement.innerHTML = "";

            sekwencjaTarczy.forEach((liczba, index) => {
                const startKat = index * 18 - 9;
                const koniecKat = startKat + 18;
                const p1 = polar(R_DOUBLE_OUT, koniecKat);
                const p2 = polar(R_DOUBLE_OUT, startKat);
                const p3 = polar(R_DOUBLE_IN, koniecKat);
                const p4 = polar(R_DOUBLE_IN, startKat);
                const duzyLuk = koniecKat - startKat <= 180 ? "0" : "1";
                const d = `M ${p1.x} ${p1.y} A ${R_DOUBLE_OUT} ${R_DOUBLE_OUT} 0 ${duzyLuk} 0 ${p2.x} ${p2.y} L ${p4.x} ${p4.y} A ${R_DOUBLE_IN} ${R_DOUBLE_IN} 0 ${duzyLuk} 1 ${p3.x} ${p3.y} Z`;

                const path = document.createElementNS(SVG_NS, "path");
                path.setAttribute("id", `${prefiks}${liczba}`);
                path.setAttribute("d", d);
                path.setAttribute("fill", "transparent");
                path.setAttribute("stroke", "transparent");
                path.setAttribute("stroke-width", "0.1");
                svgElement.appendChild(path);
            });

            // Środek tarczy (Bullseye)
            const circle = document.createElementNS(SVG_NS, "circle");
            circle.setAttribute("id", `${prefiks}innerbull`);
            circle.setAttribute("cx", "50");
            circle.setAttribute("cy", "50");
            circle.setAttribute("r", String(R_BULL));
            circle.setAttribute("fill", "transparent");
            circle.setAttribute("stroke", "transparent");
            circle.setAttribute("stroke-width", "0.1");
            svgElement.appendChild(circle);
        }

        // ==============================================================================
        // 3. WSPÓLNA OBSŁUGA INTERAKCJI (TOOLTIP, BANER MOBILNY, KLIKNIĘCIE, DOTYK)
        // ==============================================================================
        let aktywnyWybor = { el: null, infoBoxId: null, defaultText: "" };

        function odznaczWybranySektor() {
            if (aktywnyWybor.el) {
                aktywnyWybor.el.setAttribute("stroke", "transparent");
                aktywnyWybor.el.setAttribute("stroke-width", "0.1");
            }
            const tooltip = document.getElementById("heatmap-tooltip");
            if (tooltip) tooltip.style.display = "none";

            if (aktywnyWybor.infoBoxId) {
                const box = document.getElementById(aktywnyWybor.infoBoxId);
                if (box) {
                    box.classList.remove("aktywny");
                    box.innerHTML = `<span>${aktywnyWybor.defaultText}</span>`;
                }
            }
            aktywnyWybor = { el: null, infoBoxId: null, defaultText: "" };
        }

        let ostatniCzasKliknieciaSektora = 0;

        // Bezpieczne sprawdzenie czy element należy do tarczy, dymka lub paska info (kompatybilne z iOS Safari SVG)
        function czyElementWewnatrzTarczy(target) {
            if (!target) return false;
            if (aktywnyWybor.el && target === aktywnyWybor.el) return true;
            // 1. Sprawdzenie przez standardowe closest (jeśli wspierane w danej wersji przeglądarki)
            if (typeof target.closest === "function") {
                try {
                    if (
                        target.closest(".tarcza-ramka") ||
                        target.closest("svg") ||
                        target.closest(".wybrany-sektor-info") ||
                        target.closest("#heatmap-tooltip")
                    ) {
                        return true;
                    }
                } catch (_) {}
            }
            // 2. Bezpieczny fallback dla iOS Safari (przechodzenie po drzewie węzłów dla SVG)
            let curr = target;
            while (curr && curr !== document && curr !== document.body) {
                if (aktywnyWybor.el && curr === aktywnyWybor.el) return true;
                const tag = (curr.tagName || "").toLowerCase();
                if (tag === "svg" || tag === "path" || tag === "circle") return true;
                const cls = (typeof curr.className === "string") ? curr.className : (curr.getAttribute ? curr.getAttribute("class") || "" : "");
                if (cls.includes("tarcza-ramka") || cls.includes("wybrany-sektor-info") || cls.includes("heatmap-tooltip")) {
                    return true;
                }
                if (curr.id === "heatmap-tooltip" || (curr.id && curr.id.includes("wybrany-sektor-info"))) {
                    return true;
                }
                curr = curr.parentElement || curr.parentNode;
            }
            return false;
        }

        function ustawWybranySektor(el, infoBoxId, defaultText, tooltipHtml, banerHtml, x, y) {
            const tooltip = document.getElementById("heatmap-tooltip");
            const infoBox = document.getElementById(infoBoxId);
            const teraz = Date.now();

            // Powtórne kliknięcie / dotknięcie tego samego sektora:
            // Jeśli to kolejne zdarzenie tego samego gestu (np. touchstart + click w ciągu 450ms), ignorujemy powtórkę
            if (aktywnyWybor.el === el) {
                if (teraz - ostatniCzasKliknieciaSektora < 450) {
                    return;
                }
                odznaczWybranySektor();
                ostatniCzasKliknieciaSektora = teraz;
                return;
            }

            ostatniCzasKliknieciaSektora = teraz;
            odznaczWybranySektor();

            aktywnyWybor = { el, infoBoxId, defaultText };
            el.setAttribute("stroke", "rgba(255, 255, 255, 0.95)");
            el.setAttribute("stroke-width", "0.8");

            if (!x || !y) {
                const rect = el.getBoundingClientRect();
                x = rect.left + rect.width / 2;
                y = rect.top + rect.height / 2;
            }

            if (tooltip) {
                tooltip.style.display = "block";
                tooltip.innerHTML = tooltipHtml;
                const clampedX = Math.max(70, Math.min(window.innerWidth - 70, x));
                tooltip.style.left = clampedX + "px";
                tooltip.style.top = Math.max(40, y) + "px";
            }

            if (infoBox) {
                infoBox.classList.add("aktywny");
                infoBox.innerHTML = `<span>${banerHtml}</span>`;
            }
        }

        function pokazTooltipLokalny(html, x, y) {
            const tooltip = document.getElementById("heatmap-tooltip");
            if (!tooltip) return;
            tooltip.style.display = "block";
            tooltip.innerHTML = html;
            const clampedX = Math.max(70, Math.min(window.innerWidth - 70, x));
            tooltip.style.left = clampedX + "px";
            tooltip.style.top = Math.max(40, y) + "px";
        }

        function podlaczInterakcjeSektora(el, infoBoxId, defaultText, tooltipHtml, banerHtml) {
            if (!el) return;

            // Zawsze zapisujemy najświeższe dane dla elementu SVG
            el._heatmapData = {
                infoBoxId,
                defaultText,
                tooltipHtml,
                banerHtml,
            };

            // Jeśli dany sektor jest w tej chwili zaznaczony, od razu odświeżamy baner najnowszymi danymi
            if (aktywnyWybor.el === el) {
                const infoBox = document.getElementById(infoBoxId);
                if (infoBox) {
                    infoBox.classList.add("aktywny");
                    infoBox.innerHTML = `<span>${banerHtml}</span>`;
                }
                const tooltip = document.getElementById("heatmap-tooltip");
                if (tooltip && tooltip.style.display !== "none") {
                    tooltip.innerHTML = tooltipHtml;
                }
            }

            // Zapobiegamy duplikowaniu nasłuchiwaczy zdarzeń przy ponownych renderach danych
            if (el._interakcjaPodlaczona) return;
            el._interakcjaPodlaczona = true;

            let ostatnieTapniecie = 0;

            const aktywuj = (e) => {
                if (e && typeof e.stopPropagation === "function") {
                    e.stopPropagation();
                }
                const teraz = Date.now();
                if (teraz - ostatnieTapniecie < 350) return;
                ostatnieTapniecie = teraz;

                const data = el._heatmapData;
                if (!data) return;

                let cx = null;
                let cy = null;
                if (e?.touches && e.touches[0]) {
                    cx = e.touches[0].clientX;
                    cy = e.touches[0].clientY;
                } else if (e?.changedTouches && e.changedTouches[0]) {
                    cx = e.changedTouches[0].clientX;
                    cy = e.changedTouches[0].clientY;
                } else if (e?.clientX) {
                    cx = e.clientX;
                    cy = e.clientY;
                }
                ustawWybranySektor(el, data.infoBoxId, data.defaultText, data.tooltipHtml, data.banerHtml, cx, cy);
            };

            // Touch events dla iPhone / iPad (iOS Safari)
            el.addEventListener("touchstart", (e) => {
                aktywuj(e);
            }, { passive: true });

            // Pointerdown dla nowoczesnych ekranów dotykowych
            el.addEventListener("pointerdown", (e) => {
                if (e.pointerType === "touch" || e.pointerType === "pen") {
                    aktywuj(e);
                }
            }, { passive: true });

            // Standardowy click (PC / myszka)
            el.addEventListener("click", (e) => {
                aktywuj(e);
            });

            // Obsługa hover tylko dla urządzeń ze wskaźnikiem myszy (nie telefony)
            el.addEventListener("mouseenter", (e) => {
                if (window.matchMedia && window.matchMedia("(hover: none)").matches) return;
                if (aktywnyWybor.el !== el) {
                    el.setAttribute("stroke", "rgba(255, 255, 255, 0.85)");
                    el.setAttribute("stroke-width", "0.6");
                }
                if (el._heatmapData) {
                    pokazTooltipLokalny(el._heatmapData.tooltipHtml, e.clientX, e.clientY);
                }
            });

            el.addEventListener("mousemove", (e) => {
                if (window.matchMedia && window.matchMedia("(hover: none)").matches) return;
                if (el._heatmapData) {
                    pokazTooltipLokalny(el._heatmapData.tooltipHtml, e.clientX, e.clientY);
                }
            });

            el.addEventListener("mouseleave", () => {
                if (aktywnyWybor.el === el) return;
                if (window.matchMedia && window.matchMedia("(hover: none)").matches) return;
                if (aktywnyWybor.el !== el) {
                    el.setAttribute("stroke", "transparent");
                    el.setAttribute("stroke-width", "0.1");
                }
                if (!aktywnyWybor.el) {
                    const tooltip = document.getElementById("heatmap-tooltip");
                    if (tooltip) tooltip.style.display = "none";
                }
            });
        }

        // Bezpieczne odznaczanie po kliknięciu/tapnięciu poza tarczą i dymkiem
        const usunZaznaczenieGdyPoza = (e) => {
            if (!aktywnyWybor.el) return;
            // Zapobiega natychmiastowemu zgaszeniu przez touchend/click z tego samego tapnięcia
            if (Date.now() - ostatniCzasKliknieciaSektora < 500) return;

            const target = e.target;
            if (czyElementWewnatrzTarczy(target)) {
                return;
            }
            odznaczWybranySektor();
        };

        document.addEventListener("click", usunZaznaczenieGdyPoza);

        // ==============================================================================
        // 4. RENDERY HEATMAP DLA POSZCZEGÓLNYCH TRYBÓW
        // ==============================================================================

        // --- 4A. DOUBLES HEATMAP ---
        function odswiezHeatmapeDoubles(daneDoubles) {
            const svg = document.getElementById("dartboard-heatmap");
            if (!svg) return;

            const sektory = daneDoubles.sektory || {};
            const elementy = svg.querySelectorAll("path, circle");
            const infoBoxId = "wybrany-sektor-info";
            const defaultText = "Dotknij lub kliknij sektor na tarczy, aby sprawdzić skuteczność";

            let maxProc = -1,
                minProc = 101,
                maxNazwa = "-",
                minNazwa = "-";
            let maxTraf = 0,
                maxRzut = 0,
                minTraf = 0,
                minRzut = 0;
            let maRzuty = false;

            elementy.forEach((el) => {
                const rawId = el.id.replace(/^d/, "");
                const daneSektora = sektory[rawId] || sektory[String(rawId)] || sektory[`d${rawId}`] || null;

                const rzuty = daneSektora && typeof daneSektora === "object" ? Number(daneSektora.rzuty) || 0 : 0;
                const traf = daneSektora && typeof daneSektora === "object" ? Number(daneSektora.trafienia) || 0 : Number(daneSektora) || 0;
                const proc = rzuty > 0 ? (traf / rzuty) * 100 : daneSektora && typeof daneSektora === "object" ? Number(daneSektora.procent) || 0 : Number(daneSektora) || 0;

                const nazwa = rawId === "innerbull" ? "Inner Bull (D25)" : `Double ${rawId}`;
                const tekstSkut = formatujSkutecznosc(traf, rzuty, proc);

                if (rzuty > 0) {
                    maRzuty = true;
                    if (proc > maxProc) {
                        maxProc = proc;
                        maxNazwa = nazwa;
                        maxTraf = traf;
                        maxRzut = rzuty;
                    }
                    if (proc < minProc) {
                        minProc = proc;
                        minNazwa = nazwa;
                        minTraf = traf;
                        minRzut = rzuty;
                    }
                }

                // Cień: 0% = 0.85 (ciemno), 100% = 0 (czysta tarcza)
                const alpha = (0.85 * (1 - proc / 100)).toFixed(2);
                el.setAttribute("fill", Number(alpha) > 0 ? `rgba(0, 0, 0, ${alpha})` : "transparent");
                el.setAttribute("class", proc >= 75 ? "sektor-odkryty" : "sektor-zacieniony");

                const tooltipHtml = `
                    <span style="color:#94a3b8; font-size:11px; display:block; margin-bottom:2px;">SEKTOR DOUBLE</span>
                    <span style="color:var(--secondary-color); font-size:14px; font-weight:700;">${nazwa}</span>: 
                    <strong style="color:#ffffff; font-size:14px;">${tekstSkut}</strong>
                `;
                const banerHtml = `<strong>${nazwa}</strong> — Skuteczność: <strong style="font-size:15px;">${tekstSkut}</strong>`;

                podlaczInterakcjeSektora(el, infoBoxId, defaultText, tooltipHtml, banerHtml);
            });

            const chipNajlepszy = document.getElementById("chip-najlepszy");
            const chipNajnizszy = document.getElementById("chip-najnizszy");
            const chipSrednia = document.getElementById("chip-srednia");

            if (chipNajlepszy) chipNajlepszy.textContent = maRzuty && maxProc >= 0 ? `${maxNazwa}: ${formatujSkutecznosc(maxTraf, maxRzut)}` : "-";
            if (chipNajnizszy) chipNajnizszy.textContent = maRzuty && minProc <= 100 ? `${minNazwa}: ${formatujSkutecznosc(minTraf, minRzut)}` : "-";
            if (chipSrednia) chipSrednia.textContent = formatujSkutecznosc(daneDoubles.suma_trafien, daneDoubles.suma_rzutow);

            // Aktualizacja widoku rankingowego (listy)
            odswiezRankingListeDoubles(daneDoubles);
        }

        function renderujRankingListeDoubles(lista) {
            const kontener = document.getElementById("doubles-ranking-lista");
            if (!kontener) return;

            let html = "";
            lista.forEach((item, index) => {
                const pozycja = item.oryginalnaPozycja !== undefined ? item.oryginalnaPozycja : index + 1;
                const topKlasa = pozycja === 1 ? "top-1" : pozycja === 2 ? "top-2" : pozycja === 3 ? "top-3" : "";
                const szerokoscPaska = Math.max(0, Math.min(100, item.procent));

                html += `
                    <div class="ranking-item ${topKlasa}">
                        <div class="ranking-pozycja">#${pozycja}</div>
                        <div class="ranking-info">
                            <div class="ranking-nazwa-row">
                                <span class="ranking-nazwa">${item.nazwa}</span>
                                <span class="ranking-wynik">${item.tekstSkut}</span>
                            </div>
                            <div class="ranking-pasek-tlo">
                                <div class="ranking-pasek-wypelnienie" style="width: ${szerokoscPaska}%;"></div>
                            </div>
                        </div>
                    </div>
                `;
            });

            kontener.innerHTML = html;
        }

        // --- 4A-bis. RANKING LISTA DOUBLES (POSORTOWANA MALEJĄCO) ---
        function odswiezRankingListeDoubles(daneDoubles) {
            const kontener = document.getElementById("doubles-ranking-lista");
            if (!kontener) return;

            const sektory = daneDoubles.sektory || {};
            const cele = [];
            for (let i = 1; i <= 20; i++) {
                cele.push(String(i));
            }
            cele.push("innerbull");

            const lista = cele.map((rawId) => {
                const daneSektora = sektory[rawId] || sektory[`d${rawId}`] || null;
                const rzuty = daneSektora && typeof daneSektora === "object" ? Number(daneSektora.rzuty) || 0 : 0;
                const traf = daneSektora && typeof daneSektora === "object" ? Number(daneSektora.trafienia) || 0 : Number(daneSektora) || 0;
                const proc = rzuty > 0 ? (traf / rzuty) * 100 : daneSektora && typeof daneSektora === "object" ? Number(daneSektora.procent) || 0 : Number(daneSektora) || 0;
                const nazwa = rawId === "innerbull" ? "Inner Bull (D25)" : `Double ${rawId}`;

                return {
                    id: rawId,
                    nazwa,
                    rzuty,
                    trafienia: traf,
                    procent: proc,
                    tekstSkut: formatujSkutecznosc(traf, rzuty),
                };
            });

            // Sortowanie malejąco:
            // 1. Procent trafień
            // 2. Liczba trafień
            // 3. Liczba rzutów
            // 4. Numer sektora
            lista.sort((a, b) => {
                if (b.procent !== a.procent) return b.procent - a.procent;
                if (b.trafienia !== a.trafienia) return b.trafienia - a.trafienia;
                if (b.rzuty !== a.rzuty) return b.rzuty - a.rzuty;
                const idA = a.id === "innerbull" ? 25 : Number(a.id) || 0;
                const idB = b.id === "innerbull" ? 25 : Number(b.id) || 0;
                return idA - idB;
            });

            lista.forEach((item, idx) => {
                item.oryginalnaPozycja = idx + 1;
            });

            pelnyRankingDoublesCache = lista;

            const kontenerWiecej = document.getElementById("kontener-wiecej-doubles");
            const btnWiecej = document.getElementById("btn-zobacz-wszystkie-doubles");
            if (kontenerWiecej && btnWiecej) {
                if (lista.length > 5) {
                    kontenerWiecej.style.display = "block";
                    btnWiecej.textContent = czyRankingDoublesRozwiniety ? "Zwiń" : "Zobacz wszystkie";
                    btnWiecej.onclick = () => {
                        czyRankingDoublesRozwiniety = !czyRankingDoublesRozwiniety;
                        btnWiecej.textContent = czyRankingDoublesRozwiniety ? "Zwiń" : "Zobacz wszystkie";
                        const doPokazania = czyRankingDoublesRozwiniety ? pelnyRankingDoublesCache : pelnyRankingDoublesCache.slice(0, 5);
                        renderujRankingListeDoubles(doPokazania);
                    };
                } else {
                    kontenerWiecej.style.display = "none";
                }
            }

            const doPokazania = czyRankingDoublesRozwiniety ? lista : lista.slice(0, 5);
            renderujRankingListeDoubles(doPokazania);
        }

        function renderujRankingListeAround(lista) {
            const kontener = document.getElementById("around-ranking-lista");
            if (!kontener) return;

            let html = "";
            lista.forEach((item, index) => {
                const pozycja = item.oryginalnaPozycja !== undefined ? item.oryginalnaPozycja : index + 1;
                const topKlasa = pozycja === 1 ? "top-1" : pozycja === 2 ? "top-2" : pozycja === 3 ? "top-3" : "";
                const szerokoscPaska = Math.max(0, Math.min(100, item.procent));

                html += `
                    <div class="ranking-item ${topKlasa}">
                        <div class="ranking-pozycja">#${pozycja}</div>
                        <div class="ranking-info">
                            <div class="ranking-nazwa-row">
                                <span class="ranking-nazwa">${item.nazwa}</span>
                                <span class="ranking-wynik">${item.tekstSkut}</span>
                            </div>
                            <div class="ranking-detale">
                                <span class="ranking-detal-tag">single: ${item.single}</span>
                                <span class="ranking-detal-tag">double: ${item.double}</span>
                                <span class="ranking-detal-tag">triple: ${item.triple}</span>
                            </div>
                            <div class="ranking-pasek-tlo">
                                <div class="ranking-pasek-wypelnienie" style="width: ${szerokoscPaska}%;"></div>
                            </div>
                        </div>
                    </div>
                `;
            });

            kontener.innerHTML = html;
        }

        // --- 4A-ter. RANKING LISTA AROUND THE WORLD (Z ROZBICIEM SINGLE, DOUBLE, TRIPLE) ---
        function odswiezRankingListeAround(daneAround) {
            const kontener = document.getElementById("around-ranking-lista");
            if (!kontener) return;

            const sektory = daneAround.sektory || {};
            const cele = [];
            for (let i = 1; i <= 20; i++) {
                cele.push(String(i));
            }
            cele.push("innerbull");

            const lista = cele.map((rawId) => {
                const daneSektora = sektory[rawId] || null;
                const rzuty = daneSektora && typeof daneSektora === "object" ? Number(daneSektora.rzuty) || 0 : 0;
                const traf = daneSektora && typeof daneSektora === "object" ? Number(daneSektora.trafienia) || 0 : Number(daneSektora) || 0;
                const proc = rzuty > 0 ? (traf / rzuty) * 100 : traf > 0 ? 100 : 0;

                const single = daneSektora && typeof daneSektora === "object" && daneSektora.single !== undefined ? Number(daneSektora.single) || 0 : traf;
                const double = daneSektora && typeof daneSektora === "object" && daneSektora.double !== undefined ? Number(daneSektora.double) || 0 : 0;
                const triple = daneSektora && typeof daneSektora === "object" && daneSektora.triple !== undefined ? Number(daneSektora.triple) || 0 : 0;

                const nazwa = rawId === "innerbull" ? "Bullseye (25/50)" : `Sektor ${rawId}`;

                return {
                    id: rawId,
                    nazwa,
                    rzuty,
                    trafienia: traf,
                    single,
                    double,
                    triple,
                    procent: proc,
                    tekstSkut: formatujSkutecznosc(traf, rzuty),
                };
            });

            // Sortowanie:
            // 1. Procent trafień
            // 2. Liczba trafień
            // 3. Mniej rzutów (wyższa efektywność)
            // 4. Numer sektora
            lista.sort((a, b) => {
                if (b.procent !== a.procent) return b.procent - a.procent;
                if (b.trafienia !== a.trafienia) return b.trafienia - a.trafienia;
                if (a.rzuty !== b.rzuty) return a.rzuty - b.rzuty;
                const idA = a.id === "innerbull" ? 25 : Number(a.id) || 0;
                const idB = b.id === "innerbull" ? 25 : Number(b.id) || 0;
                return idA - idB;
            });

            lista.forEach((item, idx) => {
                item.oryginalnaPozycja = idx + 1;
            });

            pelnyRankingAroundCache = lista;

            const kontenerWiecej = document.getElementById("kontener-wiecej-around");
            const btnWiecej = document.getElementById("btn-zobacz-wszystkie-around");
            if (kontenerWiecej && btnWiecej) {
                if (lista.length > 5) {
                    kontenerWiecej.style.display = "block";
                    btnWiecej.textContent = czyRankingAroundRozwiniety ? "Zwiń" : "Zobacz wszystkie";
                    btnWiecej.onclick = () => {
                        czyRankingAroundRozwiniety = !czyRankingAroundRozwiniety;
                        btnWiecej.textContent = czyRankingAroundRozwiniety ? "Zwiń" : "Zobacz wszystkie";
                        const doPokazania = czyRankingAroundRozwiniety ? pelnyRankingAroundCache : pelnyRankingAroundCache.slice(0, 5);
                        renderujRankingListeAround(doPokazania);
                    };
                } else {
                    kontenerWiecej.style.display = "none";
                }
            }

            const doPokazania = czyRankingAroundRozwiniety ? lista : lista.slice(0, 5);
            renderujRankingListeAround(doPokazania);
        }
        function odswiezHeatmapeAround(daneATW) {
            const svg = document.getElementById("dartboard-heatmap-around");
            if (!svg) return;

            const sektory = daneATW.sektory || {};
            const elementy = svg.querySelectorAll("path, circle");
            const infoBoxId = "wybrany-sektor-info-around";
            const defaultText = "Dotknij lub kliknij sektor na tarczy, aby sprawdzić skuteczność";

            let maxProc = -1,
                minProc = 101,
                najNazwa = "-",
                mniejNazwa = "-";
            let maxTraf = 0,
                maxRzut = 0,
                minTraf = 0,
                minRzut = 0;
            let maRzuty = false;

            elementy.forEach((el) => {
                const rawId = el.id.replace(/^atw_/, "");
                const daneSektora = sektory[rawId] || sektory[String(rawId)] || sektory[`atw_${rawId}`] || null;

                const rzuty = daneSektora && typeof daneSektora === "object" ? Number(daneSektora.rzuty) || 0 : daneSektora > 0 ? Number(daneSektora) : 0;
                const traf = daneSektora && typeof daneSektora === "object" ? Number(daneSektora.trafienia) || 0 : Number(daneSektora) || 0;
                const proc = rzuty > 0 ? (traf / rzuty) * 100 : traf > 0 ? 100 : (daneSektora && typeof daneSektora === "object" ? Number(daneSektora.procent) || 0 : 0);

                const nazwa = rawId === "innerbull" ? "Bullseye (25/50)" : `Sektor ${rawId}`;
                const tekstSkut = formatujSkutecznosc(traf, rzuty, proc);

                if (rzuty > 0) {
                    maRzuty = true;
                    if (proc > maxProc) {
                        maxProc = proc;
                        najNazwa = nazwa;
                        maxTraf = traf;
                        maxRzut = rzuty;
                    }
                    if (proc < minProc) {
                        minProc = proc;
                        mniejNazwa = nazwa;
                        minTraf = traf;
                        minRzut = rzuty;
                    }
                }

                // Cień: 0% = 0.85 (ciemno), 100% = 0 (czysta tarcza)
                const alpha = (0.85 * (1 - proc / 100)).toFixed(2);
                el.setAttribute("fill", Number(alpha) > 0 ? `rgba(0, 0, 0, ${alpha})` : "transparent");
                el.setAttribute("class", proc >= 75 ? "sektor-odkryty" : "sektor-zacieniony");

                const tooltipHtml = `
                    <span style="color:#94a3b8; font-size:11px; display:block; margin-bottom:2px;">AROUND THE WORLD</span>
                    <span style="color:var(--secondary-color); font-size:14px; font-weight:700;">${nazwa}</span>: 
                    <strong style="color:#ffffff; font-size:14px;">${tekstSkut}</strong>
                `;
                const banerHtml = `<strong>${nazwa}</strong> — Skuteczność: <strong style="font-size:15px;">${tekstSkut}</strong>`;

                podlaczInterakcjeSektora(el, infoBoxId, defaultText, tooltipHtml, banerHtml);
            });

            const chipNajwiecej = document.getElementById("chip-around-najwiecej");
            const chipNajmniej = document.getElementById("chip-around-najmniej");
            const chipSuma = document.getElementById("chip-around-suma");

            if (chipNajwiecej) chipNajwiecej.textContent = maRzuty && maxProc >= 0 ? `${najNazwa}: ${formatujSkutecznosc(maxTraf, maxRzut)}` : "-";
            if (chipNajmniej) chipNajmniej.textContent = maRzuty && minProc <= 100 ? `${mniejNazwa}: ${formatujSkutecznosc(minTraf, minRzut)}` : "-";
            if (chipSuma) chipSuma.textContent = formatujSkutecznosc(daneATW.suma_trafien, daneATW.suma_rzutow);
        }

        // --- 4C. SHANGHAI HEATMAP ---
        function odswiezHeatmapeShanghai(daneShanghai) {
            const svg = document.getElementById("dartboard-heatmap-shanghai");
            if (!svg) return;

            const rundy = daneShanghai.rundy || daneShanghai.sektory || {};
            const elementy = svg.querySelectorAll("path, circle");
            const infoBoxId = "wybrany-sektor-info-shanghai";
            const defaultText = "Dotknij lub kliknij sektor na tarczy, aby sprawdzić statystyki rundy";

            let maxPunkty = 1;
            elementy.forEach((el) => {
                const rawId = el.id.replace(/^sh_/, "");
                const rDane = rundy[rawId];
                if (rDane && Number(rDane.punkty) > maxPunkty) {
                    maxPunkty = Number(rDane.punkty);
                }
            });

            elementy.forEach((el) => {
                const rawId = el.id.replace(/^sh_/, "");
                const rDane = rundy[rawId] || rundy[String(rawId)] || rundy[`sh_${rawId}`] || { punkty: 0, rzuty: 0, trafienia: 0, single: 0, double: 0, triple: 0, shanghai: false };
                const punkty = Number(rDane.punkty) || 0;
                const rzuty = Number(rDane.rzuty) || ((rDane.single || 0) + (rDane.double || 0) + (rDane.triple || 0) > 0 ? 3 : 0);
                const traf = Number(rDane.trafienia) || (rDane.single || 0) + (rDane.double || 0) + (rDane.triple || 0);
                const czyShanghai = Boolean(rDane.shanghai);
                const procSh = rzuty > 0 ? (traf / rzuty) * 100 : (punkty > 0 ? 100 : 0);
                const tekstSkut = formatujSkutecznosc(traf, rzuty, procSh);

                // Kontrast cienia bazujący na zdobytych punktach
                const alpha = (0.85 * (1 - punkty / maxPunkty)).toFixed(2);
                el.setAttribute("fill", Number(alpha) > 0 ? `rgba(0, 0, 0, ${alpha})` : "transparent");
                el.setAttribute("class", punkty > 0 ? "sektor-odkryty" : "sektor-zacieniony");
                el.setAttribute("stroke", "transparent");
                el.setAttribute("stroke-width", "0.1");

                const nazwa = rawId === "innerbull" ? "Bullseye" : `Runda ${rawId}`;
                const shanghaiInfo = czyShanghai ? `<div style="margin-top:4px; color:#cbd5e1; font-size:12px;">Ustrzelono Shanghai (S+D+T)</div>` : "";
                const tooltipHtml = `
                    <span style="color:#94a3b8; font-size:11px; display:block; margin-bottom:2px;">SHANGHAI</span>
                    <span style="color:var(--secondary-color); font-size:14px; font-weight:700;">${nazwa}</span>: 
                    <strong style="color:#ffffff; font-size:14px;">${tekstSkut} | ${punkty} pkt</strong>
                    <div style="font-size:12px; color:#cbd5e1; margin-top:2px;">S: ${rDane.single || 0}x | D: ${rDane.double || 0}x | T: ${rDane.triple || 0}x</div>
                    ${shanghaiInfo}
                `;

                const banerHtml = `<strong>${nazwa}</strong> — Skuteczność: <strong>${tekstSkut}</strong> | <strong>${punkty} pkt</strong> (S:${rDane.single || 0} D:${rDane.double || 0} T:${rDane.triple || 0}) ${czyShanghai ? "— Ustrzelono Shanghai!" : ""}`;

                podlaczInterakcjeSektora(el, infoBoxId, defaultText, tooltipHtml, banerHtml);
            });

            const chipIlosc = document.getElementById("chip-shanghai-ilosc");
            const chipRekord = document.getElementById("chip-shanghai-rekord");
            const chipSkutecznosc = document.getElementById("chip-shanghai-skutecznosc");

            if (chipIlosc) chipIlosc.textContent = `${daneShanghai.liczba_shanghai || 0}`;
            if (chipRekord) chipRekord.textContent = Number(daneShanghai.rekord_punktow) > 0 ? `${daneShanghai.rekord_punktow} pkt` : "-";
            if (chipSkutecznosc) chipSkutecznosc.textContent = formatujSkutecznosc(daneShanghai.suma_trafien, daneShanghai.suma_rzutow);
        }

        function renderujRankingListeShanghai(lista) {
            const kontener = document.getElementById("shanghai-ranking-lista");
            if (!kontener) return;

            let html = "";
            lista.forEach((item, index) => {
                const pozycja = item.oryginalnaPozycja !== undefined ? item.oryginalnaPozycja : index + 1;
                const topKlasa = pozycja === 1 ? "top-1" : pozycja === 2 ? "top-2" : pozycja === 3 ? "top-3" : "";
                const szerokoscPaska = Math.max(0, Math.min(100, item.procent));

                html += `
                    <div class="ranking-item ${topKlasa}">
                        <div class="ranking-pozycja">#${pozycja}</div>
                        <div class="ranking-info">
                            <div class="ranking-nazwa-row">
                                <span class="ranking-nazwa">${item.nazwa}</span>
                                <span class="ranking-wynik">${item.tekstSkut}</span>
                            </div>
                            <div class="ranking-detale">
                                <span class="ranking-detal-tag">single: ${item.single}</span>
                                <span class="ranking-detal-tag">double: ${item.double}</span>
                                <span class="ranking-detal-tag">triple: ${item.triple}</span>
                            </div>
                            <div class="ranking-pasek-tlo">
                                <div class="ranking-pasek-wypelnienie" style="width: ${szerokoscPaska}%;"></div>
                            </div>
                        </div>
                    </div>
                `;
            });

            kontener.innerHTML = html;
        }

        function odswiezRankingListeShanghai(daneShanghai) {
            const kontener = document.getElementById("shanghai-ranking-lista");
            if (!kontener) return;

            const rundy = daneShanghai.rundy || daneShanghai.sektory || {};
            const cele = [];
            for (let i = 1; i <= 20; i++) {
                cele.push(String(i));
            }
            Object.keys(rundy).forEach((k) => {
                if (!cele.includes(k)) cele.push(k);
            });

            const lista = cele.map((rawId) => {
                const rDane = rundy[rawId] || null;
                const rzuty = rDane && typeof rDane === "object" ? Number(rDane.rzuty) || 0 : 0;
                const traf = rDane && typeof rDane === "object" ? Number(rDane.trafienia) || 0 : 0;
                const punkty = rDane && typeof rDane === "object" ? Number(rDane.punkty) || 0 : 0;
                const single = rDane && typeof rDane === "object" && rDane.single !== undefined ? Number(rDane.single) || 0 : 0;
                const double = rDane && typeof rDane === "object" && rDane.double !== undefined ? Number(rDane.double) || 0 : 0;
                const triple = rDane && typeof rDane === "object" && rDane.triple !== undefined ? Number(rDane.triple) || 0 : 0;
                const czyShanghai = Boolean(rDane && rDane.shanghai);
                const proc = rzuty > 0 ? (traf / rzuty) * 100 : traf > 0 ? 100 : 0;

                const nazwa = `Sektor: ${rawId}`;

                return {
                    id: rawId,
                    nazwa,
                    rzuty,
                    trafienia: traf,
                    punkty,
                    single,
                    double,
                    triple,
                    czyShanghai,
                    procent: proc,
                    tekstSkut: `${punkty} pkt • ${formatujSkutecznosc(traf, rzuty)}`,
                };
            });

            // Sortowanie malejąco:
            // 1. Skuteczność % (ile % jest na dany sektor / cel)
            // 2. Liczba trafień
            // 3. Mniej rzutów (wyższa efektywność)
            // 4. Punkty
            // 5. Numer sektora
            lista.sort((a, b) => {
                if (b.procent !== a.procent) return b.procent - a.procent;
                if (b.trafienia !== a.trafienia) return b.trafienia - a.trafienia;
                if (a.rzuty !== b.rzuty) return a.rzuty - b.rzuty;
                if (b.punkty !== a.punkty) return b.punkty - a.punkty;
                return (Number(a.id) || 0) - (Number(b.id) || 0);
            });

            lista.forEach((item, idx) => {
                item.oryginalnaPozycja = idx + 1;
            });

            pelnyRankingShanghaiCache = lista;

            const kontenerWiecej = document.getElementById("kontener-wiecej-shanghai");
            const btnWiecej = document.getElementById("btn-zobacz-wszystkie-shanghai");
            if (kontenerWiecej && btnWiecej) {
                if (lista.length > 5) {
                    kontenerWiecej.style.display = "block";
                    btnWiecej.textContent = czyRankingShanghaiRozwiniety ? "Zwiń" : "Zobacz wszystkie";
                    btnWiecej.onclick = () => {
                        czyRankingShanghaiRozwiniety = !czyRankingShanghaiRozwiniety;
                        btnWiecej.textContent = czyRankingShanghaiRozwiniety ? "Zwiń" : "Zobacz wszystkie";
                        const doPokazania = czyRankingShanghaiRozwiniety ? pelnyRankingShanghaiCache : pelnyRankingShanghaiCache.slice(0, 5);
                        renderujRankingListeShanghai(doPokazania);
                    };
                } else {
                    kontenerWiecej.style.display = "none";
                }
            }

            const doPokazania = czyRankingShanghaiRozwiniety ? lista : lista.slice(0, 5);
            renderujRankingListeShanghai(doPokazania);
        }

        // ==============================================================================
        // 5. WYPEŁNIENIE PÓL STATYSTYCZNYCH Z OBIEKTU JSON
        // ==============================================================================
        function zaktualizujWszystkieStatystyki(dane) {
            // 1. Klasyczna
            const klas = dane.klasyczna || {};
            document.getElementById("stat-srednia").textContent = Number(klas.srednia || 0).toFixed(2);
            document.getElementById("stat-9lotek").textContent = Number(klas.srednia_9 || 0).toFixed(2);
            document.getElementById("stat-180").textContent = klas.ilosc_180 || 0;
            document.getElementById("stat-mecze").textContent = klas.mecze || 0;
            document.getElementById("stat-wygrane").textContent = klas.wygrane || 0;
            document.getElementById("stat-porazki").textContent = Math.max(0, (klas.mecze || 0) - (klas.wygrane || 0));

            // 3. Shanghai
            const sh = dane.shanghai || {};
            document.getElementById("stat-rekord").textContent = sh.rekord_punktow || 0;
            document.getElementById("stat-sdt").textContent = sh.liczba_shanghai || 0;
            document.getElementById("stat-shanghai-srednia").textContent = Number(sh.srednia_na_gre || 0).toFixed(1);
            document.getElementById("stat-lacznie").textContent = sh.suma_punktow || 0;
            document.getElementById("stat-shanghai-skutecznosc").textContent = formatujSkutecznosc(sh.suma_trafien, sh.suma_rzutow);
            document.getElementById("stat-shanghai-mecze").textContent = sh.mecze || 0;
            document.getElementById("stat-shanghai-wygrane").textContent = sh.wygrane || 0;
            odswiezHeatmapeShanghai(sh);
            odswiezRankingListeShanghai(sh);

            const atw = dane.around_the_world || {};
            let rekordNajmniej = atw.rekord_najmniej_lotek !== null && atw.rekord_najmniej_lotek !== undefined && Number(atw.rekord_najmniej_lotek) > 0 ? Number(atw.rekord_najmniej_lotek) : null;
            if (!rekordNajmniej && Array.isArray(atw.historia_meczow) && atw.historia_meczow.length > 0) {
                const w = atw.historia_meczow.map((m) => Number(m.lotki || m.rzuty) || 0).filter((v) => v > 0);
                if (w.length > 0) rekordNajmniej = Math.min(...w);
            }
            document.getElementById("stat-najmniej").textContent = rekordNajmniej !== null ? rekordNajmniej : "-";
            document.getElementById("stat-around-skutecznosc").textContent = formatujSkutecznosc(atw.suma_trafien, atw.suma_rzutow);
            document.getElementById("stat-wszystkie").textContent = atw.suma_rzutow || 0;
            document.getElementById("stat-trafione").textContent = atw.suma_trafien || 0;
            document.getElementById("stat-around-mecze").textContent = atw.mecze || 0;
            document.getElementById("stat-around-wygrane").textContent = atw.wygrane || 0;
            odswiezHeatmapeAround(atw);
            odswiezRankingListeAround(atw);

            // 5. 121 Checkout
            const chk = dane.checkout_121 || {};
            document.getElementById("stats-najwyzszy").textContent = chk.max_poziom || 121;
            document.getElementById("stats-najlepsza").textContent = chk.najlepsza_seria || 0;
            document.getElementById("stats-121-sukcesy").textContent = chk.sukcesy || 0;
            document.getElementById("stats-121-podejscia").textContent = chk.podejscia || 0;
            document.getElementById("stats-121-porazki").textContent = Math.max(0, (chk.podejscia || 0) - (chk.sukcesy || 0));
            document.getElementById("stats-121-skutecznosc").textContent = formatujSkutecznosc(chk.sukcesy, chk.podejscia);

            // 6. Doubles
            const dbl = dane.doubles || {};
            // Fallback: jeśli rozegrano mecze w doubles, ale historia_meczow była pusta ([]):
            if ((!Array.isArray(dbl.historia_meczow) || dbl.historia_meczow.length === 0) && (dbl.mecze || 0) > 0) {
                const meczeCount = dbl.mecze;
                const sumaRz = Number(dbl.suma_rzutow) || meczeCount * 60;
                const sumaTr = Number(dbl.suma_trafien) || Math.round(sumaRz * ((dbl.skutecznosc || 50) / 100));
                const rzutyNaMecz = Math.round(sumaRz / meczeCount);
                const trafNaMecz = Math.round(sumaTr / meczeCount);
                const procMeczu = rzutyNaMecz > 0 ? parseFloat(((trafNaMecz / rzutyNaMecz) * 100).toFixed(1)) : Number(dbl.skutecznosc || 0);

                dbl.historia_meczow = [];
                for (let i = 1; i <= meczeCount; i++) {
                    dbl.historia_meczow.push({
                        data: `Mecz ${i}`,
                        skutecznosc: procMeczu,
                        trafienia: trafNaMecz,
                        rzuty: rzutyNaMecz,
                        rywal: "Trening D1-D20",
                        wynik: "W",
                    });
                }
            }
            document.getElementById("stats-doubles-skutecznosc").textContent = formatujSkutecznosc(dbl.suma_trafien, dbl.suma_rzutow);
            document.getElementById("stats-trafione").textContent = dbl.suma_trafien || 0;
            document.getElementById("stats-rzuty").textContent = dbl.suma_rzutow || 0;
            document.getElementById("stats-doubles-mecze").textContent = dbl.mecze || 0;
            document.getElementById("stats-doubles-wygrane").textContent = dbl.wygrane || 0;
            document.getElementById("stats-doubles-porazki").textContent = Math.max(0, (dbl.mecze || 0) - (dbl.wygrane || 0));
            odswiezHeatmapeDoubles(dbl);
            odswiezRankingListeDoubles(dbl);

            // 7. Sprzęt
            const sprzet = dane.sprzet || {};
            const ustawSprzet = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val && String(val).trim() !== "" ? val : "-";
            };
            ustawSprzet("barele-gracza", sprzet.barele);
            ustawSprzet("shafty-gracza", sprzet.shafty);
            ustawSprzet("groty-gracza", sprzet.groty);
            ustawSprzet("tarcza-gracza", sprzet.tarcza);
            ustawSprzet("autoscore-gracza", sprzet.auto_score);
            ustawSprzet("druzyna-gracza", sprzet.druzyna);

            // 8. Wykresy formy
            odswiezWykresFormy("klasyczna");
            odswiezWykresFormy("shanghai");
            odswiezWykresFormy("around_the_world");
            odswiezWykresFormy("checkout_121");
            odswiezWykresFormy("doubles");
        }

        // ==============================================================================
        // 5B. OBSŁUGA WYKRESÓW FORMY I ŚREDNIEJ Z ROZMAITYCH DAT (CHART.JS)
        // ==============================================================================
        const wykresyInstancje = {};
        const aktywneMetryki = {
            klasyczna: "srednia",
            shanghai: "srednia",
            around_the_world: "skutecznosc",
            checkout_121: "skutecznosc",
            doubles: "skutecznosc",
        };

        const KONFIG_METRYK = {
            klasyczna: {
                canvasId: "chart-klasyczna",
                prefixChip: "chip-klas",
                tytulId: null,
                metryki: {
                    srednia: { nazwa: "Średnia 3 lotek", tytulWykresu: "Wykres Średniej", jednostka: "", odwrcony: false, format: (v) => Number(v).toFixed(2) },
                    srednia9: { nazwa: "Średnia 9 lotek", tytulWykresu: "Wykres Średniej 9 Lotek", jednostka: "", odwrcony: false, format: (v) => Number(v).toFixed(2) },
                },
            },
            shanghai: {
                canvasId: "chart-shanghai",
                prefixChip: "chip-sh",
                tytulId: "tytul-wykres-sh",
                metryki: {
                    srednia: { nazwa: "Średnia na rundę", tytulWykresu: "Wykres Średniej na Rundę", jednostka: " pkt", odwrcony: false, format: (v) => Number(v).toFixed(1) + " pkt" },
                    punkty: { nazwa: "Suma punktów", tytulWykresu: "Wykres Sumy Punktów", jednostka: " pkt", odwrcony: false, format: (v) => `${v} pkt` },
                    skutecznosc: { nazwa: "Skuteczność rzutów", tytulWykresu: "Wykres Skuteczności", jednostka: "%", odwrcony: false, format: (v) => Number(v).toFixed(1) + "%" },
                },
            },
            around_the_world: {
                canvasId: "chart-around-the-world",
                prefixChip: "chip-atw",
                tytulId: "tytul-wykres-atw",
                metryki: {
                    skutecznosc: { nazwa: "Skuteczność", tytulWykresu: "Wykres Skuteczności", jednostka: "%", odwrcony: false, format: (v) => Number(v).toFixed(1) + "%" },
                    lotki: { nazwa: "Liczba lotek", tytulWykresu: "Wykres Liczby Lotek", jednostka: "", odwrcony: true, format: (v) => `${v}` },
                },
            },
            checkout_121: {
                canvasId: "chart-121checkout",
                prefixChip: "chip-chk",
                tytulId: "tytul-wykres-chk",
                metryki: {
                    skutecznosc: { nazwa: "Skuteczność checkoutu", tytulWykresu: "Wykres Skuteczności Checkoutu", jednostka: "%", odwrcony: false, format: (v) => Number(v).toFixed(1) + "%" },
                    max_poziom: { nazwa: "Osiągnięty poziom", tytulWykresu: "Wykres Poziomów Checkout", jednostka: "", odwrcony: false, format: (v) => `${v}` },
                },
            },
            doubles: {
                canvasId: "chart-doubles",
                prefixChip: "chip-dbl",
                tytulId: "tytul-wykres-dbl",
                metryki: {
                    skutecznosc: { nazwa: "Skuteczność na double", tytulWykresu: "Wykres Skuteczności", jednostka: "%", odwrcony: false, format: (v) => Number(v).toFixed(1) + "%" },
                    trafienia: { nazwa: "Trafione double", tytulWykresu: "Wykres Trafionych Double", jednostka: "", odwrcony: false, format: (v) => `${v}` },
                },
            },
        };

        function odswiezWykresFormy(trybKlucz) {
            const konfigTrybu = KONFIG_METRYK[trybKlucz];
            if (!konfigTrybu) return;

            const canvas = document.getElementById(konfigTrybu.canvasId);
            if (!canvas) return;

            const metrykaKlucz = aktywneMetryki[trybKlucz] || Object.keys(konfigTrybu.metryki)[0];
            const metrykaInfo = konfigTrybu.metryki[metrykaKlucz] || { nazwa: "Wartość", format: (v) => v, jednostka: "" };

            // Dynamiczna aktualizacja tytułu wykresu
            if (konfigTrybu.tytulId && metrykaInfo.tytulWykresu) {
                const tytulEl = document.getElementById(konfigTrybu.tytulId);
                if (tytulEl) tytulEl.textContent = metrykaInfo.tytulWykresu;
            }
            if (trybKlucz === "checkout_121") {
                const lblChkMax = document.getElementById("lbl-chk-max");
                if (lblChkMax) {
                    lblChkMax.textContent = metrykaKlucz === "max_poziom" ? "Max poziom" : "Najlepsza skut.";
                }
            }

            const daneTrybu = DANE_STATYSTYK[trybKlucz] || {};
            const historia = Array.isArray(daneTrybu.historia_meczow) ? daneTrybu.historia_meczow : [];

            // Pigułki podsumowania nad wykresem
            const chipOstatni = document.getElementById(`${konfigTrybu.prefixChip}-ostatni`);
            const chipMax = document.getElementById(`${konfigTrybu.prefixChip}-max`);
            const chipTrend = document.getElementById(`${konfigTrybu.prefixChip}-trend`);

            const isIntegerMetric = ["lotki", "max_poziom", "trafienia", "punkty"].includes(metrykaKlucz);

            if (historia.length > 0) {
                const wartosci = historia.map((m) => Number(m[metrykaKlucz]) || 0);
                const ostatnia = wartosci[wartosci.length - 1];
                const pierwsza = wartosci[0];
                const minVal = Math.min(...wartosci);
                const maxVal = Math.max(...wartosci);
                const rekord = metrykaInfo.odwrcony ? minVal : maxVal;

                const roznica = ostatnia - pierwsza;
                let trendTxt = "0 ─";
                if (roznica > 0) {
                    const diffStr = isIntegerMetric ? `+${Math.round(roznica)}` : `+${roznica.toFixed(1)}`;
                    trendTxt = metrykaInfo.odwrcony ? `${diffStr} ↘` : `${diffStr} ↗`;
                } else if (roznica < 0) {
                    const diffStr = isIntegerMetric ? `${Math.round(roznica)}` : `${roznica.toFixed(1)}`;
                    trendTxt = metrykaInfo.odwrcony ? `${diffStr} ↗` : `${diffStr} ↘`;
                }

                if (chipOstatni) chipOstatni.textContent = metrykaInfo.format(ostatnia);
                if (chipMax) chipMax.textContent = metrykaInfo.format(rekord);
                if (chipTrend) chipTrend.textContent = trendTxt;
            } else {
                if (chipOstatni) chipOstatni.textContent = "-";
                if (chipMax) chipMax.textContent = "-";
                if (chipTrend) chipTrend.textContent = "-";
            }

            // Sprawdzenie dostępności Chart.js
            if (typeof Chart === "undefined") {
                console.warn("Chart.js nie jest jeszcze załadowany.");
                return;
            }

            // Jeśli brak danych w historii, nie tworzymy pustego/uszkodzonego wykresu
            if (historia.length === 0) {
                if (wykresyInstancje[trybKlucz]) {
                    try {
                        wykresyInstancje[trybKlucz].destroy();
                    } catch (_) {}
                    delete wykresyInstancje[trybKlucz];
                }
                const existingOnCanvas = Chart.getChart(canvas);
                if (existingOnCanvas) {
                    try {
                        existingOnCanvas.destroy();
                    } catch (_) {}
                }
                return;
            }

            const labels = historia.map((m) => m.data || "Mecz");
            const dataValues = historia.map((m) => Number(m[metrykaKlucz]) || 0);

            const brandColor = getComputedStyle(document.documentElement).getPropertyValue("--secondary-color").trim() || "rgb(64, 218, 64)";
            const darkNavyBg = "#090723";

            const ctx = canvas.getContext("2d");
            const getGradient = (chartCtx) => {
                const h = chartCtx?.chartArea ? chartCtx.chartArea.bottom - chartCtx.chartArea.top : canvas.clientHeight || 240;
                const g = ctx.createLinearGradient(0, 0, 0, h > 0 ? h : 240);
                g.addColorStop(0, "rgba(64, 218, 64, 0.30)");
                g.addColorStop(1, "rgba(64, 218, 64, 0.00)");
                return g;
            };

            if (wykresyInstancje[trybKlucz]) {
                const chart = wykresyInstancje[trybKlucz];
                // Jeśli istniejący wykres miał 0 punktów danych, niszczymy go i tworzymy od nowa
                if (!chart.data?.datasets?.[0]?.data?.length) {
                    try {
                        chart.destroy();
                    } catch (_) {}
                    delete wykresyInstancje[trybKlucz];
                } else {
                    chart.historiaMeczow = historia;
                    chart.metrykaInfo = metrykaInfo;
                    chart.metrykaKlucz = metrykaKlucz;
                    chart.data.labels = labels;
                    chart.data.datasets[0].label = metrykaInfo.nazwa;
                    chart.data.datasets[0].data = dataValues;
                    chart.data.datasets[0].borderColor = brandColor;
                    chart.data.datasets[0].backgroundColor = (context) => getGradient(context.chart);
                    chart.data.datasets[0].pointBorderColor = (c) => (trybKlucz === "shanghai" && historia[c.dataIndex]?.shanghai ? "#fbbf24" : brandColor);
                    chart.data.datasets[0].pointBackgroundColor = (c) => (trybKlucz === "shanghai" && historia[c.dataIndex]?.shanghai ? "#f59e0b" : darkNavyBg);
                    chart.data.datasets[0].pointRadius = (c) => (trybKlucz === "shanghai" && historia[c.dataIndex]?.shanghai ? 7 : 5);
                    chart.data.datasets[0].pointHoverBackgroundColor = brandColor;

                    // Dynamiczna aktualizacja formatowania osi Y (brak % dla liczb i poziomu)
                    if (chart.options?.scales?.y?.ticks) {
                        chart.options.scales.y.ticks.precision = isIntegerMetric ? 0 : undefined;
                        chart.options.scales.y.ticks.callback = function (value) {
                            const curKlucz = this.chart?.metrykaKlucz || metrykaKlucz;
                            const curInfo = this.chart?.metrykaInfo || metrykaInfo;
                            if (["lotki", "max_poziom", "trafienia", "punkty"].includes(curKlucz)) {
                                return Number.isInteger(value) ? value : Math.round(value);
                            }
                            const cleanNum = typeof value === "number" ? Number(value.toFixed(2)) : value;
                            if (curInfo?.jednostka === "%") {
                                return `${cleanNum}%`;
                            }
                            if (curInfo?.jednostka) {
                                return `${cleanNum}${curInfo.jednostka}`;
                            }
                            return cleanNum;
                        };
                    }

                    if (typeof chart.resize === "function") {
                        chart.resize();
                    }
                    chart.update();
                    return;
                }
            }

            const existingOnCanvas = Chart.getChart(canvas);
            if (existingOnCanvas) {
                try {
                    existingOnCanvas.destroy();
                } catch (_) {}
            }

            wykresyInstancje[trybKlucz] = new Chart(ctx, {
                type: "line",
                data: {
                    labels,
                    datasets: [
                        {
                            label: metrykaInfo.nazwa,
                            data: dataValues,
                            borderColor: brandColor,
                            borderWidth: 3,
                            backgroundColor: (context) => getGradient(context.chart),
                            fill: true,
                            tension: 0.35,
                            pointBackgroundColor: (c) => (trybKlucz === "shanghai" && historia[c.dataIndex]?.shanghai ? "#f59e0b" : darkNavyBg),
                            pointBorderColor: (c) => (trybKlucz === "shanghai" && historia[c.dataIndex]?.shanghai ? "#fbbf24" : brandColor),
                            pointBorderWidth: 2.5,
                            pointRadius: (c) => (trybKlucz === "shanghai" && historia[c.dataIndex]?.shanghai ? 7 : 5),
                            pointHoverRadius: 8,
                            pointHoverBackgroundColor: brandColor,
                            pointHoverBorderColor: "#ffffff",
                            pointHoverBorderWidth: 2,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: "index",
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            display: false,
                        },
                        tooltip: {
                            backgroundColor: "rgba(9, 7, 35, 0.96)",
                            titleColor: brandColor,
                            bodyColor: "#ffffff",
                            borderColor: "rgba(64, 218, 64, 0.35)",
                            borderWidth: 1,
                            padding: 12,
                            displayColors: false,
                            titleFont: { family: "Inter", size: 12, weight: "bold" },
                            bodyFont: { family: "Inter", size: 13, weight: "bold" },
                            callbacks: {
                                title: (items) => {
                                    const item = items[0];
                                    const idx = item?.dataIndex;
                                    const chart = item?.chart;
                                    const aktualnaHistoria = chart?.historiaMeczow || historia;
                                    const mecz = aktualnaHistoria[idx];
                                    if (mecz) {
                                        let rywalInfo = "";
                                        if (mecz.rywal) {
                                            rywalInfo = mecz.rywal.startsWith("Trening") ? ` (${mecz.rywal})` : ` (vs ${mecz.rywal})`;
                                        }
                                        const formatInfo = mecz.format ? ` [${mecz.format}]` : "";
                                        const shanghaiBadge = mecz.shanghai ? "SHANGHAI!" : "";
                                        return `📅 Data: ${mecz.data}${rywalInfo}${formatInfo}${shanghaiBadge}`;
                                    }
                                    return item?.label || "";
                                },
                                label: (context) => {
                                    const idx = context.dataIndex;
                                    const chart = context.chart;
                                    const aktualnaHistoria = chart?.historiaMeczow || historia;
                                    const mecz = aktualnaHistoria[idx];
                                    const val = context.parsed.y;
                                    const info = chart?.metrykaInfo || metrykaInfo;
                                    const curKlucz = chart?.metrykaKlucz || metrykaKlucz;
                                    const formatted = info.format(val);
                                    let extra = "";
                                    if (mecz?.shanghai) {
                                        extra += ` | Shanghai (K.O.)`;
                                    } else if (mecz?.wynik) {
                                        extra += ` | Wynik: ${mecz.wynik}`;
                                    }
                                    if (mecz?.rundyLiczba) {
                                        extra += ` | Rundy: ${mecz.rundyLiczba}`;
                                    }
                                    if (mecz?.highest_score || mecz?.hs) {
                                        extra += ` | HS: ${mecz.highest_score || mecz.hs}`;
                                    } else if (mecz?.checkout) {
                                        extra += ` | HS: ${mecz.checkout}`;
                                    }
                                    if (mecz?.highest_finish || mecz?.hf) {
                                        extra += ` | HF: ${mecz.highest_finish || mecz.hf}`;
                                    }
                                    if (mecz?.punkty && curKlucz !== "punkty") extra += ` | Pkt: ${mecz.punkty}`;
                                    if (mecz?.skutecznosc !== undefined && curKlucz !== "skutecznosc") extra += ` | Skut.: ${mecz.skutecznosc}%`;
                                    if (mecz?.lotki !== undefined && curKlucz !== "lotki") extra += ` | Lotki: ${mecz.lotki}`;
                                    if (mecz?.max_poziom !== undefined && curKlucz !== "max_poziom") extra += ` | Max: ${mecz.max_poziom}`;
                                    if (mecz?.trafienia !== undefined && curKlucz !== "trafienia") extra += ` | Trafienia: ${mecz.trafienia}`;
                                    return ` ${info.nazwa}: ${formatted}${extra}`;
                                },
                            },
                        },
                    },
                    scales: {
                        x: {
                            grid: {
                                color: "rgba(255, 255, 255, 0.06)",
                            },
                            ticks: {
                                color: "#cbd5e1",
                                font: { family: "Inter", size: 11, weight: "600" },
                            },
                        },
                        y: {
                            grid: {
                                color: "rgba(255, 255, 255, 0.06)",
                            },
                            ticks: {
                                color: "#cbd5e1",
                                font: { family: "Inter", size: 11, weight: "600" },
                                precision: isIntegerMetric ? 0 : undefined,
                                callback: function (value) {
                                    const curKlucz = this.chart?.metrykaKlucz || metrykaKlucz;
                                    const curInfo = this.chart?.metrykaInfo || metrykaInfo;
                                    if (["lotki", "max_poziom", "trafienia", "punkty"].includes(curKlucz)) {
                                        return Number.isInteger(value) ? value : Math.round(value);
                                    }
                                    const cleanNum = typeof value === "number" ? Number(value.toFixed(2)) : value;
                                    if (curInfo?.jednostka === "%") {
                                        return `${cleanNum}%`;
                                    }
                                    if (curInfo?.jednostka) {
                                        return `${cleanNum}${curInfo.jednostka}`;
                                    }
                                    return cleanNum;
                                },
                            },
                        },
                    },
                },
            });
            wykresyInstancje[trybKlucz].historiaMeczow = historia;
            wykresyInstancje[trybKlucz].metrykaInfo = metrykaInfo;
            wykresyInstancje[trybKlucz].metrykaKlucz = metrykaKlucz;
        }

        function zainicjalizujPrzelacznikiMetryk() {
            const przyciski = document.querySelectorAll(".btn-metryka");
            przyciski.forEach((btn) => {
                btn.addEventListener("click", () => {
                    const tryb = btn.getAttribute("data-chart");
                    const metryka = btn.getAttribute("data-metric");
                    if (!tryb || !metryka) return;

                    const rodzic = btn.closest(".chart-przelacznik-metryki");
                    if (rodzic) {
                        rodzic.querySelectorAll(".btn-metryka").forEach((b) => b.classList.remove("aktywny"));
                    }
                    btn.classList.add("aktywny");

                    aktywneMetryki[tryb] = metryka;
                    odswiezWykresFormy(tryb);
                });
            });
        }

        // ==============================================================================
        // 6. OBSŁUGA ZAKŁADEK I INICJALIZACJA
        // ==============================================================================
        function zainicjalizujZakladki() {
            const przyciski = document.querySelectorAll("#btn-container-stats .btn-stat-tab");
            const sekcje = document.querySelectorAll(".stats-sekcja");

            przyciski.forEach((btn) => {
                btn.addEventListener("click", () => {
                    const targetId = btn.getAttribute("data-target");
                    odznaczWybranySektor();

                    przyciski.forEach((b) => b.classList.remove("aktywna"));
                    btn.classList.add("aktywna");

                    sekcje.forEach((sekcja) => {
                        if (sekcja.id === targetId) {
                            sekcja.classList.add("aktywna");
                        } else {
                            sekcja.classList.remove("aktywna");
                        }
                    });

                    // Odświeżenie wymiarów wykresów po zmianie widocznej zakładki
                    setTimeout(() => {
                        Object.values(wykresyInstancje).forEach((chart) => {
                            if (chart && typeof chart.resize === "function") {
                                chart.resize();
                            }
                        });
                    }, 20);
                });
            });
        }

        function zainicjalizujPrzelacznikTrybu(trybKlucz, idPrefix) {
            const btnTarcza = document.getElementById(`btn-${idPrefix}-tarcza`);
            const btnWykres = document.getElementById(`btn-${idPrefix}-wykres`);
            const widokTarcza = document.getElementById(`${idPrefix}-widok-tarcza`);
            const widokWykres = document.getElementById(`${idPrefix}-widok-wykres`);
            if (!btnTarcza || !btnWykres || !widokTarcza || !widokWykres) return;

            btnTarcza.addEventListener("click", () => {
                btnWykres.classList.remove("aktywny");
                btnTarcza.classList.add("aktywny");
                widokWykres.style.display = "none";
                widokTarcza.style.display = "block";
                odznaczWybranySektor();
            });

            btnWykres.addEventListener("click", () => {
                btnTarcza.classList.remove("aktywny");
                btnWykres.classList.add("aktywny");
                widokTarcza.style.display = "none";
                widokWykres.style.display = "block";
                odznaczWybranySektor();
                odswiezWykresFormy(trybKlucz);
                setTimeout(() => {
                    if (wykresyInstancje[trybKlucz] && typeof wykresyInstancje[trybKlucz].resize === "function") {
                        wykresyInstancje[trybKlucz].resize();
                    }
                }, 20);
            });
        }

        function zainicjalizujPrzelacznikShanghai() {
            const btnTarcza = document.getElementById("btn-shanghai-tarcza");
            const btnLista = document.getElementById("btn-shanghai-lista");
            const btnWykres = document.getElementById("btn-shanghai-wykres");
            const widokTarcza = document.getElementById("shanghai-widok-tarcza");
            const widokLista = document.getElementById("shanghai-widok-lista");
            const widokWykres = document.getElementById("shanghai-widok-wykres");
            if (!btnTarcza || !btnLista || !widokTarcza || !widokLista) return;

            const ukryjWszystkie = () => {
                btnTarcza.classList.remove("aktywny");
                btnLista.classList.remove("aktywny");
                if (btnWykres) btnWykres.classList.remove("aktywny");
                widokTarcza.style.display = "none";
                widokLista.style.display = "none";
                if (widokWykres) widokWykres.style.display = "none";
                odznaczWybranySektor();
            };

            btnTarcza.addEventListener("click", () => {
                ukryjWszystkie();
                btnTarcza.classList.add("aktywny");
                widokTarcza.style.display = "block";
            });

            btnLista.addEventListener("click", () => {
                ukryjWszystkie();
                btnLista.classList.add("aktywny");
                widokLista.style.display = "block";
                odswiezRankingListeShanghai(DANE_STATYSTYK.shanghai || {});
            });

            if (btnWykres && widokWykres) {
                btnWykres.addEventListener("click", () => {
                    ukryjWszystkie();
                    btnWykres.classList.add("aktywny");
                    widokWykres.style.display = "block";
                    odswiezWykresFormy("shanghai");
                    setTimeout(() => {
                        if (wykresyInstancje.shanghai && typeof wykresyInstancje.shanghai.resize === "function") {
                            wykresyInstancje.shanghai.resize();
                        }
                    }, 20);
                });
            }
        }

        function zainicjalizujPrzelacznikAround() {
            const btnTarcza = document.getElementById("btn-around-tarcza");
            const btnLista = document.getElementById("btn-around-lista");
            const btnWykres = document.getElementById("btn-around-wykres");
            const widokTarcza = document.getElementById("around-widok-tarcza");
            const widokLista = document.getElementById("around-widok-lista");
            const widokWykres = document.getElementById("around-widok-wykres");
            if (!btnTarcza || !btnLista || !widokTarcza || !widokLista) return;

            const ukryjWszystkie = () => {
                btnTarcza.classList.remove("aktywny");
                btnLista.classList.remove("aktywny");
                if (btnWykres) btnWykres.classList.remove("aktywny");
                widokTarcza.style.display = "none";
                widokLista.style.display = "none";
                if (widokWykres) widokWykres.style.display = "none";
                odznaczWybranySektor();
            };

            btnTarcza.addEventListener("click", () => {
                ukryjWszystkie();
                btnTarcza.classList.add("aktywny");
                widokTarcza.style.display = "block";
            });

            btnLista.addEventListener("click", () => {
                ukryjWszystkie();
                btnLista.classList.add("aktywny");
                widokLista.style.display = "block";
                odswiezRankingListeAround(DANE_STATYSTYK.around_the_world || {});
            });

            if (btnWykres && widokWykres) {
                btnWykres.addEventListener("click", () => {
                    ukryjWszystkie();
                    btnWykres.classList.add("aktywny");
                    widokWykres.style.display = "block";
                    odswiezWykresFormy("around_the_world");
                    setTimeout(() => {
                        if (wykresyInstancje.around_the_world && typeof wykresyInstancje.around_the_world.resize === "function") {
                            wykresyInstancje.around_the_world.resize();
                        }
                    }, 20);
                });
            }
        }

        function zainicjalizujPrzelacznikDoubles() {
            const btnTarcza = document.getElementById("btn-doubles-tarcza");
            const btnLista = document.getElementById("btn-doubles-lista");
            const btnWykres = document.getElementById("btn-doubles-wykres");
            const widokTarcza = document.getElementById("doubles-widok-tarcza");
            const widokLista = document.getElementById("doubles-widok-lista");
            const widokWykres = document.getElementById("doubles-widok-wykres");
            if (!btnTarcza || !btnLista || !widokTarcza || !widokLista) return;

            const ukryjWszystkie = () => {
                btnTarcza.classList.remove("aktywny");
                btnLista.classList.remove("aktywny");
                if (btnWykres) btnWykres.classList.remove("aktywny");
                widokTarcza.style.display = "none";
                widokLista.style.display = "none";
                if (widokWykres) widokWykres.style.display = "none";
                odznaczWybranySektor();
            };

            btnTarcza.addEventListener("click", () => {
                ukryjWszystkie();
                btnTarcza.classList.add("aktywny");
                widokTarcza.style.display = "block";
            });

            btnLista.addEventListener("click", () => {
                ukryjWszystkie();
                btnLista.classList.add("aktywny");
                widokLista.style.display = "block";
                odswiezRankingListeDoubles(DANE_STATYSTYK.doubles || {});
            });

            if (btnWykres && widokWykres) {
                btnWykres.addEventListener("click", () => {
                    ukryjWszystkie();
                    btnWykres.classList.add("aktywny");
                    widokWykres.style.display = "block";
                    odswiezWykresFormy("doubles");
                    setTimeout(() => {
                        if (wykresyInstancje.doubles && typeof wykresyInstancje.doubles.resize === "function") {
                            wykresyInstancje.doubles.resize();
                        }
                    }, 20);
                });
            }
        }

        // ==============================================================================
        // 6. POMOCNICZE FUNKCJE SIECIOWE, PROFILE, MECZE I STORAGE
        // ==============================================================================
        function zLimitemCzasu(obietnica, etap, czasMs = 12000) {
            let timerId;
            const timeout = new Promise((resolve, reject) => {
                timerId = setTimeout(() => reject(new Error(`Przekroczono czas oczekiwania: ${etap}`)), czasMs);
            });
            return Promise.race([obietnica, timeout]).finally(() => clearTimeout(timerId));
        }

        async function wykonajZapisProfilu(profilData, userId) {
            const sesja = pobierzSesjeZStorage();
            const token = sesja.token;

            const naglowki = {
                apikey: SUPA_KEY,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
            };
            if (token) {
                naglowki["Authorization"] = `Bearer ${token}`;
            }

            const payloadStr = JSON.stringify(profilData);
            const directUrl = `${SUPA_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`;
            let ostatniBlad = null;

            try {
                const controller = new AbortController();
                const timerId = setTimeout(() => controller.abort(), 4000);
                const res = await fetch(directUrl, {
                    method: "PATCH",
                    headers: naglowki,
                    body: payloadStr,
                    cache: "no-store",
                    signal: controller.signal,
                }).finally(() => clearTimeout(timerId));

                if (res.ok || res.status === 204) {
                    return true;
                }
                if (res.status !== 401) {
                    let errJson = {};
                    try {
                        errJson = await res.json();
                    } catch (_) {}
                    throw new Error(errJson.message || `Błąd serwera bazy (HTTP ${res.status})`);
                }
            } catch (eDirect) {
                console.warn("Direct fetch profilu pominięty:", eDirect.message);
                ostatniBlad = eDirect;
            }

            if (client) {
                try {
                    const { error: clientErr } = await Promise.race([client.from("profiles").update(profilData).eq("id", userId), new Promise((_, reject) => setTimeout(() => reject(new Error("Limit czasu Supabase SDK")), 4000))]);
                    if (!clientErr) return true;
                } catch (eSdk) {
                    if (!ostatniBlad) ostatniBlad = eSdk;
                }
            }

            if (window.location.hostname === "stacjadarta.pl") {
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 4000);
                    const resProxy = await fetch("/api/supabase-request", {
                        method: "POST",
                        headers: {
                            apikey: SUPA_KEY,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            path: `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
                            method: "PATCH",
                            headers: { "content-type": "application/json", prefer: "return=minimal" },
                            body: payloadStr,
                            accessToken: token,
                        }),
                        cache: "no-store",
                        signal: controller.signal,
                    }).finally(() => clearTimeout(timer));

                    if (resProxy.ok || resProxy.status === 204) {
                        return true;
                    }
                } catch (eProxy) {}
            }

            throw new Error(ostatniBlad?.message || "Nie udało się zapisać zmian w bazie danych. Spróbuj ponownie.");
        }

        async function pobierzAdresIP() {
            try {
                const controller = new AbortController();
                const tId = setTimeout(() => controller.abort(), 2000);
                const res = await fetch("/api/my-ip", { signal: controller.signal });
                clearTimeout(tId);
                if (res.ok) {
                    const data = await res.json();
                    if (data?.ip) return data.ip;
                }
            } catch (_) {}

            try {
                const controller = new AbortController();
                const tId = setTimeout(() => controller.abort(), 2500);
                const res = await fetch("https://api64.ipify.org?format=json", { signal: controller.signal });
                clearTimeout(tId);
                if (res.ok) {
                    const data = await res.json();
                    if (data?.ip) return data.ip;
                }
            } catch (_) {}

            return null;
        }

        async function zsynchronizujOstatnieIp(userId, zapisaneIp) {
            try {
                const mojeIp = await pobierzAdresIP();
                if (mojeIp) {
                    if (aktualnyProfil) aktualnyProfil.ostatnie_ip = mojeIp;
                    const poleEdycjaIp = document.getElementById("edycja-ip");
                    if (poleEdycjaIp) poleEdycjaIp.value = mojeIp;

                    if (mojeIp !== zapisaneIp) {
                        await wykonajZapisProfilu({ 
                            ostatnie_ip: mojeIp,
                            zaktualizowano: new Date().toISOString()
                        }, userId);
                    }
                }
            } catch (e) {
                console.warn("Błąd synchronizacji ostatnie_ip:", e);
            }
        }

        function normalizujMecz(m, profilId, nazwaGracza = "") {
            const statystyki = Array.isArray(m.statystyki_graczy) && m.statystyki_graczy.length > 0 ? m.statystyki_graczy : Array.isArray(m.gracze) && m.gracze.length > 0 ? m.gracze : [];

            const legi = m.pelny_przebieg_meczu || m.historiaMeczuLegi || [];
            const nickLower = (nazwaGracza || "").trim().toLowerCase();

            let czyWygrana = false;
            let wynik = "- : -";
            let przeciwnikNazwa = "Przeciwnik";
            let dataMeczu = "-";
            let jaNazwa = nazwaGracza || "Gracz";
            let mojWynik = 0;
            let rywalWynik = 0;
            let mojaSrednia = "-";
            let rywalSrednia = "-";

            let timestamp = 0;
            if (m.utworzono) {
                try {
                    const parsedDate = new Date(m.utworzono.replace(" ", "T"));
                    dataMeczu = parsedDate.toLocaleDateString("pl-PL");
                    timestamp = parsedDate.getTime() || 0;
                } catch (e) {
                    dataMeczu = "-";
                }
            } else if (m.data) {
                dataMeczu = m.data;
                try {
                    if (m.data.includes(".")) {
                        const parts = m.data.split(".");
                        if (parts.length === 3) {
                            timestamp = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime() || 0;
                        }
                    } else {
                        timestamp = new Date(m.data).getTime() || 0;
                    }
                } catch (_) {}
            }

            if (m.host_id || m.gosc_id) {
                const czyHost = m.host_id === profilId;
                if (m.zwyciezca_id) {
                    czyWygrana = m.zwyciezca_id === profilId;
                } else {
                    czyWygrana = czyHost ? m.wynik_host > m.wynik_gosc : m.wynik_gosc > m.wynik_host;
                }
                mojWynik = czyHost ? (m.wynik_host ?? 0) : (m.wynik_gosc ?? 0);
                rywalWynik = czyHost ? (m.wynik_gosc ?? 0) : (m.wynik_host ?? 0);
                wynik = `${mojWynik} : ${rywalWynik}`;

                if (statystyki.length > 1) {
                    const nickLowerDb = (nazwaGracza || "").trim().toLowerCase();
                    let mojStat =
                        statystyki.find((s) => {
                            if (s?.id && profilId && s.id === profilId) return true;
                            if (nickLowerDb && (s?.nazwa || "").trim().toLowerCase() === nickLowerDb) return true;
                            return false;
                        }) ||
                        (czyHost ? statystyki[0] : statystyki[1]) ||
                        statystyki[0];

                    let rywalStat = statystyki.find((s) => s !== mojStat) || (czyHost ? statystyki[1] : statystyki[0]);

                    przeciwnikNazwa = rywalStat?.nazwa || "Rywal";
                    if (mojStat?.nazwa) jaNazwa = mojStat.nazwa;
                    if (mojStat?.srednia) mojaSrednia = Number(mojStat.srednia).toFixed(2);
                    if (rywalStat?.srednia) rywalSrednia = Number(rywalStat.srednia).toFixed(2);
                } else if (m.format_gry) {
                    przeciwnikNazwa = m.format_gry;
                }
            } else {
                let mojIdx = 0;
                if (statystyki.length > 1 && nickLower) {
                    if (statystyki[1]?.nazwa?.trim().toLowerCase() === nickLower) {
                        mojIdx = 1;
                    }
                }
                const rywalIdx = mojIdx === 0 ? 1 : 0;
                const ja = statystyki[mojIdx] || { wygraneLegi: 0, nazwa: nazwaGracza };
                const rywal = statystyki[rywalIdx] || null;

                jaNazwa = ja.nazwa || nazwaGracza || "Gracz";
                przeciwnikNazwa = rywal?.nazwa || "Rywal";
                mojWynik = ja.wygraneLegi ?? 0;
                rywalWynik = rywal ? (rywal.wygraneLegi ?? 0) : 0;
                wynik = `${mojWynik} : ${rywalWynik}`;

                if (ja.srednia) mojaSrednia = Number(ja.srednia).toFixed(2);
                if (rywal?.srednia) rywalSrednia = Number(rywal.srednia).toFixed(2);

                if (m.zwyciezca) {
                    czyWygrana = m.zwyciezca.trim().toLowerCase() === (ja.nazwa || "").trim().toLowerCase();
                } else {
                    czyWygrana = (ja.wygraneLegi || 0) > (rywal?.wygraneLegi || 0);
                }
            }

            return {
                ...m,
                _timestamp: timestamp,
                _czyWygrana: czyWygrana,
                _wynik: wynik,
                _przeciwnikNazwa: przeciwnikNazwa,
                _dataMeczu: dataMeczu,
                _jaNazwa: jaNazwa,
                _jaWynik: mojWynik,
                _rywalWynik: rywalWynik,
                _jaSrednia: mojaSrednia,
                _rywalSrednia: rywalSrednia,
                statystyki_graczy: statystyki,
                pelny_przebieg_meczu: legi,
                format_gry: m.format_gry || (m.punktyStartowe ? `${m.punktyStartowe} DO` : "Klasyczny"),
            };
        }

        async function pobierzHistorieMeczow(profilId, nazwaGracza = "", czyMojProfil = false, limit = 5) {
            let meczeZdalne = [];
            const limitLiczba = limit && Number(limit) > 0 ? Number(limit) : 100;
            const limitStr = String(limitLiczba);
            const limitQuery = `&limit=${limitLiczba}`;

            try {
                const resWorker = await fetch("/api/supabase-read", {
                    method: "POST",
                    headers: { apikey: SUPA_KEY, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        table: "matches",
                        params: {
                            select: "*",
                            or: `(host_id.eq.${profilId},gosc_id.eq.${profilId})`,
                            order: "utworzono.desc",
                            limit: limitStr,
                        },
                    }),
                });
                if (resWorker.ok) {
                    const data = await resWorker.json();
                    if (Array.isArray(data) && data.length > 0) {
                        meczeZdalne = data;
                    }
                }
            } catch (_) {}

            if (meczeZdalne.length === 0) {
                try {
                    const resProxy = await fetch("/api/supabase-request", {
                        method: "POST",
                        headers: { apikey: SUPA_KEY, "Content-Type": "application/json" },
                        body: JSON.stringify({
                            path: `/rest/v1/matches?select=*&or=(host_id.eq.${encodeURIComponent(profilId)},gosc_id.eq.${encodeURIComponent(profilId)})&order=utworzono.desc${limitQuery}`,
                            method: "GET",
                        }),
                    });
                    if (resProxy.ok) {
                        const data = await resProxy.json();
                        if (Array.isArray(data) && data.length > 0) {
                            meczeZdalne = data;
                        }
                    }
                } catch (_) {}
            }

            if (meczeZdalne.length === 0) {
                try {
                    const controller = new AbortController();
                    const timerId = setTimeout(() => controller.abort(), 4000);
                    const url = `${SUPA_URL}/rest/v1/matches?select=*&or=(host_id.eq.${encodeURIComponent(profilId)},gosc_id.eq.${encodeURIComponent(profilId)})&order=utworzono.desc${limitQuery}`;
                    const res = await fetch(url, {
                        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
                        cache: "no-store",
                        signal: controller.signal,
                    }).finally(() => clearTimeout(timerId));

                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data) && data.length > 0) {
                            meczeZdalne = data;
                        }
                    }
                } catch (_) {}
            }

            if (meczeZdalne.length === 0 && client) {
                try {
                    const { data, error } = await zLimitemCzasu(client.from("matches").select("*").or(`host_id.eq.${profilId},gosc_id.eq.${profilId}`).order("utworzono", { ascending: false }).limit(limitLiczba), "odczyt meczy z Supabase SDK", 4000);
                    if (!error && Array.isArray(data) && data.length > 0) {
                        meczeZdalne = data;
                    }
                } catch (_) {}
            }

            let meczeLokalne = [];
            if (czyMojProfil) {
                try {
                    const rawLocal = localStorage.getItem("sd_historia_meczow");
                    if (rawLocal) {
                        const parsed = JSON.parse(rawLocal);
                        if (Array.isArray(parsed)) meczeLokalne = parsed;
                    }
                } catch (_) {}
            }

            const znormalizowaneZdalne = meczeZdalne.map((m) => normalizujMecz(m, profilId, nazwaGracza));
            const znormalizowaneLokalne = meczeLokalne.map((m) => normalizujMecz(m, profilId, nazwaGracza));

            // Deduplikacja meczów zdalnych (np. gdy w meczu online obaj gracze wysłali ten sam pojedynek do bazy)
            const unikalneZdalne = [];
            for (const zm of znormalizowaneZdalne) {
                const czyDuplikat = unikalneZdalne.some((istniejacy) => {
                    const tenSamRywal = (istniejacy._przeciwnikNazwa || "").trim().toLowerCase() === (zm._przeciwnikNazwa || "").trim().toLowerCase();
                    const tenSamWynik = istniejacy._wynik === zm._wynik;
                    if (!tenSamRywal || !tenSamWynik) return false;

                    const taSamaData = istniejacy._dataMeczu === zm._dataMeczu;
                    if (!taSamaData) return false;

                    const roznicaCzasu = Math.abs((istniejacy._timestamp || 0) - (zm._timestamp || 0));
                    // Jeśli mecze powstały w odstępie poniżej 10 minut
                    if (roznicaCzasu > 0 && roznicaCzasu < 600000) return true;

                    // Lub jeśli średnie graczy są identyczne (duplikat tego samego meczu)
                    const taSamaSredniaJa = istniejacy._jaSrednia && istniejacy._jaSrednia === zm._jaSrednia;
                    const taSamaSredniaRywal = istniejacy._rywalSrednia && istniejacy._rywalSrednia === zm._rywalSrednia;
                    if (taSamaSredniaJa && taSamaSredniaRywal) return true;

                    return false;
                });

                if (!czyDuplikat) {
                    unikalneZdalne.push(zm);
                }
            }

            const zdalneSygnatury = new Set(unikalneZdalne.map((zm) => `${zm._dataMeczu}_${zm._wynik}_${zm._przeciwnikNazwa}`));
            const brakujaceLokalne = znormalizowaneLokalne.filter((lm) => !zdalneSygnatury.has(`${lm._dataMeczu}_${lm._wynik}_${lm._przeciwnikNazwa}`));
            const scalone = [...unikalneZdalne, ...brakujaceLokalne];
            scalone.sort((a, b) => (b._timestamp || 0) - (a._timestamp || 0));

            return limit ? scalone.slice(0, limit) : scalone;
        }

        function renderujListeMeczow(meczeDoWyswietlenia) {
            const listaMeczy = document.getElementById("lista-ostatnich-meczy");
            if (!listaMeczy) return;
            ostatnieMeczeCache = meczeDoWyswietlenia || [];

            if (!meczeDoWyswietlenia || meczeDoWyswietlenia.length === 0) {
                listaMeczy.innerHTML = `<div style="text-align: center; padding: 15px; color: #94a3b8">Brak historii rozegranych pojedynków.</div>`;
                return;
            }

            listaMeczy.innerHTML = meczeDoWyswietlenia
                .map((m, idx) => {
                    const jaNazwa = m._jaNazwa || aktualnyProfil?.nazwa_gracza || "Gracz";
                    const rywalNazwa = m._przeciwnikNazwa || "Rywal";
                    const mojWynik = m._jaWynik !== undefined ? m._jaWynik : "-";
                    const rywalWynik = m._rywalWynik !== undefined ? m._rywalWynik : "-";
                    const mojeSr = m._jaSrednia !== undefined && m._jaSrednia !== null ? m._jaSrednia : "-";
                    const rywalSr = m._rywalSrednia !== undefined && m._rywalSrednia !== null ? m._rywalSrednia : "-";
                    const dataStr = m._dataMeczu || "-";

                    return `
                    <div class="mecz ${m._czyWygrana ? "wygrana" : "porazka"}">
                        <p class="mecz-data">${dataStr}</p>
                        <div class="dane-meczu">
                            <h3 class="gracz-nazwa gracz-1">${jaNazwa}</h3>
                            <p class="mecz-vs">vs</p>
                            <h3 class="gracz-nazwa gracz-2">${rywalNazwa}</h3>

                            <h4 class="wynik-punkty wynik-1">${mojWynik}</h4>
                            <p class="wynik-separator">:</p>
                            <h4 class="wynik-punkty wynik-2">${rywalWynik}</h4>

                            <p class="srednia-wartosc srednia-1">${mojeSr}</p>
                            <p class="srednia-etykieta">Średnia</p>
                            <p class="srednia-wartosc srednia-2">${rywalSr}</p>
                        </div>
                        <button type="button" class="btn-przebieg-profil" onclick="otworzSzczegolyMeczu(${idx})">Zobacz mecz</button>
                    </div>`;
                })
                .join("");
        }

        function podepnijObslugeWszystkichMeczow(profilId, nazwaGracza, czyMojProfil) {
            const kontenerWiecej = document.getElementById("kontener-wiecej-meczy");
            const btnWiecej = document.getElementById("btn-zobacz-wszystkie-mecze");
            if (!kontenerWiecej || !btnWiecej) return;

            btnWiecej.onclick = async () => {
                if (btnWiecej.disabled) return;

                if (pelnaHistoriaMeczowCache) {
                    if (czyWszystkieMeczeRozwiniete) {
                        renderujListeMeczow(pelnaHistoriaMeczowCache.slice(0, 5));
                        btnWiecej.textContent = "Zobacz wszystkie mecze";
                        czyWszystkieMeczeRozwiniete = false;
                    } else {
                        renderujListeMeczow(pelnaHistoriaMeczowCache);
                        btnWiecej.textContent = "Zwiń mecze";
                        czyWszystkieMeczeRozwiniete = true;
                    }
                    return;
                }

                btnWiecej.disabled = true;
                const staryTekst = btnWiecej.textContent;
                btnWiecej.textContent = "Ładowanie meczów...";

                try {
                    const wszystkieMecze = await pobierzHistorieMeczow(profilId, nazwaGracza, czyMojProfil, 0);
                    pelnaHistoriaMeczowCache = wszystkieMecze || [];
                    renderujListeMeczow(pelnaHistoriaMeczowCache);

                    if (pelnaHistoriaMeczowCache.length > 5) {
                        btnWiecej.textContent = "Zwiń mecze";
                        btnWiecej.disabled = false;
                        czyWszystkieMeczeRozwiniete = true;
                    } else {
                        kontenerWiecej.style.display = "none";
                    }
                } catch (err) {
                    console.error("Błąd pobierania wszystkich meczów:", err);
                    btnWiecej.disabled = false;
                    btnWiecej.textContent = staryTekst;
                    alert("Nie udało się pobrać wszystkich meczów. Spróbuj ponownie.");
                }
            };
        }

        async function sprawdzRelacjeZnajomego(mojId, celId, token = null) {
            if (!mojId || !celId || mojId === celId) return;
            const btnDodaj = document.getElementById("btn-dodaj-znajomego");
            if (!btnDodaj) return;

            try {
                let relacje = null;
                let accessToken = token;
                if (!accessToken && client?.auth) {
                    try {
                        const { data: sd } = await client.auth.getSession();
                        accessToken = sd?.session?.access_token || null;
                    } catch (_) {}
                }

                try {
                    const resWorker = await fetch("/api/supabase-read", {
                        method: "POST",
                        headers: { apikey: SUPA_KEY, "Content-Type": "application/json" },
                        body: JSON.stringify({
                            table: "znajomi",
                            params: { select: "id,zapraszajacy_id,zapraszany_id,status", or: `(and(zapraszajacy_id.eq.${mojId},zapraszany_id.eq.${celId}),and(zapraszajacy_id.eq.${celId},zapraszany_id.eq.${mojId}))` },
                            accessToken,
                        }),
                        cache: "no-store",
                    });
                    if (resWorker.ok) {
                        const data = await resWorker.json();
                        if (Array.isArray(data)) relacje = data;
                    }
                } catch (_) {}

                if ((!relacje || !relacje.length) && client) {
                    try {
                        const { data } = await zLimitemCzasu(client.from("znajomi").select("*").or(`and(zapraszajacy_id.eq.${mojId},zapraszany_id.eq.${celId}),and(zapraszajacy_id.eq.${celId},zapraszany_id.eq.${mojId})`), "sprawdzanie relacji", 3500);
                        if (data) relacje = data;
                    } catch (_) {}
                }

                const relacja = Array.isArray(relacje) && relacje.length > 0 ? relacje[0] : null;
                if (relacja) {
                    if (relacja.status === "zaakceptowane") {
                        btnDodaj.textContent = "✓ Twój znajomy";
                        btnDodaj.className = "btn-zaakceptowane-zaproszenie";
                        btnDodaj.disabled = true;
                    } else if (relacja.status === "oczekujace") {
                        if (relacja.zapraszajacy_id === mojId) {
                            btnDodaj.textContent = "⏳ Wysłano zaproszenie";
                            btnDodaj.className = "btn-wyslano-zaproszenie";
                            btnDodaj.disabled = true;
                        } else {
                            btnDodaj.textContent = "Oczekuje! Akceptuj";
                            btnDodaj.className = "btn-primary";
                            btnDodaj.setAttribute("data-relacja-id", relacja.id);
                        }
                    }
                }
            } catch (eRel) {
                console.warn("Sprawdzanie relacji znajomego pominięte:", eRel);
            }
        }

        async function usunStareAvatary(userId, zachowajPlikNazwa = null) {
            try {
                const cleanUserId = String(userId).trim();
                const isProd = window.location.hostname === "stacjadarta.pl";
                let plikiDoUsuniecia = [];

                if (isProd) {
                    try {
                        const resList = await fetch(`/api/supabase/storage/v1/object/list/avatary`, {
                            method: "POST",
                            headers: {
                                apikey: SUPA_KEY,
                                Authorization: `Bearer ${SUPA_KEY}`,
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ prefix: cleanUserId, limit: 100 }),
                        });
                        if (resList.ok) {
                            const lista = await resList.json();
                            if (Array.isArray(lista)) {
                                plikiDoUsuniecia = lista.filter((item) => item.name && item.name !== zachowajPlikNazwa && item.name !== ".emptyFolderPlaceholder").map((item) => `${cleanUserId}/${item.name}`);
                            }
                        }
                    } catch (_) {}
                } else if (client?.storage) {
                    try {
                        const { data: lista, error } = await client.storage.from("avatary").list(cleanUserId);
                        if (!error && Array.isArray(lista)) {
                            plikiDoUsuniecia = lista.filter((item) => item.name && item.name !== zachowajPlikNazwa && item.name !== ".emptyFolderPlaceholder").map((item) => `${cleanUserId}/${item.name}`);
                        }
                    } catch (_) {}
                }

                if (plikiDoUsuniecia.length === 0) return;

                if (isProd) {
                    try {
                        await fetch(`/api/supabase/storage/v1/object/avatary`, {
                            method: "DELETE",
                            headers: {
                                apikey: SUPA_KEY,
                                Authorization: `Bearer ${SUPA_KEY}`,
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ prefixes: plikiDoUsuniecia }),
                        });
                    } catch (_) {}
                } else if (client?.storage) {
                    await client.storage
                        .from("avatary")
                        .remove(plikiDoUsuniecia)
                        .catch(() => {});
                }
            } catch (err) {
                console.warn("Nie udało się usunąć starych avatarów:", err);
            }
        }

        async function kompresujAwatar(plikZrodlowy, maxRozmiar = 320, jakosc = 0.85) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = () => reject(new Error("Błąd odczytu pliku"));
                reader.onload = (e) => {
                    const img = new Image();
                    img.onerror = () => reject(new Error("Nieprawidłowy format obrazu"));
                    img.onload = () => {
                        let { width, height } = img;
                        const minBok = Math.min(width, height);
                        const startX = (width - minBok) / 2;
                        const startY = (height - minBok) / 2;
                        const docelowyRozmiar = Math.min(minBok, maxRozmiar);

                        const canvas = document.createElement("canvas");
                        canvas.width = docelowyRozmiar;
                        canvas.height = docelowyRozmiar;
                        const ctx = canvas.getContext("2d");
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = "high";
                        ctx.drawImage(img, startX, startY, minBok, minBok, 0, 0, docelowyRozmiar, docelowyRozmiar);

                        canvas.toBlob(
                            (blob) => {
                                if (blob) {
                                    resolve({ blob, ext: "webp", mime: "image/webp" });
                                } else {
                                    canvas.toBlob((jpegBlob) => resolve({ blob: jpegBlob, ext: "jpg", mime: "image/jpeg" }), "image/jpeg", jakosc);
                                }
                            },
                            "image/webp",
                            jakosc,
                        );
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(plikZrodlowy);
            });
        }

        window.otworzSzczegolyMeczu = function (index) {
            const mecz = ostatnieMeczeCache[index];
            if (!mecz) return;

            const modalPrzebiegu = document.getElementById("modal-przebiegu");
            const kontenerZakladek = document.getElementById("kontener-zakladek");
            const kontenerTabeleLegow = document.getElementById("kontener-tabele-legow");
            if (!modalPrzebiegu || !kontenerZakladek || !kontenerTabeleLegow) return;

            const legi = mecz.pelny_przebieg_meczu || mecz.historiaMeczuLegi || [];
            const statystyki = Array.isArray(mecz.statystyki_graczy) && mecz.statystyki_graczy.length > 0 ? mecz.statystyki_graczy : Array.isArray(mecz.gracze) ? mecz.gracze : [];

            if (legi.length === 0 && statystyki.length === 0) {
                alert("Brak szczegółowych danych dla tego pojedynku.");
                return;
            }

            const tytulModala = document.querySelector("#modal-przebiegu h2");
            if (tytulModala) tytulModala.textContent = `Mecz: ${mecz.format_gry || "Klasyczny"}`;

            kontenerZakladek.innerHTML = "";
            kontenerTabeleLegow.innerHTML = "";

            const gracze =
                statystyki.length > 0
                    ? statystyki
                    : mecz.graczeInfo || [
                          { id: 0, nazwa: "Gospodarz" },
                          { id: 1, nazwa: "Gość" },
                      ];

            const btnTabGlowneStats = document.createElement("button");
            btnTabGlowneStats.className = "przycisk-zakladki aktywna";
            btnTabGlowneStats.textContent = "Statystyki";

            const btnTabGlownePrzebieg = document.createElement("button");
            btnTabGlownePrzebieg.className = "przycisk-zakladki";
            btnTabGlownePrzebieg.textContent = "Przebieg";

            kontenerZakladek.appendChild(btnTabGlowneStats);
            kontenerZakladek.appendChild(btnTabGlownePrzebieg);

            const divWidokStats = document.createElement("div");
            divWidokStats.className = "zawartosc-zakladki aktywna";
            divWidokStats.id = "widok-statystyki-meczu";

            if (statystyki.length > 0) {
                const szerokoscKol = Math.floor(70 / gracze.length);
                let htmlStats = `
                    <table class="tabela-przebiegu" style="margin-top: 10px;">
                        <thead>
                            <tr>
                                <th style="width: 30%; text-align: left; padding-left: 14px;">Metryka</th>
                `;
                gracze.forEach((g) => {
                    htmlStats += `<th style="width: ${szerokoscKol}%; color: #38bdf8; font-size: 15px;">${g.nazwa}</th>`;
                });
                htmlStats += `</tr></thead><tbody>`;

                const wiersze = [
                    { tytul: "Wygrane Legi", klucz: "wygraneLegi" },
                    { tytul: "Średnia meczu", klucz: "srednia" },
                    { tytul: "Średnia 9 lotek", klucz: "srednia9" },
                    { tytul: "Najlepszy leg", klucz: "najlepszyLeg" },
                    { tytul: "Najlepszy rzut", klucz: "najlepszyRzut" },
                    { tytul: "Najwyższy finisz", klucz: "najwyzszyCheckout" },
                    { tytul: "Liczba 180", klucz: "liczba180" },
                    { tytul: "Skuteczność Double", klucz: "skutecznoscDouble" },
                ];

                wiersze.forEach((w) => {
                    htmlStats += `<tr><td style="text-align: left; padding-left: 14px; font-weight: 600; color: #94a3b8;">${w.tytul}</td>`;
                    gracze.forEach((g) => {
                        let wartosc = g[w.klucz] !== undefined && g[w.klucz] !== null && g[w.klucz] !== 0 ? g[w.klucz] : "-";
                        if (w.klucz === "najwyzszyCheckout" && (wartosc === "-" || wartosc === 0) && Array.isArray(legi)) {
                            let maxChk = 0;
                            legi.forEach((leg) => {
                                const ost = Array.isArray(leg) && leg.length > 0 ? leg[leg.length - 1] : null;
                                if (ost && ost.graczId === g.id && ost.punktyPrzed > 0 && ost.punktyPo === 0) {
                                    if (ost.punktyPrzed > maxChk) maxChk = ost.punktyPrzed;
                                }
                            });
                            if (maxChk > 0) wartosc = maxChk;
                        }
                        htmlStats += `<td><strong>${wartosc}</strong></td>`;
                    });
                    htmlStats += `</tr>`;
                });

                htmlStats += `</tbody></table>`;
                divWidokStats.innerHTML = htmlStats;
            } else {
                divWidokStats.innerHTML = `<div style="text-align: center; padding: 30px; color: #94a3b8;">Brak zapisanych statystyk sumarycznych dla tego pojedynku.</div>`;
            }

            const divWidokPrzebieg = document.createElement("div");
            divWidokPrzebieg.className = "zawartosc-zakladki";
            divWidokPrzebieg.id = "widok-przebieg-meczu";

            if (legi.length > 0) {
                const subPasekLegow = document.createElement("div");
                subPasekLegow.className = "kontener-zakladek";
                subPasekLegow.style.marginTop = "10px";
                subPasekLegow.style.borderBottom = "1px solid rgba(255, 255, 255, 0.1)";

                const subKontenerTabel = document.createElement("div");

                legi.forEach((legData, legIdx) => {
                    const btnLeg = document.createElement("button");
                    btnLeg.className = `przycisk-zakladki ${legIdx === 0 ? "aktywna" : ""}`;
                    btnLeg.textContent = `Leg ${legIdx + 1}`;
                    btnLeg.style.fontSize = "13px";
                    btnLeg.style.padding = "6px 14px";

                    btnLeg.addEventListener("click", () => {
                        subPasekLegow.querySelectorAll(".przycisk-zakladki").forEach((b) => b.classList.remove("aktywna"));
                        subKontenerTabel.querySelectorAll(".zawartosc-zakladki").forEach((t) => t.classList.remove("aktywna"));
                        btnLeg.classList.add("aktywna");
                        document.getElementById(`sub-leg-${legIdx}`)?.classList.add("aktywna");
                    });
                    subPasekLegow.appendChild(btnLeg);

                    const divTabelaLega = document.createElement("div");
                    divTabelaLega.className = `zawartosc-zakladki ${legIdx === 0 ? "aktywna" : ""}`;
                    divTabelaLega.id = `sub-leg-${legIdx}`;

                    const szerokoscKolumny = Math.floor(90 / gracze.length);
                    const srednieWLegu = {};

                    gracze.forEach((g) => {
                        const rzutyGracza = legData.filter((r) => r.graczId === g.id);
                        const sumaPkt = rzutyGracza.reduce((sum, r) => sum + r.rzut, 0);
                        const iloscKolejek = rzutyGracza.length;
                        srednieWLegu[g.id] = iloscKolejek > 0 ? (sumaPkt / iloscKolejek).toFixed(2) : "0.00";
                    });

                    let htmlTabeli = `
                        <table class="tabela-przebiegu">
                            <thead>
                                <tr>
                                    <th style="width: 10%;">Kolejka</th>
                    `;
                    gracze.forEach((g) => {
                        htmlTabeli += `<th style="width: ${szerokoscKolumny}%; color: #fff;">
                            ${g.nazwa}<br>
                            <span style="font-size: 11px; color: #38bdf8; font-weight: normal;">Śr: ${srednieWLegu[g.id]}</span>
                        </th>`;
                    });
                    htmlTabeli += `</tr></thead><tbody>`;

                    const rundyMap = {};
                    legData.forEach((rekord) => {
                        if (!rundyMap[rekord.kolejka]) rundyMap[rekord.kolejka] = {};
                        rundyMap[rekord.kolejka][rekord.graczId] = rekord;
                    });

                    Object.keys(rundyMap).forEach((kol) => {
                        htmlTabeli += `<tr><td><strong>${kol}</strong></td>`;
                        gracze.forEach((g) => {
                            const rzutG = rundyMap[kol][g.id];
                            const cel = rzutG ? `<strong>${rzutG.punktyPo}</strong><br><span style="color:#888;">${rzutG.szczegoly === "0" ? '<span class="fura-tekst">0</span>' : "Zdobyte: " + rzutG.szczegoly}</span>` : "-";
                            htmlTabeli += `<td>${cel}</td>`;
                        });
                        htmlTabeli += `</tr>`;
                    });

                    htmlTabeli += `</tbody></table>`;
                    divTabelaLega.innerHTML = htmlTabeli;
                    subKontenerTabel.appendChild(divTabelaLega);
                });

                divWidokPrzebieg.appendChild(subPasekLegow);
                divWidokPrzebieg.appendChild(subKontenerTabel);
            } else {
                divWidokPrzebieg.innerHTML = `<div style="text-align: center; padding: 30px; color: #94a3b8;">Brak szczegółowego zapisu rzutów dla tego pojedynku.</div>`;
            }

            kontenerTabeleLegow.appendChild(divWidokStats);
            kontenerTabeleLegow.appendChild(divWidokPrzebieg);

            btnTabGlowneStats.addEventListener("click", () => {
                btnTabGlowneStats.classList.add("aktywna");
                btnTabGlownePrzebieg.classList.remove("aktywna");
                divWidokStats.classList.add("aktywna");
                divWidokPrzebieg.classList.remove("aktywna");
            });

            btnTabGlownePrzebieg.addEventListener("click", () => {
                btnTabGlownePrzebieg.classList.add("aktywna");
                btnTabGlowneStats.classList.remove("aktywna");
                divWidokPrzebieg.classList.add("aktywna");
                divWidokStats.classList.remove("aktywna");
            });

            modalPrzebiegu.style.display = "flex";
        };

        // ==============================================================================
        // 7. ASYNCHRONICZNE POBIERANIE STATYSTYK Z BAZY DANYCH SUPABASE
        // ==============================================================================
        async function zaladujStatystykiGracza(profilWejsciowy = null, meczeWejsciowe = null) {
            try {
                let profil = profilWejsciowy;
                if (!profil || typeof profil !== "object") {
                    const klient = supaClient || client;
                    if (!klient) return;

                    let graczId = typeof profilWejsciowy === "string" ? profilWejsciowy : null;
                    const params = new URLSearchParams(window.location.search);
                    if (params.get("id")) graczId = params.get("id");
                    else if (params.get("gracz")) graczId = params.get("gracz");
                    else if (aktualnyUser?.id) graczId = aktualnyUser.id;

                    if (!graczId) return;

                    let query = klient.from("profiles").select("*");
                    const isUUID = typeof graczId === "string" && (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(graczId) || (graczId.includes("-") && graczId.length >= 32));
                    if (isUUID) {
                        query = query.eq("id", graczId);
                    } else {
                        query = query.ilike("nazwa_gracza", graczId);
                    }

                    const { data: pData, error: profErr } = await query.maybeSingle();
                    if (profErr || !pData) {
                        console.warn("Nie udało się pobrać profilu z bazy Supabase:", profErr);
                        return;
                    }
                    profil = pData;
                }

                const sbg = profil.stats_by_game || {};

                // Pobierz mecze z tabeli matches dla Klasycznej
                let historiaKlasyczna = [];
                let rawMatches = meczeWejsciowe;
                if (!rawMatches || !Array.isArray(rawMatches) || rawMatches.length === 0) {
                    try {
                        rawMatches = await pobierzHistorieMeczow(profil.id, profil.nazwa_gracza, Boolean(aktualnyUser && profil.id === aktualnyUser.id), 50);
                    } catch (_) {}
                }

                if (Array.isArray(rawMatches) && rawMatches.length > 0) {
                    // Posortuj mecze chronologicznie (od najstarszego do najnowszego) na potrzeby osi czasu wykresu
                    const meczeChronologicznie = [...rawMatches].sort((a, b) => {
                        const tA = a._timestamp || (a.utworzono ? new Date(a.utworzono).getTime() : 0);
                        const tB = b._timestamp || (b.utworzono ? new Date(b.utworzono).getTime() : 0);
                        return tA - tB;
                    });

                    historiaKlasyczna = meczeChronologicznie.map((m) => {
                        const stats = Array.isArray(m.statystyki_graczy) ? m.statystyki_graczy : [];
                        const nickLower = (profil.nazwa_gracza || "").trim().toLowerCase();
                        const mojStat = stats.find((s) => {
                            if (s?.id && profil.id && String(s.id) === String(profil.id)) return true;
                            if (nickLower && (s?.nazwa || "").trim().toLowerCase() === nickLower) return true;
                            return false;
                        }) || (m.host_id === profil.id ? stats[0] : stats[1]) || stats[0] || {};
                        const rywalStat = stats.find((s) => s !== mojStat) || (m.host_id === profil.id ? stats[1] : stats[0]) || {};

                        let dataFmt = m._dataMeczu || "-";
                        if (dataFmt === "-" && m.utworzono) {
                            const d = new Date(m.utworzono);
                            dataFmt = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
                        }

                        const czyHost = m.host_id === profil.id;
                        const wynikStr = m._wynik || (czyHost ? `${m.wynik_host ?? 0}:${m.wynik_gosc ?? 0}` : `${m.wynik_gosc ?? 0}:${m.wynik_host ?? 0}`);

                        const sr3 = parseFloat(mojStat.srednia) || parseFloat(m._jaSrednia) || 0;
                        const sr9 = parseFloat(mojStat.srednia9) || 0;

                        return {
                            data: dataFmt,
                            srednia: sr3,
                            srednia9: sr9,
                            rywal: m._przeciwnikNazwa || rywalStat.nazwa || "Rywal",
                            format: m.format_gry || "501 DO",
                            wynik: wynikStr,
                            highest_score: mojStat.najlepszyRzut || mojStat.highestScore || mojStat.hs || 0,
                            highest_finish: mojStat.najwyzszyCheckout || mojStat.highestFinish || mojStat.hf || 0,
                            checkout: mojStat.najlepszyRzut || mojStat.highestScore || mojStat.hs || 0,
                        };
                    });
                }

                // 1. Klasyczna
                const klasSbg = sbg.klasyczna || {};
                DANE_STATYSTYK.klasyczna = {
                    mecze: profil.rozegrane_mecze ?? klasSbg.mecze ?? 0,
                    srednia: parseFloat(profil.srednia ?? klasSbg.srednia ?? 0),
                    srednia_9: parseFloat(profil.srednia_9_lotek ?? klasSbg.srednia_9 ?? 0),
                    wygrane: profil.wygrane_mecze ?? klasSbg.wygrane ?? 0,
                    ilosc_180: profil.ilosc_180 ?? klasSbg.ilosc_180 ?? 0,
                    najwyzszy_checkout: profil.najwyzszy_checkout ?? klasSbg.najwyzszy_checkout ?? 0,
                    historia_meczow: historiaKlasyczna.length > 0 ? historiaKlasyczna : klasSbg.historia_meczow || DANE_STATYSTYK.klasyczna.historia_meczow || [],
                };

                // 2. Shanghai
                if (sbg.shanghai) {
                    let histSh = Array.isArray(sbg.shanghai.historia_meczow) ? [...sbg.shanghai.historia_meczow] : [];
                    if (histSh.length === 0 && (sbg.shanghai.mecze || 0) > 0) {
                        const m = sbg.shanghai.mecze || 1;
                        const pktNaMecz = Math.round((sbg.shanghai.suma_punktow || 0) / m);
                        const sr = sbg.shanghai.srednia_na_gre || parseFloat((pktNaMecz / 7).toFixed(1));
                        for (let i = 1; i <= m; i++) {
                            histSh.push({
                                data: `Gra ${i}`,
                                srednia: sr,
                                punkty: pktNaMecz,
                                shanghai: i <= (sbg.shanghai.liczba_shanghai || 0) ? 1 : 0,
                                rywal: "Trening 1-7",
                            });
                        }
                    }

                    histSh = histSh.map((m) => {
                        let rywal = m.rywal || "Trening 1-7";
                        let punkty = Number(m.punkty) || 0;
                        let shanghai = Boolean(m.shanghai || m.czyZrobilShanghai);
                        let srednia = Number(m.srednia) || 0;

                        let rundyLiczba = Number(m.rundyLiczba) || (punkty > 252 ? 20 : shanghai && punkty <= 24 ? 1 : 7);
                        if (punkty > 252 && (rywal === "Trening 1-7" || !rywal)) {
                            rywal = "Trening 1-20";
                        }

                        if (rundyLiczba === 20 && Math.abs(srednia - parseFloat((punkty / 7).toFixed(1))) < 0.2) {
                            srednia = parseFloat((punkty / 20).toFixed(1));
                        } else if (shanghai && punkty <= 24 && Math.abs(srednia - parseFloat((punkty / 7).toFixed(1))) < 0.2) {
                            srednia = punkty;
                        }

                        let rzuty = Number(m.rzuty) || rundyLiczba * 3;
                        let trafienia = Number(m.trafienia) || 0;
                        let skutecznosc = m.skutecznosc !== null && m.skutecznosc !== undefined ? Number(m.skutecznosc) : 0;

                        if (rzuty > 0 && trafienia > 0) {
                            skutecznosc = parseFloat(((trafienia / rzuty) * 100).toFixed(1));
                        } else if (shanghai && punkty <= 24) {
                            trafienia = 3;
                            rzuty = 3;
                            skutecznosc = 100.0;
                        } else if (punkty > 0 && skutecznosc <= 0) {
                            const ogolneTraf = Number(sbg.shanghai.suma_trafien) || 0;
                            const ogolneRzut = Number(sbg.shanghai.suma_rzutow) || 0;
                            if (ogolneTraf > 0 && ogolneRzut > 0) {
                                const pozostaleTraf = Math.max(1, ogolneTraf - (shanghai ? 0 : 3));
                                const estTraf = Math.min(rzuty, pozostaleTraf);
                                trafienia = estTraf;
                                skutecznosc = parseFloat(((trafienia / rzuty) * 100).toFixed(1));
                            } else {
                                skutecznosc = Math.min(100, parseFloat(((punkty / 1200) * 100).toFixed(1)));
                                trafienia = Math.round((skutecznosc / 100) * rzuty);
                            }
                        }

                        return {
                            ...m,
                            rywal,
                            srednia,
                            punkty,
                            shanghai: shanghai ? 1 : 0,
                            skutecznosc,
                            rundyLiczba,
                        };
                    });

                    let rundySh = sbg.shanghai.rundy || {};
                    if (Object.keys(rundySh).length === 0 && (sbg.shanghai.suma_punktow || 0) > 0) {
                        const m = sbg.shanghai.mecze || 1;
                        const cele = [1, 2, 3, 4, 5, 6, 7];
                        const sumaPkt = sbg.shanghai.suma_punktow || m * 21;
                        const pktNaRunde = Math.max(1, Math.round(sumaPkt / 7));
                        rundySh = {};
                        cele.forEach((cel) => {
                            const p = Math.max(cel, Math.round((pktNaRunde * cel) / 4));
                            const traf = Math.min(3 * m, Math.max(1, Math.round(p / cel)));
                            rundySh[String(cel)] = {
                                rzuty: 3 * m,
                                trafienia: traf,
                                punkty: p,
                                single: traf,
                                double: 0,
                                triple: 0,
                                shanghai: (sbg.shanghai.liczba_shanghai || 0) > 0 && cel === 7,
                            };
                        });
                    }

                    DANE_STATYSTYK.shanghai = {
                        ...DANE_STATYSTYK.shanghai,
                        ...sbg.shanghai,
                        rundy: rundySh,
                        historia_meczow: histSh,
                    };
                }

                // 3. Around The World
                if (sbg.around_the_world) {
                    let histAtw = Array.isArray(sbg.around_the_world.historia_meczow) ? [...sbg.around_the_world.historia_meczow] : [];
                    if (histAtw.length === 0 && (sbg.around_the_world.mecze || 0) > 0) {
                        const m = sbg.around_the_world.mecze || 1;
                        const rzutyNaMecz = Math.round((sbg.around_the_world.suma_rzutow || 0) / m);
                        const trafNaMecz = Math.round((sbg.around_the_world.suma_trafien || 0) / m);
                        const proc = sbg.around_the_world.skutecznosc || (rzutyNaMecz > 0 ? parseFloat(((trafNaMecz / rzutyNaMecz) * 100).toFixed(1)) : 0);
                        for (let i = 1; i <= m; i++) {
                            histAtw.push({
                                data: `Gra ${i}`,
                                skutecznosc: proc,
                                lotki: rzutyNaMecz,
                                rzuty: rzutyNaMecz,
                                trafienia: trafNaMecz,
                                rywal: "Trening 1-25",
                            });
                        }
                    }
                    let sektoryAtw = sbg.around_the_world.sektory || {};
                    if (Object.keys(sektoryAtw).length === 0 && (sbg.around_the_world.suma_rzutow || 0) > 0) {
                        const m = sbg.around_the_world.mecze || 1;
                        const cele = [];
                        for (let i = 1; i <= 20; i++) cele.push(String(i));
                        cele.push("innerbull");

                        const trafRazem = sbg.around_the_world.suma_trafien || m * 21;
                        const rzutRazem = sbg.around_the_world.suma_rzutow || m * 39;
                        const bazoweTraf = Math.floor(trafRazem / cele.length);
                        const bazoweRzut = Math.floor(rzutRazem / cele.length);
                        let resztaTraf = trafRazem % cele.length;
                        let resztaRzut = rzutRazem % cele.length;

                        sektoryAtw = {};
                        cele.forEach((cel, idx) => {
                            const traf = bazoweTraf + (idx < resztaTraf ? 1 : 0);
                            const rz = Math.max(traf, bazoweRzut + (idx < resztaRzut ? 1 : 0));
                            sektoryAtw[cel] = {
                                rzuty: rz,
                                trafienia: traf,
                                single: traf,
                                double: 0,
                                triple: 0,
                            };
                        });
                    }

                    let rekordAtw = sbg.around_the_world.rekord_najmniej_lotek !== null && sbg.around_the_world.rekord_najmniej_lotek !== undefined && Number(sbg.around_the_world.rekord_najmniej_lotek) > 0 ? Number(sbg.around_the_world.rekord_najmniej_lotek) : null;
                    if (!rekordAtw && histAtw.length > 0) {
                        const w = histAtw.map((m) => Number(m.lotki || m.rzuty) || 0).filter((v) => v > 0);
                        if (w.length > 0) rekordAtw = Math.min(...w);
                    }

                    DANE_STATYSTYK.around_the_world = {
                        ...DANE_STATYSTYK.around_the_world,
                        ...sbg.around_the_world,
                        rekord_najmniej_lotek: rekordAtw,
                        sektory: sektoryAtw,
                        historia_meczow: histAtw,
                    };
                }

                // 4. 121 Checkout
                if (sbg.checkout_121) {
                    let histChk = Array.isArray(sbg.checkout_121.historia_meczow) ? [...sbg.checkout_121.historia_meczow] : [];
                    if (histChk.length === 0 && (sbg.checkout_121.podejscia || 0) > 0) {
                        const pod = sbg.checkout_121.podejscia || 1;
                        const suk = sbg.checkout_121.sukcesy || 0;
                        const proc = sbg.checkout_121.skutecznosc || parseFloat(((suk / pod) * 100).toFixed(1));
                        histChk.push({
                            data: "Sesja 1",
                            skutecznosc: proc,
                            max_poziom: sbg.checkout_121.max_poziom || 121,
                            sukcesy: suk,
                            podejscia: pod,
                            seria: sbg.checkout_121.najlepsza_seria || 0,
                        });
                    }
                    DANE_STATYSTYK.checkout_121 = {
                        ...DANE_STATYSTYK.checkout_121,
                        ...sbg.checkout_121,
                        historia_meczow: histChk,
                    };
                }

                // 5. Doubles
                if (sbg.doubles) {
                    let histDbl = Array.isArray(sbg.doubles.historia_meczow) ? [...sbg.doubles.historia_meczow] : [];
                    if (histDbl.length === 0 && (sbg.doubles.mecze || 0) > 0) {
                        const m = sbg.doubles.mecze || 1;
                        const rzutyNaMecz = Math.round((sbg.doubles.suma_rzutow || 0) / m);
                        const trafNaMecz = Math.round((sbg.doubles.suma_trafien || 0) / m);
                        const proc = sbg.doubles.skutecznosc || (rzutyNaMecz > 0 ? parseFloat(((trafNaMecz / rzutyNaMecz) * 100).toFixed(1)) : 0);
                        for (let i = 1; i <= m; i++) {
                            histDbl.push({
                                data: `Mecz ${i}`,
                                skutecznosc: proc,
                                trafienia: trafNaMecz,
                                rzuty: rzutyNaMecz,
                                rywal: "Trening D1-D20",
                                wynik: "W",
                            });
                        }
                    }
                    DANE_STATYSTYK.doubles = {
                        ...DANE_STATYSTYK.doubles,
                        ...sbg.doubles,
                        sektory: sbg.doubles.sektory || {},
                        historia_meczow: histDbl,
                    };
                }

                // 6. Sprzęt
                DANE_STATYSTYK.sprzet = {
                    barele: profil.barele,
                    shafty: profil.shafty,
                    groty: profil.groty,
                    tarcza: profil.tarcza,
                    auto_score: profil.auto_score,
                    druzyna: profil.druzyna,
                };

                // Zaktualizuj wszystkie widoki danymi z Supabase
                zaktualizujWszystkieStatystyki(DANE_STATYSTYK);

                console.log("Statystyki załadowane pomyślnie dla:", profil.nazwa_gracza, profil.id);
            } catch (err) {
                console.error("Błąd podczas ładowania statystyk:", err);
            }
        }

        // ==============================================================================
        // 8. GŁÓWNA FUNKCJA ŁADOWANIA PROFILU GRACZA
        // ==============================================================================
        let czyLadujeProfil = false;
        async function zaladujProfil() {
            if (czyLadujeProfil) return;
            czyLadujeProfil = true;
            try {
                let proby = 0;
                while (!client && proby < 30) {
                    client = window.supabaseKlient || window.supabaseClient;
                    if (client) break;
                    await new Promise((r) => setTimeout(r, 50));
                    proby++;
                }

                if (!client && window.supabase && typeof window.supabase.createClient === "function") {
                    client = window.supabase.createClient(SUPA_URL, SUPA_KEY);
                }
                supaClient = client;

                let session = null;
                if (client?.auth) {
                    try {
                        const { data } = await zLimitemCzasu(client.auth.getSession(), "odczyt sesji", 2500);
                        session = data?.session;
                    } catch (_) {}

                    if (!session) {
                        try {
                            const { data: userData } = await zLimitemCzasu(client.auth.getUser(), "weryfikacja użytkownika", 2500);
                            if (userData?.user) {
                                session = { user: userData.user };
                            }
                        } catch (_) {}
                    }
                }

                if (!session?.user) {
                    const localUser = odczytajZalogowanegoZStorage();
                    if (localUser) {
                        session = { user: localUser };
                    }
                }

                aktualnyUser = session?.user || null;

                const params = new URLSearchParams(window.location.search);
                const paramIdRaw = params.get("id") || params.get("gracz");
                const paramId = paramIdRaw ? decodeURIComponent(paramIdRaw).trim() : null;

                // Jeśli brak parametru w URL i brak zalogowanego usera -> przekierowanie do logowania
                if (!paramId && !aktualnyUser) {
                    window.location.href = "./logowanie.html";
                    return;
                }

                const targetIdent = paramId || aktualnyUser?.id;
                if (!targetIdent) {
                    window.location.href = "./logowanie.html";
                    return;
                }
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetIdent);

                let profil = null;

                // A. Worker /api/profiles
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 4000);
                    const resProxy = await fetch(`/api/profiles?id=${encodeURIComponent(targetIdent)}`, {
                        headers: { apikey: SUPA_KEY },
                        cache: "no-store",
                        signal: controller.signal,
                    }).finally(() => clearTimeout(timer));
                    if (resProxy.ok) {
                        const profiles = await resProxy.json();
                        const p = Array.isArray(profiles) ? profiles[0] : profiles;
                        if (p && p.id) profil = p;
                    }
                } catch (_) {}

                // A2. Worker /api/supabase-read
                if (!profil) {
                    try {
                        const pObj = isUUID ? { id: `eq.${targetIdent}` } : { nazwa_gracza: `ilike.${targetIdent}` };
                        const resRead = await fetch("/api/supabase-read", {
                            method: "POST",
                            headers: { apikey: SUPA_KEY, "Content-Type": "application/json" },
                            body: JSON.stringify({ table: "profiles", params: pObj }),
                        });
                        if (resRead.ok) {
                            const rows = await resRead.json();
                            if (Array.isArray(rows) && rows.length > 0 && rows[0].id) {
                                profil = rows[0];
                            }
                        }
                    } catch (_) {}
                }

                // A3. Proxy PostgREST /api/supabase-request
                if (!profil) {
                    try {
                        const filterParam = isUUID ? `id=eq.${encodeURIComponent(targetIdent)}` : `nazwa_gracza=ilike.${encodeURIComponent(targetIdent)}`;
                        const resReq = await fetch("/api/supabase-request", {
                            method: "POST",
                            headers: { apikey: SUPA_KEY, "Content-Type": "application/json" },
                            body: JSON.stringify({
                                path: `/rest/v1/profiles?${filterParam}&select=*`,
                                method: "GET",
                            }),
                        });
                        if (resReq.ok) {
                            const rows = await resReq.json();
                            if (Array.isArray(rows) && rows.length > 0 && rows[0].id) {
                                profil = rows[0];
                            }
                        }
                    } catch (_) {}
                }

                // B. Bezpośredni REST
                if (!profil) {
                    try {
                        const controller = new AbortController();
                        const timerId = setTimeout(() => controller.abort(), 4000);
                        const filterParam = isUUID ? `id=eq.${encodeURIComponent(targetIdent)}` : `nazwa_gracza=ilike.${encodeURIComponent(targetIdent)}`;
                        const resDirect = await fetch(`${SUPA_URL}/rest/v1/profiles?${filterParam}&select=*`, {
                            headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
                            cache: "no-store",
                            signal: controller.signal,
                        }).finally(() => clearTimeout(timerId));

                        if (resDirect.ok) {
                            const rows = await resDirect.json();
                            if (Array.isArray(rows) && rows.length > 0 && rows[0].id) {
                                profil = rows[0];
                            }
                        }
                    } catch (_) {}
                }

                // C. Supabase SDK
                if (!profil && client) {
                    try {
                        let q = client.from("profiles").select("*");
                        q = isUUID ? q.eq("id", targetIdent) : q.ilike("nazwa_gracza", targetIdent);
                        const { data } = await zLimitemCzasu(q.maybeSingle(), "odczyt profilu SDK", 4000);
                        if (data && data.id) profil = data;
                    } catch (_) {}
                }

                if (!profil) {
                    const elNick = document.getElementById("nazwa-uzytkownika");
                    if (elNick) elNick.textContent = "Nie znaleziono gracza";
                    return;
                }

                const finalProfilId = profil.id;
                const czyMojProfil = Boolean(aktualnyUser && finalProfilId === aktualnyUser.id);
                aktualnyProfil = profil;

                const metaNick = czyMojProfil ? aktualnyUser?.user_metadata?.username : null;
                const nazwaGracza = profil?.nazwa_gracza || metaNick || (czyMojProfil && aktualnyUser?.email ? aktualnyUser.email.split("@")[0] : "Gracz");

                if (czyMojProfil && metaNick && profil && profil.nazwa_gracza !== metaNick && client) {
                    client.from("profiles").update({ nazwa_gracza: metaNick }).eq("id", aktualnyUser.id).then();
                }

                if (czyMojProfil && finalProfilId) {
                    zsynchronizujOstatnieIp(finalProfilId, profil?.ostatnie_ip);
                }

                // Wypełnienie nagłówka profilu
                const elNick = document.getElementById("nazwa-uzytkownika");
                if (elNick) elNick.textContent = nazwaGracza;

                const elZdjecie = document.getElementById("zdjecie-uzytkownika");
                if (elZdjecie) elZdjecie.src = profil?.avatar_url || "./loga/logo.png";

                const sr = parseFloat(profil?.srednia || 0);
                const tagRanga = document.getElementById("tag-ranga");
                if (tagRanga) {
                    let ranga = { nazwa: "Amator", ikona: "🌱", color: "#a3e635", border: "rgba(163, 230, 53, 0.3)" };
                    if (sr >= 70) ranga = { nazwa: "Mistrz", ikona: "💎", color: "#60a5fa", border: "rgba(96, 165, 250, 0.4)" };
                    else if (sr >= 55) ranga = { nazwa: "Ekspert", ikona: "🔥", color: "#f87171", border: "rgba(248, 113, 113, 0.4)" };
                    else if (sr >= 45) ranga = { nazwa: "Półzawodowiec", ikona: "🏆", color: "#fbbf24", border: "rgba(251, 191, 36, 0.4)" };
                    else if (sr >= 35) ranga = { nazwa: "Gracz Klubowy", ikona: "🎯", color: "#e2e8f0", border: "rgba(226, 232, 240, 0.3)" };

                    tagRanga.innerHTML = `${ranga.ikona} ${ranga.nazwa}`;
                    tagRanga.style.color = ranga.color;
                    tagRanga.style.backgroundColor = ranga.border.replace("0.3)", "0.1)").replace("0.4)", "0.15)");
                    tagRanga.style.border = `1px solid ${ranga.border}`;
                    tagRanga.style.display = "inline-flex";
                    const btnInfo = document.getElementById("btn-info-rangi");
                    if (btnInfo) btnInfo.style.display = "inline-flex";
                }

                if (profil?.utworzono) {
                    try {
                        const bezpiecznaData = profil.utworzono.replace(" ", "T");
                        const dataDolaczenia = new Date(bezpiecznaData).toLocaleDateString("pl-PL", { year: "numeric", month: "long" });
                        const tagData = document.getElementById("tag-data");
                        if (tagData) tagData.innerHTML = `🗓️ W Stacji od: ${dataDolaczenia}`;
                    } catch (_) {}
                }

                const rozegrane = profil?.rozegrane_mecze || 0;
                const wygrane = profil?.wygrane_mecze || 0;
                const winRate = rozegrane > 0 ? ((wygrane / rozegrane) * 100).toFixed(1) : "0.0";
                const headerWinrate = document.getElementById("header-winrate");
                if (headerWinrate) headerWinrate.textContent = `${winRate}%`;

                // Sprzęt
                const setEl = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = val && String(val).trim() !== "" ? val : "-";
                };
                setEl("barele-gracza", profil?.barele);
                setEl("shafty-gracza", profil?.shafty);
                setEl("groty-gracza", profil?.groty);
                setEl("tarcza-gracza", profil?.tarcza);
                setEl("autoscore-gracza", profil?.auto_score);
                setEl("druzyna-gracza", profil?.druzyna);

                // UI właściciela vs gościa
                const btnEdycja = document.getElementById("btn-edycja-profilu");
                const avatarOverlay = document.querySelector(".avatar-overlay");
                const avatarContainer = document.getElementById("avatar-container");
                const akcjeWlasciciela = document.getElementById("akcje-wlasciciela");
                const akcjeGoscia = document.getElementById("akcje-goscia");
                const btnDodaj = document.getElementById("btn-dodaj-znajomego");

                if (!czyMojProfil) {
                    if (btnEdycja) btnEdycja.style.display = "none";
                    if (avatarOverlay) avatarOverlay.style.display = "none";
                    if (avatarContainer) avatarContainer.style.pointerEvents = "none";
                    if (akcjeWlasciciela) akcjeWlasciciela.style.display = "none";
                    if (akcjeGoscia) akcjeGoscia.style.display = "flex";

                    if (btnDodaj) {
                        btnDodaj.setAttribute("data-rywal-id", finalProfilId);
                        if (aktualnyUser && aktualnyUser.id) {
                            sprawdzRelacjeZnajomego(aktualnyUser.id, finalProfilId, session?.access_token).catch(() => {});
                        } else {
                            btnDodaj.textContent = "Zaloguj się";
                            btnDodaj.onclick = () => (window.location.href = "./logowanie.html");
                        }
                    }
                } else {
                    if (btnEdycja) btnEdycja.style.display = "block";
                    if (avatarOverlay) avatarOverlay.style.display = "flex";
                    if (avatarContainer) avatarContainer.style.pointerEvents = "auto";
                    if (akcjeWlasciciela) akcjeWlasciciela.style.display = "flex";
                    if (akcjeGoscia) akcjeGoscia.style.display = "none";
                }

                // Historia meczów (pobieramy do 50 meczów od razu dla listy i wykresu)
                const mecze = await pobierzHistorieMeczow(finalProfilId, nazwaGracza, czyMojProfil, 50);
                pelnaHistoriaMeczowCache = mecze || [];
                renderujListeMeczow(mecze.slice(0, 5));

                const kontenerWiecej = document.getElementById("kontener-wiecej-meczy");
                const btnWiecej = document.getElementById("btn-zobacz-wszystkie-mecze");
                if (kontenerWiecej && btnWiecej) {
                    const maWiecejMeczow = (mecze && mecze.length > 5) || (profil?.rozegrane_mecze && profil.rozegrane_mecze > 5);
                    if (maWiecejMeczow) {
                        kontenerWiecej.style.display = "block";
                        btnWiecej.textContent = "Zobacz wszystkie mecze";
                        podepnijObslugeWszystkichMeczow(finalProfilId, nazwaGracza, czyMojProfil);
                    } else {
                        kontenerWiecej.style.display = "none";
                    }
                }

                // Wypełnienie wszystkich zakładek i wykresów z przekazaniem pobranych meczów
                await zaladujStatystykiGracza(profil, mecze);
            } catch (error) {
                console.error("Błąd krytyczny ładowania profilu:", error);
            } finally {
                czyLadujeProfil = false;
            }
        }

        // ==============================================================================
        // 9. INICJALIZACJA MODALI, AVATARA I ZDARZEŃ STRONY
        // ==============================================================================
        function zainicjalizujModaleIProfil() {
            const modalPrzebiegu = document.getElementById("modal-przebiegu");
            const btnZamknijPrzebieg = document.getElementById("zamknij-przebieg");
            btnZamknijPrzebieg?.addEventListener("click", () => {
                if (modalPrzebiegu) modalPrzebiegu.style.display = "none";
            });
            modalPrzebiegu?.addEventListener("click", (e) => {
                if (e.target === modalPrzebiegu) modalPrzebiegu.style.display = "none";
            });

            const modalInfoRangi = document.getElementById("modal-info-rangi");
            const btnInfoRangi = document.getElementById("btn-info-rangi");
            const btnZamknijInfoRangi = document.getElementById("btn-zamknij-info-rangi");

            btnInfoRangi?.addEventListener("click", () => {
                if (modalInfoRangi) modalInfoRangi.style.display = "flex";
            });
            btnZamknijInfoRangi?.addEventListener("click", () => {
                if (modalInfoRangi) modalInfoRangi.style.display = "none";
            });
            modalInfoRangi?.addEventListener("click", (e) => {
                if (e.target === modalInfoRangi) modalInfoRangi.style.display = "none";
            });

            const modal = document.getElementById("modal-edycja-profilu");
            const modalTytul = document.getElementById("modal-tytul");
            const formEdycja = document.getElementById("form-edycja-profilu");
            const blokUsunKonto = document.getElementById("usun-konto-blok");
            const blokWyloguj = document.getElementById("wyloguj-blok");
            const btnZamknijModal = document.getElementById("btn-zamknij-edycje");
            const przyciskiAnuluj = document.querySelectorAll(".btn-anuluj-modal");

            const zamknijWszystkieSekcjeModala = () => {
                if (modal) modal.style.display = "none";
                if (formEdycja) formEdycja.style.display = "none";
                if (blokUsunKonto) blokUsunKonto.style.display = "none";
                if (blokWyloguj) blokWyloguj.style.display = "none";
            };

            btnZamknijModal?.addEventListener("click", zamknijWszystkieSekcjeModala);
            przyciskiAnuluj.forEach((btn) => btn.addEventListener("click", zamknijWszystkieSekcjeModala));
            modal?.addEventListener("click", (e) => {
                if (e.target === modal) zamknijWszystkieSekcjeModala();
            });

            const btnSprzet = document.getElementById("sprzet-gracza");
            const strefaSprzetu = document.querySelector(".strefa-sprzetu");
            btnSprzet?.addEventListener("click", () => {
                btnSprzet.classList.toggle("aktywny");
                strefaSprzetu?.classList.toggle("otwarta");
            });

            document.getElementById("btn-edycja-profilu")?.addEventListener("click", () => {
                if (!aktualnyUser) aktualnyUser = odczytajZalogowanegoZStorage();
                if (!aktualnyUser) {
                    alert("Zaloguj się, aby edytować profil.");
                    return;
                }
                const obecnyNick = aktualnyProfil?.nazwa_gracza || aktualnyUser.user_metadata?.username || (aktualnyUser.email ? aktualnyUser.email.split("@")[0] : "");
                document.getElementById("edycja-nick").value = obecnyNick;
                document.getElementById("edycja-haslo").value = "";

                document.getElementById("edycja-barele").value = aktualnyProfil?.barele || "";
                document.getElementById("edycja-shafty").value = aktualnyProfil?.shafty || "";
                document.getElementById("edycja-groty").value = aktualnyProfil?.groty || "";
                document.getElementById("edycja-tarczy").value = aktualnyProfil?.tarcza || "";
                document.getElementById("edycja-auto-score").value = aktualnyProfil?.auto_score || "";
                document.getElementById("edycja-druzyny").value = aktualnyProfil?.druzyna || "";

                const statusDiv = document.getElementById("edycja-status");
                if (statusDiv) statusDiv.style.display = "none";

                modalTytul.textContent = "Edytuj profil";
                blokUsunKonto.style.display = "none";
                blokWyloguj.style.display = "none";
                formEdycja.style.display = "flex";
                modal.style.display = "flex";
            });

            formEdycja?.addEventListener("submit", async (e) => {
                e.preventDefault();
                const nowyNick = document.getElementById("edycja-nick").value.trim();
                const noweHaslo = document.getElementById("edycja-haslo").value;

                const noweBarele = document.getElementById("edycja-barele").value.trim();
                const noweShafty = document.getElementById("edycja-shafty").value.trim();
                const noweGroty = document.getElementById("edycja-groty").value.trim();
                const nowaTarcza = document.getElementById("edycja-tarczy").value.trim();
                const nowyAutoScore = document.getElementById("edycja-auto-score").value.trim();
                const nowaDruzyna = document.getElementById("edycja-druzyny").value.trim();

                const btnZapisz = document.getElementById("btn-zapisz-edycje");
                const statusDiv = document.getElementById("edycja-status");

                if (!nowyNick) {
                    if (statusDiv) {
                        statusDiv.textContent = "Nick nie może być pusty.";
                        statusDiv.style.color = "#f87171";
                        statusDiv.style.display = "block";
                    }
                    return;
                }

                btnZapisz.disabled = true;
                btnZapisz.textContent = "Zapisywanie...";
                if (statusDiv) {
                    statusDiv.textContent = "";
                    statusDiv.style.display = "none";
                }

                try {
                    if (!aktualnyUser) aktualnyUser = odczytajZalogowanegoZStorage();
                    if (!aktualnyUser) throw new Error("Musisz być zalogowany, aby zapisać profil.");

                    const profilUpdate = {
                        nazwa_gracza: nowyNick,
                        barele: noweBarele,
                        shafty: noweShafty,
                        groty: noweGroty,
                        tarcza: nowaTarcza,
                        auto_score: nowyAutoScore,
                        druzyna: nowaDruzyna,
                    };

                    await wykonajZapisProfilu(profilUpdate, aktualnyUser.id);

                    if (noweHaslo && client?.auth) {
                        const { error: passErr } = await zLimitemCzasu(client.auth.updateUser({ password: noweHaslo }), "aktualizacja hasła", 8000);
                        if (passErr) throw passErr;
                    }

                    if (client?.auth) {
                        try {
                            Promise.race([client.auth.updateUser({ data: { username: nowyNick, nazwa_gracza: nowyNick } }), new Promise((r) => setTimeout(r, 2000))]).catch(() => {});
                        } catch (_) {}
                    }

                    const elNick = document.getElementById("nazwa-uzytkownika");
                    if (elNick) elNick.textContent = nowyNick;

                    const setEl = (id, val) => {
                        const el = document.getElementById(id);
                        if (el) el.textContent = val && String(val).trim() !== "" ? val : "-";
                    };
                    setEl("barele-gracza", noweBarele);
                    setEl("shafty-gracza", noweShafty);
                    setEl("groty-gracza", noweGroty);
                    setEl("tarcza-gracza", nowaTarcza);
                    setEl("autoscore-gracza", nowyAutoScore);
                    setEl("druzyna-gracza", nowaDruzyna);

                    if (aktualnyProfil) {
                        aktualnyProfil.nazwa_gracza = nowyNick;
                        aktualnyProfil.barele = noweBarele;
                        aktualnyProfil.shafty = noweShafty;
                        aktualnyProfil.groty = noweGroty;
                        aktualnyProfil.tarcza = nowaTarcza;
                        aktualnyProfil.auto_score = nowyAutoScore;
                        aktualnyProfil.druzyna = nowaDruzyna;
                    }

                    DANE_STATYSTYK.sprzet = {
                        barele: noweBarele,
                        shafty: noweShafty,
                        groty: noweGroty,
                        tarcza: nowaTarcza,
                        auto_score: nowyAutoScore,
                        druzyna: nowaDruzyna,
                    };

                    zamknijWszystkieSekcjeModala();
                } catch (err) {
                    console.error("Błąd zapisu profilu:", err);
                    if (statusDiv) {
                        statusDiv.textContent = err.message || "Błąd zapisu zmian.";
                        statusDiv.style.color = "#f87171";
                        statusDiv.style.display = "block";
                    } else {
                        alert(`Błąd zapisu: ${err.message || "Spróbuj ponownie"}`);
                    }
                } finally {
                    btnZapisz.disabled = false;
                    btnZapisz.textContent = "Zapisz zmiany";
                }
            });

            document.getElementById("btn-wyloguj")?.addEventListener("click", () => {
                modalTytul.textContent = "Wyloguj się";
                formEdycja.style.display = "none";
                blokUsunKonto.style.display = "none";
                blokWyloguj.style.display = "block";
                modal.style.display = "flex";
            });

            document.getElementById("wyloguj-sie")?.addEventListener("submit", async (e) => {
                e.preventDefault();
                if (client?.auth) await client.auth.signOut();
                window.location.href = "./index.html";
            });

            const inputPotwierdzUsun = document.getElementById("potwierdzenie-usuniecia-input");
            const btnPotwierdzUsun = document.getElementById("btn-potwierdz-usuniecie");

            inputPotwierdzUsun?.addEventListener("input", () => {
                const wpisane = (inputPotwierdzUsun.value || "").trim().toUpperCase();
                if (wpisane === "USUŃ") {
                    btnPotwierdzUsun.disabled = false;
                    btnPotwierdzUsun.style.opacity = "1";
                    btnPotwierdzUsun.style.cursor = "pointer";
                } else {
                    btnPotwierdzUsun.disabled = true;
                    btnPotwierdzUsun.style.opacity = "0.45";
                    btnPotwierdzUsun.style.cursor = "not-allowed";
                }
            });

            document.getElementById("btn-usun-konto")?.addEventListener("click", () => {
                modalTytul.textContent = "Usuń konto";
                formEdycja.style.display = "none";
                blokWyloguj.style.display = "none";
                blokUsunKonto.style.display = "block";
                if (inputPotwierdzUsun) inputPotwierdzUsun.value = "";
                if (btnPotwierdzUsun) {
                    btnPotwierdzUsun.disabled = true;
                    btnPotwierdzUsun.style.opacity = "0.45";
                    btnPotwierdzUsun.style.cursor = "not-allowed";
                    btnPotwierdzUsun.textContent = "Potwierdź usunięcie";
                }
                modal.style.display = "flex";
                setTimeout(() => inputPotwierdzUsun?.focus(), 100);
            });

            document.getElementById("form-usun-konto")?.addEventListener("submit", async (e) => {
                e.preventDefault();
                if (!aktualnyUser) return;
                const wpisane = (inputPotwierdzUsun?.value || "").trim().toUpperCase();
                if (wpisane !== "USUŃ") {
                    alert("Wpisz słowo USUŃ, aby potwierdzić.");
                    return;
                }

                const btnUsun = document.getElementById("btn-potwierdz-usuniecie");
                btnUsun.disabled = true;
                btnUsun.textContent = "Usuwanie...";

                try {
                    const folderUsera = aktualnyUser.id;
                    if (client?.storage) {
                        const { data: pliki } = await client.storage.from("avatary").list(folderUsera);
                        if (pliki && pliki.length > 0) {
                            const sciezki = pliki.map((p) => `${folderUsera}/${p.name}`);
                            await client.storage.from("avatary").remove(sciezki);
                        }
                    }

                    if (client) {
                        const { error: rpcErr } = await client.rpc("usun_konto_uzytkownika");
                        if (rpcErr && client.auth) {
                            await client.auth.updateUser({
                                data: {
                                    username: "Konto Usunięte",
                                    avatar_url: null,
                                    ostatnie_mecze: [],
                                },
                            });
                        }
                        if (client.auth) await client.auth.signOut();
                    }

                    alert("Konto zostało usunięte.");
                    window.location.href = "./index.html";
                } catch (err) {
                    console.error("Błąd usuwania konta:", err);
                    alert("Wystąpił błąd podczas usuwania konta.");
                    btnUsun.disabled = false;
                    btnUsun.textContent = "Potwierdź usunięcie";
                }
            });

            const btnDodajZnajomego = document.getElementById("btn-dodaj-znajomego");
            if (btnDodajZnajomego) {
                btnDodajZnajomego.addEventListener("click", async function () {
                    if (!aktualnyUser) {
                        window.location.href = "./logowanie.html";
                        return;
                    }

                    const relacjaId = this.getAttribute("data-relacja-id");
                    const rywalId = this.getAttribute("data-rywal-id");
                    this.disabled = true;

                    if (relacjaId && client) {
                        this.textContent = "Akceptowanie...";
                        let sukces = false;
                        try {
                            const { error } = await zLimitemCzasu(client.from("znajomi").update({ status: "zaakceptowane" }).eq("id", relacjaId), "akceptacja zaproszenia", 4000);
                            if (!error) sukces = true;
                        } catch (_) {}

                        if (sukces) {
                            this.textContent = "✓ Twój znajomy";
                            this.className = "btn-zaakceptowane-zaproszenie";
                        } else {
                            this.disabled = false;
                            this.textContent = "Błąd akceptacji.";
                        }
                    } else if (rywalId && client) {
                        this.textContent = "Wysyłanie...";
                        let sukces = false;
                        let kodBledu = null;
                        try {
                            const { error } = await zLimitemCzasu(client.from("znajomi").insert([{ zapraszajacy_id: aktualnyUser.id, zapraszany_id: rywalId }]), "wysyłanie zaproszenia", 4000);
                            if (!error) sukces = true;
                            else kodBledu = error.code;
                        } catch (_) {}

                        if (sukces) {
                            this.textContent = "⏳ Wysłano zaproszenie";
                            this.className = "btn-wyslano-zaproszenie";
                        } else {
                            if (kodBledu === "23505") {
                                this.textContent = "Zaproszenie już istnieje";
                            } else {
                                this.textContent = "Błąd wysyłania";
                                this.disabled = false;
                            }
                        }
                    }
                });
            }

            const avatarContainer = document.getElementById("avatar-container");
            const inputAvatar = document.getElementById("input-avatar");
            const avatarStatus = document.getElementById("avatar-status");
            const imgAvatar = document.getElementById("zdjecie-uzytkownika");

            avatarContainer?.addEventListener("click", () => inputAvatar?.click());

            inputAvatar?.addEventListener("change", async (e) => {
                const plik = e.target.files[0];
                if (!plik) return;

                if (!aktualnyUser) aktualnyUser = odczytajZalogowanegoZStorage();
                if (!aktualnyUser && client?.auth) {
                    const { data: sessionData } = await client.auth.getSession();
                    aktualnyUser = sessionData?.session?.user;
                }

                if (!aktualnyUser) {
                    if (avatarStatus) {
                        avatarStatus.textContent = "Zaloguj się ponownie!";
                        avatarStatus.style.color = "#f87171";
                    }
                    return;
                }

                if (avatarStatus) {
                    avatarStatus.textContent = "Optymalizacja zdjęcia...";
                    avatarStatus.style.color = "#38bdf8";
                }

                let skompresowanyPlik;
                try {
                    skompresowanyPlik = await kompresujAwatar(plik, 320, 0.85);
                } catch (eKomp) {
                    skompresowanyPlik = { blob: plik, ext: (plik.name.split(".").pop() || "png").toLowerCase(), mime: plik.type || "image/png" };
                }

                if (avatarStatus) {
                    avatarStatus.textContent = "Wgrywanie zdjęcia...";
                    avatarStatus.style.color = "#38bdf8";
                }

                try {
                    const userId = aktualnyUser.id;
                    const sesja = pobierzSesjeZStorage();
                    let token = sesja.token;
                    if (!token && client?.auth) {
                        try {
                            const { data: sd } = await client.auth.getSession();
                            token = sd?.session?.access_token || null;
                        } catch (_) {}
                    }

                    const cleanUserId = String(userId).trim();
                    const nazwaNowegoPliku = `avatar_${Date.now()}.${skompresowanyPlik.ext}`;
                    const nowaSciezka = `${cleanUserId}/${nazwaNowegoPliku}`;
                    let uploadSukces = false;
                    let bladSzczegoly = "";

                    const isProd = window.location.hostname === "stacjadarta.pl";
                    const sciezkaZasobu = `/storage/v1/object/avatary/${encodeURI(nowaSciezka)}`;
                    const uploadUrls = isProd ? [`/api/supabase${sciezkaZasobu}`, `${SUPA_URL}${sciezkaZasobu}`] : [`${SUPA_URL}${sciezkaZasobu}`];

                    const authTokensToTry = token ? [`Bearer ${token}`, `Bearer ${SUPA_KEY}`] : [`Bearer ${SUPA_KEY}`];
                    for (const uploadUrl of uploadUrls) {
                        if (uploadSukces) break;
                        for (const authHdr of authTokensToTry) {
                            if (uploadSukces) break;
                            try {
                                const resDirect = await fetch(uploadUrl, {
                                    method: "POST",
                                    headers: {
                                        apikey: SUPA_KEY,
                                        Authorization: authHdr,
                                        "Content-Type": skompresowanyPlik.mime,
                                        "x-upsert": "true",
                                    },
                                    body: skompresowanyPlik.blob,
                                });

                                if (resDirect.ok) {
                                    uploadSukces = true;
                                    break;
                                }
                            } catch (eDir) {
                                bladSzczegoly = eDir.message;
                            }
                        }
                    }

                    if (!uploadSukces && client?.storage) {
                        const { error: uploadErr } = await client.storage.from("avatary").upload(nowaSciezka, skompresowanyPlik.blob, {
                            contentType: skompresowanyPlik.mime,
                            upsert: true,
                        });
                        if (uploadErr) throw new Error(uploadErr.message || "Błąd zapisu pliku w Storage");
                        uploadSukces = true;
                    }

                    const publicUrl = `${SUPA_URL}/storage/v1/object/public/avatary/${encodeURI(nowaSciezka)}`;
                    await wykonajZapisProfilu({ avatar_url: publicUrl }, userId);
                    usunStareAvatary(cleanUserId, nazwaNowegoPliku).catch(() => {});

                    if (imgAvatar) imgAvatar.src = publicUrl;
                    if (aktualnyProfil) aktualnyProfil.avatar_url = publicUrl;

                    if (avatarStatus) {
                        avatarStatus.textContent = "Zdjęcie zaktualizowane!";
                        avatarStatus.style.color = "#4ade80";
                        setTimeout(() => (avatarStatus.textContent = ""), 3000);
                    }
                } catch (err) {
                    console.error("Błąd zapisu zdjęcia:", err);
                    if (avatarStatus) {
                        avatarStatus.textContent = err.message || "Nie udało się zapisać zdjęcia.";
                        avatarStatus.style.color = "#f87171";
                    }
                } finally {
                    inputAvatar.value = "";
                }
            });
        }

        document.addEventListener("DOMContentLoaded", async () => {
            zainicjalizujZakladki();
            zainicjalizujPrzelacznikShanghai();
            zainicjalizujPrzelacznikAround();
            zainicjalizujPrzelacznikDoubles();
            zainicjalizujPrzelacznikiMetryk();
            zainicjalizujModaleIProfil();

            // Wygenerowanie siatek sektorów SVG
            generujSiatkeDlaSvg(document.getElementById("dartboard-heatmap"), "d");
            generujSiatkeDlaSvg(document.getElementById("dartboard-heatmap-around"), "atw_");
            generujSiatkeDlaSvg(document.getElementById("dartboard-heatmap-shanghai"), "sh_");

            // Wstępne wypełnienie statystykami
            zaktualizujWszystkieStatystyki(DANE_STATYSTYK);

            // Pobranie profilu, meczów oraz statystyk z bazy Supabase
            await zaladujProfil();

            // Zapewnienie przeliczenia wymiarów wykresu po wyrenderowaniu
            requestAnimationFrame(() => {
                setTimeout(() => {
                    Object.values(wykresyInstancje).forEach((chart) => {
                        if (chart && typeof chart.resize === "function") {
                            chart.resize();
                        }
                    });
                }, 50);
            });

            window.addEventListener("resize", () => {
                Object.values(wykresyInstancje).forEach((chart) => {
                    if (chart && typeof chart.resize === "function") {
                        chart.resize();
                    }
                });
            });
        });

        // Obsługa powrotu z bfcache na urządzeniach mobilnych (iOS Safari)
        window.addEventListener("pageshow", (e) => {
            if (e.persisted) {
                zaladujProfil();
            }
        });

        // Nasłuchiwanie na zmiany stanu sesji (tylko rzeczywiste zalogowanie / wylogowanie)
        try {
            const k = window.supabaseKlient || window.supabaseClient;
            if (k?.auth?.onAuthStateChange) {
                k.auth.onAuthStateChange((event, session) => {
                    if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
                        if (session?.user && (!aktualnyUser || aktualnyUser.id !== session.user.id)) {
                            zaladujProfil();
                        }
                    }
                });
            }
        } catch (_) {}

    window.zaladujProfil = zaladujProfil;
    window.zaladujStatystykiGracza = zaladujStatystykiGracza;
})();
