// =========================================================================
// DARTBOT - Moduł sztucznej inteligencji przeciwnika (DartBot)
// =========================================================================

// Niemożliwe 3-lotkowe zamknięcia w darcie (tzw. Bogey numbers powyżej 158)
const niemozliweZamknieciaBota = [169, 168, 166, 165, 163, 162, 159];

/**
 * Zwraca maksymalny wynik, z którego bot o danej średniej podejmuje realną próbę zakończenia laga.
 */
function pobierzMaksymalnyCheckoutBota(avg) {
    if (avg < 45) return 40;  // Amatorzy (30, 35, 40) nie próbują finiszów z 60-80 w 1 kolejce, tylko schodzą na dable
    if (avg < 60) return 60;  // Single + Double (np. 52 = S12 + D20)
    if (avg < 75) return 80;  // S20+D20, T20+D10 itp.
    if (avg < 85) return 110; // Standardowe 2-3 lotkowe kombinacje
    return 170;               // Pełny zasięg turniejowy
}

/**
 * Analityczne parametry rzutu dla zadanej średniej bota.
 * Precyzyjnie wylicza szanse T20, S20 oraz trafienia w boki (1 i 5),
 * skalibrowane dla każdego poziomu suwaka ze skokiem co 5 (od 30 do 100).
 */
function pobierzParametryRzutu(avg) {
    // Dla średnich < 38 szansa na T20 wynosi 0 (amatorzy nie trafiają celowo w T20, zero przypadkowych 140/180)
    const p60 = avg < 38 ? 0.0 : Math.max(0.003, Math.min(0.55, Math.pow(avg / 100.0, 2.5) * 0.54));
    const pMiss = Math.max(0.002, (100.0 - avg) / 3200.0);

    const scoringMult = 1.06 + (avg / 100.0) * 0.13 + Math.pow(avg / 100.0, 2) * 0.06;
    const eDart = (avg * (avg <= 35 ? 1.07 : scoringMult)) / 3.0;

    let p20 = (eDart - 57.0 * p60 - 3.0 * (1.0 - pMiss)) / 17.0;
    p20 = Math.max(0.05, Math.min(1.0 - p60 - pMiss, p20));
    const pSide = Math.max(0.0, 1.0 - p60 - p20 - pMiss);

    return { p60, p20, pSide };
}

/**
 * Symuluje rzut 1 lotką na tarczę celowaną w T20.
 */
function rzucJednaLotkeScoringowa(params) {
    const los = Math.random();
    if (los < params.p60) {
        return 60; // T20
    }
    if (los < params.p60 + params.p20) {
        return 20; // S20
    }
    if (los < params.p60 + params.p20 + params.pSide) {
        // Pudło w sąsiednie sektory (1 lub 5)
        return Math.random() < 0.48 ? 1 : 5;
    }
    return 0; // poza tarczę
}

/**
 * Generuje rzut 3 lotkami w fazie punktowej (scoring).
 */
function generujRzutScoringowy(avg) {
    const params = pobierzParametryRzutu(avg);
    let d1 = rzucJednaLotkeScoringowa(params);
    let d2 = rzucJednaLotkeScoringowa(params);
    let d3 = rzucJednaLotkeScoringowa(params);

    // Ograniczenia treble dla początkujących / średnich graczy:
    if (avg < 38) {
        // Poziom 30-35: brak trebli (tylko single 20, 1, 5 itp.) - eliminuje nienaturalne 140
        if (d1 === 60) d1 = 20;
        if (d2 === 60) d2 = 20;
        if (d3 === 60) d3 = 20;
    } else if (avg < 55) {
        // Poziom 40-50: maksymalnie 1 treble w kolejce (nigdy 140 ani 180)
        let trebles = 0;
        if (d1 === 60) trebles++;
        if (d2 === 60) {
            if (trebles >= 1) d2 = 20;
            else trebles++;
        }
        if (d3 === 60) {
            if (trebles >= 1) d3 = 20;
        }
    }

    return d1 + d2 + d3;
}

/**
 * Zwraca optymalnego dabla pod zostawienie (40, 32, 24, 20, 16, 12, 8, 4).
 * Gwarantuje, że bot nie zostawi nieparzystej reszty (np. 13, 7).
 */
function znajdzNajlepszegoZostawienia(aktualnePunkty) {
    const dable = [40, 32, 24, 20, 16, 12, 8, 4];
    for (const d of dable) {
        if (d < aktualnePunkty) {
            const roznica = aktualnePunkty - d;
            if (roznica >= 1 && roznica <= 60) {
                return d;
            }
        }
    }
    return null;
}

/**
 * Główna funkcja wyliczająca ruch DartBota.
 */
function obliczRzutBota(aktualnePunkty, poziomIntStr) {
    let avg = parseInt(poziomIntStr);
    if (isNaN(avg)) avg = 50;

    const maxCheckout = pobierzMaksymalnyCheckoutBota(avg);
    const czyMozeProbowacFiniszu =
        aktualnePunkty <= maxCheckout &&
        aktualnePunkty <= 170 &&
        !niemozliweZamknieciaBota.includes(aktualnePunkty);

    // =========================================================================
    // 1. SYTUACJA CHECKOUTU (gdy wynik jest w realnym zasięgu finiszu)
    // =========================================================================
    if (czyMozeProbowacFiniszu) {
        const baseDouble = 0.10 + (avg / 100.0) * 0.48;
        let pCheckout = baseDouble;
        if (aktualnePunkty > 40) pCheckout *= 0.68;
        if (aktualnePunkty > 100) pCheckout *= 0.42;

        const czyBezposredniDouble =
            (aktualnePunkty <= 40 && aktualnePunkty % 2 === 0) || aktualnePunkty === 50;

        // --- SUKCES: BOT ZAMYKA LEGA ---
        if (Math.random() < pCheckout) {
            let uzyteLotki = 3;
            let lotkiNaDoubla = 1;

            if (czyBezposredniDouble) {
                const losL = Math.random();
                const p1 = Math.max(0.12, Math.min(0.38, (avg / 100.0) * 0.38));
                uzyteLotki = losL < p1 ? 1 : losL < (p1 + 0.35) ? 2 : 3;
                lotkiNaDoubla = uzyteLotki; // wszystkie rzuty w tej turze leciały w dable
            } else if (aktualnePunkty <= 60) {
                uzyteLotki = 2;
                lotkiNaDoubla = 1;
            } else {
                uzyteLotki = 3;
                lotkiNaDoubla = 1;
            }

            return {
                punkty: aktualnePunkty,
                czyFura: false,
                lotkaKonczaca: uzyteLotki,
                lotkiNaDoubla: lotkiNaDoubla,
            };
        }

        // --- PORAŻKA PRZY CHECKOUCIE (Nie zamknął) ---
        // Przypadek 1A: Bezpośrednio na doublu (<= 40 parzyste lub 50)
        if (czyBezposredniDouble) {
            const losPudla = Math.random();

            // Trafienie singla dzielącego go na parzysty dabel (np. D20 -> S20 / D10, D16 -> S16 / D8)
            if (aktualnePunkty <= 40 && aktualnePunkty % 4 === 0 && losPudla < 0.20) {
                const pktZSingla = Math.floor(aktualnePunkty / 2);
                return {
                    punkty: pktZSingla,
                    czyFura: false,
                    lotkaKonczaca: 3,
                    lotkiNaDoubla: 2, // 1 niecelna w singla, kolejna obok nowego dabla
                };
            } else {
                // Pudło obok drutu (0 pkt) - gracz rzucał 2-3 lotki na dabla w tej turze
                const rzuconeLotkiNaDabla = Math.random() < 0.75 ? 3 : 2;
                return {
                    punkty: 0,
                    czyFura: false,
                    lotkaKonczaca: 3,
                    lotkiNaDoubla: rzuconeLotkiNaDabla,
                };
            }
        }

        // Przypadek 1B: Finisz 41-80 (bot rzuca singla/treble i schodzi pod czystego dabla)
        if (aktualnePunkty <= 80) {
            const dable = [40, 32, 24, 20, 16];
            const targetDabel = dable.find(d => d < aktualnePunkty);
            if (targetDabel) {
                return {
                    punkty: aktualnePunkty - targetDabel,
                    czyFura: false,
                    lotkaKonczaca: 3,
                    lotkiNaDoubla: 1,
                };
            }
        }

        // Przypadek 1C: Finisz > 80 (nieudana próba finiszu - bot punktuje rzutem setupującym)
        const params = pobierzParametryRzutu(avg);
        let scoredSetup = rzucJednaLotkeScoringowa(params) + rzucJednaLotkeScoringowa(params);
        if (aktualnePunkty - scoredSetup < 2) {
            const safe = znajdzNajlepszegoZostawienia(aktualnePunkty) || 32;
            scoredSetup = Math.max(0, aktualnePunkty - safe);
        }
        return {
            punkty: scoredSetup,
            czyFura: false,
            lotkaKonczaca: 3,
            lotkiNaDoubla: 1,
        };
    }

    // =========================================================================
    // 2. NORMALNA KOLEJKA PUNKTOWA (SCORING) LUB PRZYGOTOWANIE POD CHECKOUT
    // =========================================================================
    // Jeśli bot ma od 41 do 90 punktów, celowo ustawia się pod optymalnego dabla (nigdy nieparzysta reszta jak 13)
    if (aktualnePunkty <= 90) {
        const dable = [40, 32, 24, 20, 16];
        const targetDabel = dable.find(d => d < aktualnePunkty && (aktualnePunkty - d) <= 60);
        if (targetDabel && Math.random() < 0.85) {
            return {
                punkty: aktualnePunkty - targetDabel,
                czyFura: false,
                lotkaKonczaca: 3,
                lotkiNaDoubla: 0,
            };
        }
    }

    let rzuconePunkty = generujRzutScoringowy(avg);

    // KONTROLA BUSTU (FURY) I OCHRONA PRZED PRZYPADKOWYM ZEJŚCIEM PONIŻEJ 2:
    if (aktualnePunkty - rzuconePunkty <= 1) {
        if (aktualnePunkty <= 60 && Math.random() < 0.12) {
            return {
                punkty: 0,
                czyFura: true,
                lotkaKonczaca: 3,
                lotkiNaDoubla: 0,
            };
        }

        const targetDabel = znajdzNajlepszegoZostawienia(aktualnePunkty) || 32;
        rzuconePunkty = Math.max(0, aktualnePunkty - targetDabel);
    }

    return {
        punkty: rzuconePunkty,
        czyFura: false,
        lotkaKonczaca: 3,
        lotkiNaDoubla: 0,
    };
}

let botTimer = null;
let botTurnToken = 0;

function anulujTureBota() {
    botTurnToken++;

    if (botTimer !== null) {
        clearTimeout(botTimer);
        botTimer = null;
    }

    const input = document.getElementById("wpisz-wynik");
    if (input) input.placeholder = "0";
}

function wykonajTureBota(botGracz) {
    anulujTureBota();

    const input = document.getElementById("wpisz-wynik");
    if (input) input.placeholder = "DartBot rzuca...";

    const tokenTury = botTurnToken;
    const botId = botGracz.id;

    botTimer = setTimeout(() => {
        botTimer = null;

        if (tokenTury !== botTurnToken || botGracz.id !== botId) return;

        let wynikBota = obliczRzutBota(botGracz.punkty, botGracz.poziomBota);
        window.botOstatniaLotka = wynikBota.lotkaKonczaca;
        window.botLotkiNaDoubla = wynikBota.lotkiNaDoubla;

        przetwarzajRzutMeczu(
            wynikBota.punkty,
            wynikBota.czyFura ? "0" : wynikBota.punkty.toString(),
            wynikBota.lotkaKonczaca,
            null
        );

        if (input) {
            input.placeholder = "0";
            input.value = "";
        }
    }, 1500);
}