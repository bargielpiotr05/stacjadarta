// =========================================================================
// DARTBOT - Moduł sztucznej inteligencji przeciwnika (DartBot)
// =========================================================================

// Niemożliwe 3-lotkowe zamknięcia w darcie (tzw. Bogey numbers powyżej 158)
const niemozliweZamknieciaBota = [169, 168, 166, 165, 163, 162, 159];

/**
 * Zwraca maksymalny wynik, z którego bot o danej średniej podejmuje realną próbę zakończenia laga.
 */
function pobierzMaksymalnyCheckoutBota(avg) {
    if (avg < 40) return 40;  // Tylko pojedyncze double (D20 w dół) oraz Bull (50)
    if (avg < 55) return 60;  // Single + Double (np. 52 = S12 + D20)
    if (avg < 70) return 80;  // Single/Treble + Double
    if (avg < 85) return 110; // Standardowe kombinacje
    return 170;               // Poziom zaawansowany / mistrzowski
}

/**
 * Generuje realistyczny rzut 3 lotkami w fazie punktowej (scoring).
 * Precyzyjnie trzyma średnią pojedynczego lega w oknie wybranym przez gracza (np. 40-50 przy śr. 45),
 * eliminując zawyżone pierwsze 9 lotek i powtarzające się rzuty 100/140.
 */
function generujRzutScoringowy(avg) {
    const pSlabe = Math.max(0.04, Math.min(0.50, (70.0 - avg) / 130.0));
    const pWysokie = Math.max(0.01, Math.min(0.35, Math.pow(avg / 100.0, 2.7) * 0.55));
    const pMaks = avg >= 70 ? Math.min(0.20, Math.pow((avg - 60.0) / 40.0, 2.5) * 0.18) : 0.0;
    const pDobre = Math.max(0.12, Math.min(0.40, (avg - 18.0) / 90.0));
    const pTypowe = Math.max(0.15, 1.0 - (pSlabe + pWysokie + pMaks + pDobre));

    const los = Math.random();

    // 1. Słabsze kolejki (np. 15, 22, 26, 30, 35)
    if (los < pSlabe) {
        const slabe = [15, 22, 26, 26, 30, 35];
        return slabe[Math.floor(Math.random() * slabe.length)];
    }

    // 2. Typowe kolejki amatora wokół 41-45 pkt
    let skumulowane = pSlabe;
    if (los < skumulowane + pTypowe) {
        const typowe = [41, 41, 45, 45, 43];
        return typowe[Math.floor(Math.random() * typowe.length)];
    }
    skumulowane += pTypowe;

    // 3. Dobre kolejki (60 pkt - 3x S20)
    if (los < skumulowane + pDobre) {
        return 60;
    }
    skumulowane += pDobre;

    // 4. Bardzo dobre kolejki (81, 85, sporadycznie 100)
    if (los < skumulowane + pWysokie) {
        if (avg < 55) {
            // Dla śr. < 55: 100 to rzadki rzut (ok. 1-2% wszystkich rzutów w meczu)
            const wysokie = [81, 85, 81, 85, 100];
            return wysokie[Math.floor(Math.random() * wysokie.length)];
        } else {
            const wysokie = [81, 85, 100, 100];
            return wysokie[Math.floor(Math.random() * wysokie.length)];
        }
    }

    // 5. Rzuty maksymalne (140, 180) - dostępne wyłącznie dla poziomu zaawansowanego (śr. >= 70)
    if (avg >= 80 && Math.random() < 0.20) {
        return 180;
    }
    return 140;
}

/**
 * Zwraca optymalnego dabla pod zostawienie (40, 32, 24, 20, 16, 12, 8, 4).
 * Zapewnia, że bot nie zostawi nieparzystej reszty (np. 13, 7).
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
        // Naturalna skuteczność na doublach:
        // avg 30: ~22%, avg 45: ~30%, avg 60: ~38%, avg 75: ~46%, avg 90: ~54%
        const bazowaSkutecznoscDoubli = Math.max(0.20, Math.min(0.55, 0.15 + (avg / 100) * 0.38));
        let mnoznikTrudnosci = 1.0;

        const czyBezposredniDouble =
            (aktualnePunkty <= 40 && aktualnePunkty % 2 === 0) || aktualnePunkty === 50;

        if (czyBezposredniDouble) {
            mnoznikTrudnosci = 1.0;
        } else if (aktualnePunkty <= 40) {
            mnoznikTrudnosci = 0.65;
        } else if (aktualnePunkty <= 60) {
            mnoznikTrudnosci = 0.55;
        } else if (aktualnePunkty <= 100) {
            mnoznikTrudnosci = 0.32;
        } else {
            mnoznikTrudnosci = 0.12;
        }

        const szansaZamkniecia = bazowaSkutecznoscDoubli * mnoznikTrudnosci;

        // --- SUKCES: BOT ZAMYKA LEGA ---
        if (Math.random() < szansaZamkniecia) {
            let uzyteLotki = 3;
            if (czyBezposredniDouble) {
                const losL = Math.random();
                uzyteLotki = losL < 0.35 ? 1 : losL < 0.70 ? 2 : 3;
            } else if (aktualnePunkty <= 40) {
                // Nieparzyste reszty <= 40 nigdy nie kończą się w 1 lotce
                uzyteLotki = Math.random() < 0.60 ? 2 : 3;
            } else if (aktualnePunkty <= 100) {
                uzyteLotki = Math.random() < 0.45 ? 2 : 3;
            } else {
                uzyteLotki = 3;
            }

            return {
                punkty: aktualnePunkty,
                czyFura: false,
                lotkaKonczaca: uzyteLotki,
                lotkiNaDoubla: 1,
            };
        }

        // --- PORAŻKA PRZY CHECKOUCIE (Nie zamknął) ---
        // Przypadek 1A: Bezpośrednio na doublu (<= 40 parzyste lub 50)
        if (czyBezposredniDouble) {
            const losPudla = Math.random();

            // Tylko sporadycznie (20%) trafia singla danego dabla dzielącego go na parzysty dabel (np. D20 -> S20 / D10, D16 -> S16 / D8)
            if (aktualnePunkty <= 40 && aktualnePunkty % 4 === 0 && losPudla < 0.20) {
                const pktZSingla = Math.floor(aktualnePunkty / 2);
                return {
                    punkty: pktZSingla,
                    czyFura: false,
                    lotkaKonczaca: 3,
                    lotkiNaDoubla: 1,
                };
            } else if (losPudla < 0.90) {
                // Zdecydowana większość pudeł to pudło obok drutu (0 pkt) - zostaje na tym samym czystym doublu
                return {
                    punkty: 0,
                    czyFura: false,
                    lotkaKonczaca: 3,
                    lotkiNaDoubla: 1,
                };
            } else {
                // Drobny rzut w bok bez fury
                const bezpiecznePkt = Math.min(Math.max(0, aktualnePunkty - 2), Math.floor(Math.random() * 3) + 1);
                return {
                    punkty: bezpiecznePkt,
                    czyFura: false,
                    lotkaKonczaca: 3,
                    lotkiNaDoubla: 1,
                };
            }
        }

        // Przypadek 1B: Finisz nieparzysty <= 40 lub 41-80 (bot ustawia się pod dabla)
        if (aktualnePunkty <= 80) {
            const targetDabel = znajdzNajlepszegoZostawienia(aktualnePunkty);
            if (targetDabel !== null) {
                return {
                    punkty: aktualnePunkty - targetDabel,
                    czyFura: false,
                    lotkaKonczaca: 3,
                    lotkiNaDoubla: 1,
                };
            }
        }
    }

    // =========================================================================
    // 2. NORMALNA KOLEJKA PUNKTOWA (SCORING) LUB PRZYGOTOWANIE POD CHECKOUT
    // =========================================================================
    // Jeśli bot ma od 41 do 90 punktów, celowo ustawia się pod optymalnego dabla (nigdy nieparzysta reszta jak 13)
    if (aktualnePunkty <= 90) {
        const targetDabel = znajdzNajlepszegoZostawienia(aktualnePunkty);
        if (targetDabel !== null && Math.random() < 0.80) {
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
        if (aktualnePunkty <= 60 && Math.random() < 0.15) {
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