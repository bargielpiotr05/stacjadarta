const niemozliweZamknieciaBota = [169, 168, 166, 165, 163, 162, 159];

function obliczRzutBota(aktualnePunkty, poziomIntStr) {
    let avg = parseInt(poziomIntStr);
    if (isNaN(avg)) avg = 50;

    let minScore = Math.max(10, avg - 5);
    let maxScore = Math.min(180, avg + 5);
    let checkoutChance = Math.max(0.05, (avg / 100) * 0.60);
    let szansaNaDobryRzut = Math.max(0.05, (avg / 100) * 0.35);
    let szansaNaZlyRzut = Math.max(0.02, ((100 - avg) / 100) * 0.25);

    if (aktualnePunkty <= 170 && !niemozliweZamknieciaBota.includes(aktualnePunkty)) {
        let realnaSzansa = checkoutChance;

        if (aktualnePunkty > 40 && aktualnePunkty <= 90) {
            realnaSzansa = checkoutChance * 0.5; 
        } else if (aktualnePunkty > 90) {
            realnaSzansa = checkoutChance * 0.15;
            if (avg < 45) realnaSzansa = 0; 
        }

        if (Math.random() < realnaSzansa) {
            let uzyteLotki = 3;
            if (aktualnePunkty <= 40) uzyteLotki = Math.floor(Math.random() * 2) + 1; 
            else if (aktualnePunkty <= 100) uzyteLotki = Math.floor(Math.random() * 2) + 2; 

            return { punkty: aktualnePunkty, czyFura: false, lotkaKonczaca: uzyteLotki, lotkiNaDoubla: 1 };
        } else {
            let chybioneDouble = aktualnePunkty <= 40 ? (Math.floor(Math.random() * 2) + 1) : 0; 
            let bezpieczneZostawienia = [40, 32, 24, 16, 8, 4].filter(v => v < aktualnePunkty);

            if (bezpieczneZostawienia.length > 0) {
                let z = bezpieczneZostawienia[Math.floor(Math.random() * Math.min(3, bezpieczneZostawienia.length))];
                return { punkty: aktualnePunkty - z, czyFura: false, lotkaKonczaca: 3, lotkiNaDoubla: chybioneDouble };
            } else {
                return { punkty: aktualnePunkty + 10, czyFura: true, lotkaKonczaca: 3, lotkiNaDoubla: chybioneDouble };
            }
        }
    }

    let wylosowanePunkty = Math.floor(Math.random() * (maxScore - minScore + 1)) + minScore;
    let losGeniuszu = Math.random();

    if (losGeniuszu < szansaNaZlyRzut) {
        wylosowanePunkty = Math.floor(Math.random() * 15) + 3;
    } else if (losGeniuszu > (1 - szansaNaDobryRzut)) {
        if (avg >= 70) {
            wylosowanePunkty = Math.random() > 0.8 ? 140 : 100;
            if (Math.random() > 0.95) wylosowanePunkty = 180;
        } else if (avg >= 55) {
            wylosowanePunkty = Math.random() > 0.9 ? 140 : 85;
        } else if (avg >= 40) {
            wylosowanePunkty = 81;
        } else {
            wylosowanePunkty = 60;
        }
    }

    if (wylosowanePunkty > 180) wylosowanePunkty = 180;
    while (niemozliweZamknieciaBota.includes(wylosowanePunkty)) wylosowanePunkty--;

    if (aktualnePunkty - wylosowanePunkty <= 1) {
        let z = [40, 32, 24, 16].filter(v => v < aktualnePunkty);
        if (z.length > 0) wylosowanePunkty = aktualnePunkty - z[0];
        else return { punkty: aktualnePunkty + 10, czyFura: true, lotkaKonczaca: 3, lotkiNaDoubla: 0 }; 
    }

    return { punkty: wylosowanePunkty, czyFura: false, lotkaKonczaca: 3, lotkiNaDoubla: 0 };
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
    const input = document.getElementById("wpisz-wynik");
    if(input) input.placeholder = "DartBot rzuca...";

    anulujTureBota();
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

        if(input) { input.placeholder = "0"; input.value = ""; }
    }, 1500);
}