/**
 * turniej-pdc.js - Dynamiczna obsługa podstrony turnieju PDC na podstawie sluga z URL (?pc31 lub ?id=pc31)
 * Stacja Darta
 */

(function () {
    "use strict";

    const BAZA_OFICJALNYCH_TURNIEJOW = [
        {
            id: "pc31",
            tytul: "Players Championship 31",
            major: false,
            dataStart: "2026-10-28",
            dataKoniec: "2026-10-28",
            terminTekst: "28.10.2026 (Środa)",
            miejsce: "Maaspoort, Den Bosch (Holandia)",
            pula: "£125,000",
            odliczanie: "Za 5 dni",
            ranga: "PDC ProTour",
        },
        {
            id: "pc32",
            tytul: "Players Championship 32",
            major: false,
            dataStart: "2026-10-29",
            dataKoniec: "2026-10-29",
            terminTekst: "29.10.2026 (Czwartek)",
            miejsce: "Maaspoort, Den Bosch (Holandia)",
            pula: "£125,000",
            odliczanie: "Za 6 dni",
            ranga: "PDC ProTour",
        },
        {
            id: "gsod2026",
            tytul: "Grand Slam of Darts 2026",
            major: true,
            dataStart: "2026-11-08",
            dataKoniec: "2026-11-16",
            terminTekst: "08.11.2026 – 16.11.2026",
            miejsce: "WV Active Aldersley, Wolverhampton (Anglia)",
            pula: "£650,000",
            odliczanie: "W listopadzie",
            ranga: "PDC Premier / Major",
        },
        {
            id: "pcf2026",
            tytul: "Players Championship Finals 2026",
            major: true,
            dataStart: "2026-11-27",
            dataKoniec: "2026-11-29",
            terminTekst: "27.11.2026 – 29.11.2026",
            miejsce: "Butlin's Minehead Resort (Anglia)",
            pula: "£600,000",
            odliczanie: "W listopadzie",
            ranga: "PDC Premier / Major",
        },
        {
            id: "wch2027",
            tytul: "PDC World Darts Championship 2027",
            major: true,
            dataStart: "2026-12-15",
            dataKoniec: "2027-01-03",
            terminTekst: "15.12.2026 – 03.01.2027",
            miejsce: "Alexandra Palace, Londyn (UK)",
            pula: "£2,500,000",
            odliczanie: "W grudniu",
            ranga: "Mistrzostwa Świata PDC",
        },
        {
            id: "masters2027",
            tytul: "The Masters 2027",
            major: true,
            dataStart: "2027-01-29",
            dataKoniec: "2027-01-31",
            terminTekst: "29.01.2027 – 31.01.2027",
            miejsce: "Marshall Arena, Milton Keynes (Anglia)",
            pula: "£275,000",
            odliczanie: "W styczniu",
            ranga: "PDC Major",
        },
        {
            id: "pl2027",
            tytul: "Premier League Darts 2027 – Noc 1",
            major: true,
            dataStart: "2027-02-04",
            dataKoniec: "2027-02-04",
            terminTekst: "04.02.2027 (Czwartek)",
            miejsce: "SSE Arena, Belfast (Irlandia Płn.)",
            pula: "£1,000,000",
            odliczanie: "W lutym",
            ranga: "Premier League PDC",
        },
        {
            id: "ukopen2027",
            tytul: "UK Open 2027",
            major: true,
            dataStart: "2027-03-05",
            dataKoniec: "2027-03-07",
            terminTekst: "05.03.2027 – 07.03.2027",
            miejsce: "Butlin's Minehead Resort (Anglia)",
            pula: "£600,000",
            odliczanie: "W marcu",
            ranga: "PDC Major",
        },
    ];

    /**
     * Odczytanie sluga / identyfikatora turnieju z adresu URL
     * Obsługuje formaty:
     * - turniej-pdc.html?pc31
     * - turniej-pdc.html?id=pc31
     * - turniej-pdc.html?turniej=pc31
     */
    function pobierzSlugZUrl() {
        const query = window.location.search;
        if (!query || query === "?") return "pc31"; // Domyślny turniej w razie braku parametru

        const params = new URLSearchParams(query);
        const zId = params.get("id") || params.get("turniej");
        if (zId) return zId.toLowerCase().trim();

        // Jeśli adres to bezpośrednio ?pc31 (bez klucza 'id=')
        const czystyQuery = query.replace(/^\?/, "").split("&")[0].split("=")[0].toLowerCase().trim();
        return czystyQuery || "pc31";
    }

    /**
     * Wypełnienie danych nagłówkowych turnieju na podstawie znalezionego rekordu
     */
    function zaladujDaneTurnieju() {
        const slug = pobierzSlugZUrl();
        const turniej = BAZA_OFICJALNYCH_TURNIEJOW.find((t) => {
            const id = t.id.toLowerCase();
            return id === slug || id.startsWith(slug) || slug.startsWith(id);
        }) || BAZA_OFICJALNYCH_TURNIEJOW[0];

        // Tytuł strony w przeglądarce
        document.title = `${turniej.tytul} - Mecze Live | Stacja Dart`;

        // Elementy w karcie turnieju
        const elTytul = document.getElementById("turniej-tytul");
        const elTermin = document.getElementById("turniej-termin");
        const elMiejsce = document.getElementById("turniej-miejsce");
        const elPula = document.getElementById("turniej-pula");
        const elOdliczanie = document.getElementById("turniej-odliczanie");
        const elRangaTag = document.getElementById("turniej-ranga-tag");

        if (elTytul) elTytul.textContent = turniej.tytul;
        if (elTermin) elTermin.textContent = turniej.terminTekst;
        if (elMiejsce) elMiejsce.textContent = turniej.miejsce;
        if (elPula) elPula.textContent = turniej.pula;
        if (elOdliczanie) elOdliczanie.textContent = turniej.odliczanie;
        if (elRangaTag) elRangaTag.textContent = turniej.ranga || (turniej.major ? "Turniej Major" : "PDC ProTour");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", zaladujDaneTurnieju);
    } else {
        zaladujDaneTurnieju();
    }
})();
