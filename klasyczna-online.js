// ============================================================
// MODUŁ SIECIOWY ARENY ONLINE (klasyczna-online.js)
// ============================================================

let czyTrybOnline = false;
let czyWidz = false;
let mojIndeksOnline = -1; // 0 = Host, 1 = Gość, -1 = Widz
let kanalMeczuRealtime = null;
let odbieranieRzutuZSieci = false;

// 1. Odczytanie parametrów z paska adresu
const parametryURL = new URLSearchParams(window.location.search);
const onlineKodPokoju = parametryURL.get("pokoj");
const onlineMojaRola = parametryURL.get("rola");
const onlineTryb = parametryURL.get("tryb");

if (onlineKodPokoju) {
  czyTrybOnline = true;
  czyWidz = (onlineTryb === "widz" || onlineMojaRola === "widz");

  if (!czyWidz) {
    mojIndeksOnline = (onlineMojaRola === "host") ? 0 : 1;
  }

  document.addEventListener("DOMContentLoaded", () => {
    inicjalizujPoczekalnieOnline(onlineKodPokoju, onlineMojaRola);
    podepnijNasluchRzutowSilnika();
  });
}

// ============================================================
// 2. STEROWANIE WIDOKIEM TURY I BLOKADAMI
// ============================================================
window.sprawdzTureOnline = function () {
  if (!czyTrybOnline) return;

  const belkaKolejki = document.getElementById("wyswietl-kolejke");
  const graczRzucajacy = window.gracze ? window.gracze[window.aktualnyGraczIndex] : null;

  // OBSŁUGA WIDZA: ukrycie stref wprowadzania wyniku
  if (czyWidz) {
    const opcjeLiczenia = document.querySelector(".opcje-liczenia");
    if (opcjeLiczenia) opcjeLiczenia.style.display = "none";

    if (belkaKolejki) {
      belkaKolejki.innerHTML = `<span style="color: #38bdf8; font-weight: bold;">👁 TRYB WIDZA | Rzuca: ${graczRzucajacy?.nazwa || "Gracz"}</span>`;
    }
    return;
  }

  // OBSŁUGA GRACZY: blokada interfejsu poza własną turą
  const mojaKolej = (window.aktualnyGraczIndex === mojIndeksOnline);
  const inpWynik = document.getElementById("wpisz-wynik");
  const btnZatwierdz = document.getElementById("zatwierdz-rzut");
  const strefaKlik = document.querySelector(".strefa-klikania");
  const strefaManual = document.querySelector(".strefa-manualna");

  if (inpWynik) inpWynik.disabled = !mojaKolej;
  if (btnZatwierdz) btnZatwierdz.disabled = !mojaKolej;
  if (strefaKlik) strefaKlik.style.pointerEvents = mojaKolej ? "auto" : "none";
  if (strefaManual) strefaManual.style.pointerEvents = mojaKolej ? "auto" : "none";

  if (belkaKolejki) {
    belkaKolejki.innerHTML = mojaKolej
      ? `<span style="color: var(--secondary-color); font-weight: bold;">🎯 Twoja tura!</span>`
      : `<span style="color: #94a3b8;">⏳ Rzuca: <strong>${graczRzucajacy?.nazwa || "Rywal"}</strong></span>`;
  }
};

// ============================================================
// 3. POCZEKALNIA STOŁU
// ============================================================
async function inicjalizujPoczekalnieOnline(kod, rola) {
  const formOffline = document.getElementById("formularz-ustawien");
  const tytul = document.getElementById("tytul-strony");
  const btnPowrot = document.getElementById("powrot-do-gier");

  if (formOffline) formOffline.style.display = "none";
  if (tytul) tytul.style.display = "none";
  if (btnPowrot) btnPowrot.style.display = "none";

  // Pobranie danych pokoju z Supabase
  const { data: pokoj, error } = await supabaseClient
    .from("rooms")
    .select("*")
    .eq("kod_pokoju", kod)
    .single();

  if (error || !pokoj) {
    alert("Nie odnaleziono takiego stołu lub został on już zamknięty.");
    window.location.href = "./online.html";
    return;
  }

  // Jeśli rywal już jest w środku (np. wchodzimy jako Gość lub Widz w trakcie)
  if (pokoj.status === "in_progress") {
    startMeczuOnline(pokoj);
    return;
  }

  // Wyświetlenie poczekalni
  const poczekalnia = document.createElement("div");
  poczekalnia.id = "poczekalnia-online";
  poczekalnia.innerHTML = `
    <div style="background:#111827; border:1px solid #22c55e; border-radius:16px; padding:32px; max-width:480px; margin:50px auto; text-align:center; color:#fff; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
      <h2 style="color:#22c55e; margin:0 0 10px 0;">Stół: ${kod}</h2>
      <p style="color:#94a3b8; font-size:14px; margin:0 0 20px 0;">Gospodarz: <strong>${pokoj.host_nazwa}</strong> | Format: <strong>${pokoj.format_gry}</strong></p>
      
      <div id="status-oczekiwania" style="margin:20px 0; padding:16px; background:rgba(34,197,94,0.08); border:1px dashed #22c55e; border-radius:12px;">
        <span style="color:#22c55e; font-weight:600;">⏳ Oczekiwanie na dołączenie drugiego gracza...</span>
      </div>

      <div style="display:flex; flex-direction:column; gap:12px; margin-top:24px;">
        <button type="button" id="btn-kopiuj-kod" class="btn-primary" style="padding:12px; font-weight:bold; cursor:pointer;">
          📋 Kopiuj Kod Stołu (${kod})
        </button>
        <button type="button" id="btn-opusc-poczekalnie" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:13px; text-decoration:underline;">
          Opuść stół i usuń pokój
        </button>
      </div>
    </div>
  `;
  document.body.prepend(poczekalnia);

  document.getElementById("btn-kopiuj-kod")?.addEventListener("click", () => {
    navigator.clipboard.writeText(kod);
    alert(`Skopiowano kod: ${kod}`);
  });

  // Obsługa opuszczenia poczekalni (Host usuwa stół z bazy)
  document.getElementById("btn-opusc-poczekalnie")?.addEventListener("click", async () => {
    if (onlineMojaRola === "host") {
      await usunAktualnyPokoj();
    }
    window.location.href = "./online.html";
  });

  // Nasłuchiwanie wejścia rywala
  supabaseClient
    .channel(`room-wait-${kod}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "rooms", filter: `kod_pokoju=eq.${kod}` },
      (payload) => {
        const zaktualizowanyPokoj = payload.new;
        if (zaktualizowanyPokoj.status === "in_progress") {
          const statusBox = document.getElementById("status-oczekiwania");
          if (statusBox) {
            statusBox.innerHTML = `<span style="color:#22c55e; font-weight:bold;">🎮 Rywal (${zaktualizowanyPokoj.gosc_nazwa}) dołączył! Rozpoczynanie...</span>`;
          }
          setTimeout(() => {
            document.getElementById("poczekalnia-online")?.remove();
            startMeczuOnline(zaktualizowanyPokoj);
          }, 1200);
        }
      }
    )
    .subscribe();
}

// ============================================================
// 4. START MECZU ONLINE
// ============================================================
function startMeczuOnline(pokoj) {
  // Przekazanie parametrów do silnika gry
  window.punktyStartowe = pokoj.punkty_startowe || 501;
  window.doceloweLegi = pokoj.docelowe_legi || 3;
  window.trybWejscia = pokoj.zasady_wejscia || "si";
  window.trybWyjscia = pokoj.zasady_wyjscia || "do";
  window.liczbaGraczy = 2;

  window.gracze = [
    {
      id: 0,
      nazwa: pokoj.host_nazwa || "Gospodarz",
      punkty: window.punktyStartowe,
      wygraneLegi: 0,
      rzuty: [],
      najlepszyLeg: null,
      lotkiNaDoubla: 0,
      trafioneDouble: 0,
      czyBot: false
    },
    {
      id: 1,
      nazwa: pokoj.gosc_nazwa || "Gość",
      punkty: window.punktyStartowe,
      wygraneLegi: 0,
      rzuty: [],
      najlepszyLeg: null,
      lotkiNaDoubla: 0,
      trafioneDouble: 0,
      czyBot: false
    }
  ];

  // Blokada cofania rzutów w trybie sieciowym
  document.querySelectorAll("#btn-cofnij-rzut, .btn-cofnij").forEach((el) => {
    el.style.display = "none";
  });

  // Otwarcie kanału transmisji rzutów na żywo
  zainicjalizujKanalMeczu(pokoj.kod_pokoju);

  // Renderowanie kart zawodników
  const kontener = document.getElementById("kontener-graczy-w-grze");
  if (kontener) {
    kontener.innerHTML = "";
    window.gracze.forEach((g, i) => {
      kontener.innerHTML += `
        <div class="karta-gracza" id="karta-g${i}">
          <h2>${g.nazwa} ${(!czyWidz && i === mojIndeksOnline) ? "(Ty)" : ""}</h2>
          <div class="stan-meczu" id="wygrane-g${i}">Wygrane rundy: 0</div>
          <div class="wynik-główny" id="punkty-g${i}">${window.punktyStartowe}</div>
          <div class="checkout-sugerowany" id="checkout-g${i}"></div>
          <div class="karta-zakladki">
            <button type="button" class="zakladka-btn-karta aktywne-btn" onclick="przelaczZakladkeKarty(this, 'statystyki-g${i}', 'historia-g${i}')">Statystyki</button>
            <button type="button" class="zakladka-btn-karta" onclick="przelaczZakladkeKarty(this, 'historia-g${i}', 'statystyki-g${i}')">Historia</button>
          </div>
          <div id="statystyki-g${i}" class="zawartosc-karty panel-statystyk-karty">
            <table class="aktualne-statystyki-tabela">
              <tr><th>Średnia</th><td id="srednia-tabela-g${i}">0.00</td></tr>
              <tr><th>Pierwsze 9-lotek</th><td id="dziewiec-lotek-g${i}">0.00</td></tr>
              <tr class="ostatni-wiersz"><th>Ostatni Leg</th><td id="ostatni-leg-g${i}">-</td></tr>
            </table>
          </div>
          <div class="historia-rzutow panel-historii-karty" id="historia-g${i}" style="display: none;">
            <table class="tabela-historii-karty">
              <thead><tr><th>Lotki</th><th>Rzucone</th><th>Zostało</th></tr></thead>
              <tbody id="tabela-historia-body-g${i}">
                <tr><td colspan="3" style="color: #777; padding: 10px;">Brak rzutów</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
    });
  }

  // Włączenie planszy gry
  document.getElementById("formularz-ustawien").style.display = "none";
  document.getElementById("ekran-gry").style.display = "block";
  document.getElementById("cel-meczu").textContent = `Do ${window.doceloweLegi} wygranych`;

  // Start rozgrywki (zaczyna Host - indeks 0)
  window.graczZaczynajacyLegIndex = 0;
  if (typeof window.resetujLeg === "function") {
    window.resetujLeg();
  }
  window.sprawdzTureOnline();
}

// ============================================================
// 5. SYNCHRONIZACJA TRANSMISJI RZUTÓW (BROADCAST)
// ============================================================
function zainicjalizujKanalMeczu(kod) {
  kanalMeczuRealtime = supabaseClient.channel(`game-${kod}`, {
    config: { broadcast: { self: false } }
  });

  kanalMeczuRealtime
    .on("broadcast", { event: "rzut-rywala" }, ({ payload }) => {
      odbierzRzutRywala(payload);
    })
    .subscribe();
}

function wyslijMojRzut(punkty, opis, zuzyte, fura) {
  if (!czyTrybOnline || !kanalMeczuRealtime) return;

  kanalMeczuRealtime.send({
    type: "broadcast",
    event: "rzut-rywala",
    payload: {
      graczIndex: mojIndeksOnline,
      punkty: punkty,
      opis: opis,
      zuzyteLotki: zuzyte,
      czyFura: fura
    }
  });
}

function odbierzRzutRywala(dane) {
  odbieranieRzutuZSieci = true;
  if (typeof window.wykonajProcesRzutu === "function") {
    window.wykonajProcesRzutu(dane.punkty, dane.opis, dane.zuzyteLotki, dane.czyFura, null);
  }
  odbieranieRzutuZSieci = false;

  window.sprawdzTureOnline();
}

// ============================================================
// 6. INTEGRACJA Z SILNIKIEM I USUWANIE POKOI
// ============================================================
function podepnijNasluchRzutowSilnika() {
  // Przechwycenie wykonania rzutu
  const staryProces = window.wykonajProcesRzutu;
  window.wykonajProcesRzutu = function (punkty, opis, zuzyte, fura, panel) {
    if (czyTrybOnline && !czyWidz && !odbieranieRzutuZSieci) {
      wyslijMojRzut(punkty, opis, zuzyte, fura);
    }
    staryProces(punkty, opis, zuzyte, fura, panel);
  };

  // Przechwycenie aktualizacji interfejsu (zmiana tur)
  const staraAktualizacjaUI = window.aktualizujKartyUI;
  window.aktualizujKartyUI = function () {
    staraAktualizacjaUI();
    window.sprawdzTureOnline();
  };

  // Pominięcie pytania o doubla u gracza oczekującego i widza
  const staryPopupDoubles = window.pokazPopupDoubles;
  window.pokazPopupDoubles = function (czyZakonczyl, punktyPrzed, rzucone, maxLotek, callback) {
    if (czyTrybOnline && (czyWidz || window.aktualnyGraczIndex !== mojIndeksOnline)) {
      callback(czyZakonczyl ? 3 : 3, 0);
      return;
    }
    staryPopupDoubles(czyZakonczyl, punktyPrzed, rzucone, maxLotek, callback);
  };

  // Usuwanie pokoju po zakończeniu meczu (przez Hosta)
  const staryZakonczMecz = window.zakonczMecz;
  window.zakonczMecz = function (zwyciezca) {
    staryZakonczMecz(zwyciezca);
    if (czyTrybOnline && mojIndeksOnline === 0) {
      usunAktualnyPokoj();
    }
  };

  // Usuwanie pokoju po przerwaniu gry przyciskiem ✖ (przez Hosta)
  document.getElementById("powrot-gra")?.addEventListener("click", () => {
    if (czyTrybOnline && mojIndeksOnline === 0) {
      usunAktualnyPokoj();
    }
  });
}

// Bezpieczne usuwanie pokoju z Supabase
async function usunAktualnyPokoj() {
  if (!onlineKodPokoju) return;
  try {
    await supabaseClient
      .from("rooms")
      .delete()
      .eq("kod_pokoju", onlineKodPokoju);
  } catch (err) {
    console.warn("Błąd usuwania stołu:", err);
  }
}
