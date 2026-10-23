/**
 * kalendarz.js - Kalendarz PDC, lista oficjalnych turniejów oraz slider najbliższych wydarzeń
 * Stacja Darta - Wersja manualna i w 100% lokalna (pokazowe dane mock, bez zewnętrznej bazy danych)
 */

(function () {
    "use strict";

    /**
     * Pokazowa baza oficjalnych turniejów PDC / Major (dane lokalne w JS)
     */
    const BAZA_OFICJALNYCH_TURNIEJOW = [
        {
            id: "pc31",
            tytul: "Players Championship 31",
            major: false,
            dataStart: "2026-10-28",
            dataKoniec: "2026-10-28",
            terminTekst: "28.10.2026 (Środa)",
            godzina: "13:00",
            miejsce: "Maaspoort, Den Bosch (Holandia)",
            pula: "£125,000",
            odliczanie: "Za 5 dni",
            obrazek: "./events/playerschampionship.webp",
        },
        {
            id: "pc32",
            tytul: "Players Championship 32",
            major: false,
            dataStart: "2026-10-29",
            dataKoniec: "2026-10-29",
            terminTekst: "29.10.2026 (Czwartek)",
            godzina: "13:00",
            miejsce: "Maaspoort, Den Bosch (Holandia)",
            pula: "£125,000",
            odliczanie: "Za 6 dni",
            obrazek: "./events/playerschampionship.webp",
        },
        {
            id: "gsod2026",
            tytul: "Grand Slam of Darts 2026",
            major: true,
            dataStart: "2026-11-08",
            dataKoniec: "2026-11-16",
            terminTekst: "08.11.2026 – 16.11.2026",
            godzina: "14:00 / 20:00",
            miejsce: "WV Active Aldersley, Wolverhampton (Anglia)",
            pula: "£650,000",
            odliczanie: "W listopadzie",
            obrazek: "./events/grand_slam.webp",
        },
        {
            id: "pcf2026",
            tytul: "Players Championship Finals 2026",
            major: true,
            dataStart: "2026-11-27",
            dataKoniec: "2026-11-29",
            terminTekst: "27.11.2026 – 29.11.2026",
            godzina: "13:45 / 20:00",
            miejsce: "Butlin's Minehead Resort (Anglia)",
            pula: "£600,000",
            odliczanie: "W listopadzie",
            obrazek: "./events/playerschampionship_final.webp",
        },
        {
            id: "wch2027",
            tytul: "PDC World Darts Championship 2027",
            major: true,
            dataStart: "2026-12-15",
            dataKoniec: "2027-01-03",
            terminTekst: "15.12.2026 – 03.01.2027",
            godzina: "13:30 / 20:00",
            miejsce: "Alexandra Palace, Londyn (UK)",
            pula: "£2,500,000",
            odliczanie: "W grudniu",
            obrazek: "./events/worldchampionship.webp",
        },
        {
            id: "masters2027",
            tytul: "The Masters 2027",
            major: true,
            dataStart: "2027-01-29",
            dataKoniec: "2027-01-31",
            terminTekst: "29.01.2027 – 31.01.2027",
            godzina: "14:00 / 20:00",
            miejsce: "Marshall Arena, Milton Keynes (Anglia)",
            pula: "£275,000",
            odliczanie: "W styczniu",
            obrazek: "./events/playerschampionship.webp",
        },
        {
            id: "pl2027",
            tytul: "Premier League Darts 2027 – Noc 1",
            major: true,
            dataStart: "2027-02-04",
            dataKoniec: "2027-02-04",
            terminTekst: "04.02.2027 (Czwartek)",
            godzina: "20:00",
            miejsce: "SSE Arena, Belfast (Irlandia Płn.)",
            pula: "£1,000,000",
            odliczanie: "W lutym",
            obrazek: "./events/playerschampionship.webp",
        },
        {
            id: "ukopen2027",
            tytul: "UK Open 2027",
            major: true,
            dataStart: "2027-03-05",
            dataKoniec: "2027-03-07",
            terminTekst: "05.03.2027 – 07.03.2027",
            godzina: "12:00 / 20:00",
            miejsce: "Butlin's Minehead Resort (Anglia)",
            pula: "£600,000",
            odliczanie: "W marcu",
            obrazek: "./events/playerschampionship.webp",
        },
    ];

    const MIESIACE_NAZWY = [
        "Styczeń",
        "Luty",
        "Marzec",
        "Kwiecień",
        "Maj",
        "Czerwiec",
        "Lipiec",
        "Sierpień",
        "Wrzesień",
        "Październik",
        "Listopad",
        "Grudzień",
    ];

    const DNI_TYGODNIA = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Niedz"];

    /**
     * Konfiguracja manualnego slidera najbliższych wydarzeń (z przewijaniem i przeciąganiem myszką)
     */
    function inicjalizujSliderWydarzen() {
        const track = document.getElementById("slider-track");
        if (!track) return;

        const cards = track.querySelectorAll(".blok-eventu");
        if (cards.length === 0) return;

        const floatPrevBtn = document.getElementById("slider-float-prev");
        const floatNextBtn = document.getElementById("slider-float-next");

        function getKrokPrzewijania() {
            const cardWidth = cards[0].offsetWidth;
            const style = window.getComputedStyle(track);
            const gap = parseFloat(style.gap) || 20;
            return cardWidth + gap;
        }

        function scrolluj(kierunek) {
            const krok = getKrokPrzewijania();
            const przesuniecie = kierunek === "next" ? krok : -krok;
            track.scrollBy({
                left: przesuniecie,
                behavior: "smooth",
            });
        }

        if (floatPrevBtn) floatPrevBtn.addEventListener("click", () => scrolluj("prev"));
        if (floatNextBtn) floatNextBtn.addEventListener("click", () => scrolluj("next"));

        let ticking = false;
        function aktualizujStanSlidera() {
            const scrollLeft = track.scrollLeft;
            const scrollWidth = track.scrollWidth;
            const clientWidth = track.clientWidth;
            const maxScroll = scrollWidth - clientWidth;

            const czyPoczatek = scrollLeft <= 10;
            const czyKoniec = scrollLeft >= maxScroll - 10;

            if (floatPrevBtn) floatPrevBtn.disabled = czyPoczatek;
            if (floatNextBtn) floatNextBtn.disabled = czyKoniec;

            ticking = false;
        }

        track.addEventListener(
            "scroll",
            () => {
                if (!ticking) {
                    window.requestAnimationFrame(aktualizujStanSlidera);
                    ticking = true;
                }
            },
            { passive: true }
        );

        setTimeout(aktualizujStanSlidera, 100);
        window.addEventListener("resize", aktualizujStanSlidera);

        // Obsługa przeciągania myszką (Drag to scroll)
        let isDown = false;
        let startX = 0;
        let scrollStartLeft = 0;
        let czyPrzeciagal = false;

        track.addEventListener("mousedown", (e) => {
            isDown = true;
            czyPrzeciagal = false;
            track.classList.add("is-dragging");
            startX = e.pageX - track.offsetLeft;
            scrollStartLeft = track.scrollLeft;
        });

        window.addEventListener("mouseup", () => {
            if (!isDown) return;
            isDown = false;
            track.classList.remove("is-dragging");
        });

        track.addEventListener("mousemove", (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - track.offsetLeft;
            const walk = (x - startX) * 1.5;
            if (Math.abs(walk) > 5) {
                czyPrzeciagal = true;
            }
            track.scrollLeft = scrollStartLeft - walk;
        });

        track.addEventListener(
            "click",
            (e) => {
                if (czyPrzeciagal) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                const btn = e.target.closest(".btn-zobacz-wiecej");
                if (btn) {
                    const eventId = btn.getAttribute("data-event");
                    if (eventId) {
                        window.location.href = `./turniej-pdc.html?${eventId}`;
                    }
                }
            },
            true
        );
    }

    /**
     * Inicjalizacja kalendarza miesięcy oraz listy oficjalnych turniejów PDC
     */
    function inicjalizujKalendarz() {
        const kontenerKalendarza = document.getElementById("miesiac-container");
        const kontenerListy = document.getElementById("lista-oficjalnych-turniejow");
        const kontenerWiecej = document.getElementById("kontener-wiecej-turniejow");
        const btnWiecej = document.getElementById("btn-zobacz-wiecej-turniejow");
        const tekstBtnWiecej = document.getElementById("tekst-btn-wiecej-turniejow");
        const ikonaBtnWiecej = document.getElementById("ikona-btn-wiecej-turniejow");
        const etykietaMiesiaca = document.getElementById("aktualny-miesiac-etykieta");
        const btnPoprzedni = document.getElementById("poprzedni-miesiac");
        const btnNastepny = document.getElementById("nastepny-miesiac");

        if (!kontenerKalendarza) return;

        let aktualnyRok = 2026;
        let aktualnyMiesiac = 9; // Październik (indeks 0-11)
        let czyRozwinieteTurnieje = false;

        // Turnieje posortowane chronologicznie po dacie startu
        const turniejePosortowane = [...BAZA_OFICJALNYCH_TURNIEJOW].sort((a, b) => {
            return a.dataStart.localeCompare(b.dataStart);
        });

        function sformatujDateKlucz(rok, miesiac, dzien) {
            const m = String(miesiac + 1).padStart(2, "0");
            const d = String(dzien).padStart(2, "0");
            return `${rok}-${m}-${d}`;
        }

        // Sprawdzenie czy w konkretnym dniu odbywa się turniej
        function pobierzTurniejeDlaDnia(rok, miesiac, dzien) {
            const klucz = sformatujDateKlucz(rok, miesiac, dzien);
            return BAZA_OFICJALNYCH_TURNIEJOW.filter((w) => {
                return klucz >= w.dataStart && klucz <= w.dataKoniec;
            });
        }

        function aktualizujNaglowki() {
            const nazwaMiesiaca = MIESIACE_NAZWY[aktualnyMiesiac];
            if (etykietaMiesiaca) {
                etykietaMiesiaca.textContent = `${nazwaMiesiaca} ${aktualnyRok}`;
            }
        }

        // Renderowanie 7-kolumnowej siatki kalendarza (Pon - Niedz)
        function renderujSiatkeKalendarza() {
            kontenerKalendarza.innerHTML = "";

            const siatka = document.createElement("div");
            siatka.className = "kalendarz-siatka";

            // Nagłówki dni tygodnia
            DNI_TYGODNIA.forEach((dzien) => {
                const el = document.createElement("div");
                el.className = "naglowek-dnia-tyg";
                el.textContent = dzien;
                siatka.appendChild(el);
            });

            // Wyznaczenie przesunięcia pierwszego dnia (Poniedziałek = 0)
            const pierwszyDzien = new Date(aktualnyRok, aktualnyMiesiac, 1).getDay();
            const przesunieciePon = (pierwszyDzien + 6) % 7;

            const liczbaDniWMiesiacu = new Date(aktualnyRok, aktualnyMiesiac + 1, 0).getDate();
            const liczbaDniPoprzedniego = new Date(aktualnyRok, aktualnyMiesiac, 0).getDate();

            // 1. Dopełnienie dniami poprzedniego miesiąca
            for (let i = przesunieciePon - 1; i >= 0; i--) {
                const nrDnia = liczbaDniPoprzedniego - i;
                const komorka = document.createElement("div");
                komorka.className = "dzien-komorka inny-miesiac";
                komorka.innerHTML = `<span class="dzien-numer">${nrDnia}</span>`;
                siatka.appendChild(komorka);
            }

            // 2. Dni bieżącego miesiąca
            const dzisiaj = new Date();
            const czyBiezacyMiesiac = dzisiaj.getFullYear() === aktualnyRok && dzisiaj.getMonth() === aktualnyMiesiac;
            const dzisiejszyDzien = dzisiaj.getDate();

            for (let dzien = 1; dzien <= liczbaDniWMiesiacu; dzien++) {
                const komorka = document.createElement("div");
                komorka.className = "dzien-komorka";

                if (czyBiezacyMiesiac && dzien === dzisiejszyDzien) {
                    komorka.classList.add("dzis");
                }

                const turniejeDnia = pobierzTurniejeDlaDnia(aktualnyRok, aktualnyMiesiac, dzien);

                let badgeHtml = "";
                if (turniejeDnia.length > 0) {
                    badgeHtml = turniejeDnia
                        .map(
                            (w) =>
                                `<div class="event-mini-badge" title="${w.tytul} (${w.miejsce})">
                                    ${w.tytul}
                                </div>`
                        )
                        .join("");
                }

                komorka.innerHTML = `
                    <span class="dzien-numer">${dzien}</span>
                    ${badgeHtml}
                `;

                // Kliknięcie w dzień z turniejem płynnie przewija do karty na liście
                if (turniejeDnia.length > 0) {
                    komorka.style.cursor = "pointer";
                    komorka.addEventListener("click", () => {
                        const pierwszyTurniej = turniejeDnia[0];
                        const indeks = turniejePosortowane.findIndex((t) => t.id === pierwszyTurniej.id);

                        if (indeks >= 5 && !czyRozwinieteTurnieje) {
                            czyRozwinieteTurnieje = true;
                            renderujListeOficjalnychTurniejow();
                        }

                        const kartaEl = document.getElementById(`oficjalny-turniej-${pierwszyTurniej.id}`);
                        if (kartaEl) {
                            kartaEl.scrollIntoView({ behavior: "smooth", block: "center" });
                            kartaEl.style.borderColor = "var(--secondary-color)";
                            kartaEl.style.boxShadow = "0 0 20px rgba(64, 218, 64, 0.4)";
                            setTimeout(() => {
                                kartaEl.style.borderColor = "";
                                kartaEl.style.boxShadow = "";
                            }, 1800);
                        }
                    });
                }

                siatka.appendChild(komorka);
            }

            // 3. Dopełnienie do pełnych tygodni dniami następnego miesiąca
            const lacznieKomorek = przesunieciePon + liczbaDniWMiesiacu;
            const reszta = lacznieKomorek % 7;
            const doDopelnienia = reszta === 0 ? 0 : 7 - reszta;

            for (let d = 1; d <= doDopelnienia; d++) {
                const komorka = document.createElement("div");
                komorka.className = "dzien-komorka inny-miesiac";
                komorka.innerHTML = `<span class="dzien-numer">${d}</span>`;
                siatka.appendChild(komorka);
            }

            kontenerKalendarza.appendChild(siatka);
        }

        // Renderowanie listy oficjalnych turniejów pod kalendarzem
        function renderujListeOficjalnychTurniejow() {
            if (!kontenerListy) return;
            kontenerListy.innerHTML = "";

            if (turniejePosortowane.length === 0) {
                const brak = document.createElement("div");
                brak.className = "brak-wydarzen-komunikat";
                brak.innerHTML = `
                    <p style="margin: 0; font-size: 16px; font-weight: 700; color: #ffffff;">Brak zaplanowanych oficjalnych turniejów PDC.</p>
                `;
                kontenerListy.appendChild(brak);
                if (kontenerWiecej) kontenerWiecej.style.display = "none";
                return;
            }

            const doWyswietlenia = czyRozwinieteTurnieje
                ? turniejePosortowane
                : turniejePosortowane.slice(0, 5);

            doWyswietlenia.forEach((w) => {
                const karta = document.createElement("article");
                karta.className = "oficjalna-karta-turnieju";
                karta.id = `oficjalny-turniej-${w.id}`;

                karta.innerHTML = `
                    <div class="oficjalna-karta-img-wrapper">
                        <img src="${w.obrazek}" alt="${w.tytul}" loading="lazy" />
                        <div class="oficjalna-karta-overlay"></div>
                        <div class="oficjalna-karta-badge">${w.odliczanie}</div>
                    </div>
                    <div class="oficjalna-karta-info">
                        <div class="oficjalna-karta-top">
                            <h4 class="oficjalna-karta-tytul">${w.tytul}</h4>
                        </div>
                        <div class="oficjalna-karta-szczegoly">
                            <div class="oficjalna-karta-wiersz">
                                <span class="ikona">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                        <line x1="16" y1="2" x2="16" y2="6"></line>
                                        <line x1="8" y1="2" x2="8" y2="6"></line>
                                        <line x1="3" y1="10" x2="21" y2="10"></line>
                                    </svg>
                                </span>
                                <span><strong>Termin:</strong> ${w.terminTekst} (${w.godzina})</span>
                            </div>
                            <div class="oficjalna-karta-wiersz">
                                <span class="ikona">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                        <circle cx="12" cy="10" r="3"></circle>
                                    </svg>
                                </span>
                                <span><strong>Miejsce:</strong> ${w.miejsce}</span>
                            </div>
                            <div class="oficjalna-karta-wiersz">
                                <span class="ikona">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="8" r="7"></circle>
                                        <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
                                    </svg>
                                </span>
                                <span><strong>Pula nagród:</strong> ${w.pula}</span>
                            </div>
                        </div>
                        <div class="oficjalna-karta-footer">
                            <button type="button" class="oficjalna-karta-btn" data-event="${w.id}">
                                <span>Zobacz szczegóły</span>
                            </button>
                        </div>
                    </div>
                `;

                kontenerListy.appendChild(karta);
            });

            // Obsługa przycisku "Zobacz więcej"
            if (kontenerWiecej && btnWiecej) {
                if (turniejePosortowane.length > 5) {
                    kontenerWiecej.style.display = "flex";
                    if (tekstBtnWiecej) {
                        tekstBtnWiecej.textContent = czyRozwinieteTurnieje
                            ? "Zwiń listę wydarzeń"
                            : `Zobacz więcej wydarzeń (${turniejePosortowane.length - 5})`;
                    }
                    if (ikonaBtnWiecej) {
                        ikonaBtnWiecej.innerHTML = czyRozwinieteTurnieje
                            ? `<polyline points="18 15 12 9 6 15"></polyline>`
                            : `<polyline points="6 9 12 15 18 9"></polyline>`;
                    }
                } else {
                    kontenerWiecej.style.display = "none";
                }
            }
        }

        if (kontenerListy) {
            kontenerListy.addEventListener("click", (e) => {
                const btn = e.target.closest(".oficjalna-karta-btn");
                if (btn) {
                    const eventId = btn.getAttribute("data-event");
                    if (eventId) {
                        window.location.href = `./turniej-pdc.html?${eventId}`;
                    }
                }
            });
        }

        if (btnWiecej) {
            btnWiecej.addEventListener("click", () => {
                czyRozwinieteTurnieje = !czyRozwinieteTurnieje;
                renderujListeOficjalnychTurniejow();
                if (!czyRozwinieteTurnieje && kontenerListy) {
                    kontenerListy.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            });
        }

        function renderujWszystko() {
            aktualizujNaglowki();
            renderujSiatkeKalendarza();
            renderujListeOficjalnychTurniejow();
        }

        // Obsługa nawigacji po miesiącach
        if (btnPoprzedni) {
            btnPoprzedni.addEventListener("click", () => {
                aktualnyMiesiac--;
                if (aktualnyMiesiac < 0) {
                    aktualnyMiesiac = 11;
                    aktualnyRok--;
                }
                renderujWszystko();
            });
        }

        if (btnNastepny) {
            btnNastepny.addEventListener("click", () => {
                aktualnyMiesiac++;
                if (aktualnyMiesiac > 11) {
                    aktualnyMiesiac = 0;
                    aktualnyRok++;
                }
                renderujWszystko();
            });
        }

        renderujWszystko();
    }

    function start() {
        inicjalizujSliderWydarzen();
        inicjalizujKalendarz();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
