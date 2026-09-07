// ============================================================
// MODUŁ SIECIOWY ARENY ONLINE (klasyczna-online.js)
// ============================================================

let czyTrybOnline = false;
let mojIndeksOnline = 0; // 0 = Host, 1 = Gość
let kanalMeczuRealtime = null;
let odbieranieRzutuZSieci = false;

// 1. Sprawdzenie czy w adresie URL jest parametr pokoju
const parametryURL = new URLSearchParams(window.location.search);
const onlineKodPokoju = parametryURL.get("pokoj");
const onlineMojaRola = parametryURL.get("rola") || "host";
const onlineMojNick = parametryURL.get("nick") || (onlineMojaRola === "host" ? "Host" : "Gość");

// Jeśli jesteśmy w trybie online, uruchamiamy moduł po załadowaniu drzewa DOM
if (onlineKodPokoju) {
  czyTrybOnline = true;
  mojIndeksOnline = onlineMojaRola === "host" ? 0 : 1;

  document.addEventListener("DOMContentLoaded", () => {
    inicjalizujPoczekalnieOnline(onlineKodPokoju, onlineMojaRola);
    podepnijNasluchRzutowSilnika();
  });
}

// Bezpieczna atrapa dla trybu offline (zapobiega błędom, gdy funkcja jest wywoływana lokalnie)
window.sprawdzTureOnline = function () {
  if (!czyTrybOnline) return;

  const mojaKolej = (aktualnyGraczIndex === mojIndeksOnline);
  const graczRzucajacy = gracze ? gracze[aktualnyGraczIndex] : null;

  const inpWynik = document.getElementById("wpisz-wynik");
  const btnZatwierdz = document.getElementById("zatwierdz-rzut");
  const strefaKlik = document.querySelector(".strefa-klikania");
  const strefaManual = document.querySelector(".strefa-manualna");
  const belkaKolejki = document.getElementById("wyswietl-kolejke");

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
// 2. POCZEKALNIA STOŁU
// ============================================================
async function inicjalizujPoczekalnieOnline(kod, rola) {
  const formOffline = document.getElementById("formularz-ustawien");
  const tytul = document.getElementById("tytul-strony");
  const btnPowrot = document.getElementById("powrot-do-gier");

  if (formOffline) formOffline.style.display = "none";
  if (tytul) tytul.style.display = "none";
  if (btnPowrot) btnPowrot.style.display = "none";

  // Pobranie danych stołu z Supabase
  const { data: pokoj, error } = await supabaseClient
    .from("rooms")
    .select("*")
    .eq("kod_pokoju", kod)
    .single();

  if (error || !pokoj) {
    alert("Nie odnaleziono takiego pokoju lub stół został skasowany.");
    window.location.href = "./online.html";
    return;
  }

  // Jeśli rywal już dołączył (np. wchodzimy jako Gość)
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

      <div style="display:flex; flex-direction:column; gap:10px; margin-top:24px;">
        <button type="button" id="btn-kopiuj-kod" class="btn-primary" style="padding:12px; font-weight:bold; cursor:pointer;">
          📋 Kopiuj Kod Stołu (${kod})
        </button>
        <a href="./online.html" style="color:#94a3b8; text-decoration:none; font-size:13px; margin-top:8px;">Wróć do lobby</a>
      </div>
    </div>
  `;
  document.body.prepend(poczekalnia);

  document.getElementById("btn-kopiuj-kod")?.addEventListener("click", () => {
    navigator.clipboard.writeText(kod);
    alert(`Skopiowano kod: ${kod}`);
  });

  // Nasłuchiwanie na dołączenie gościa
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
// 3. START MECZU ONLINE I SYNCHRONIZACJA
// ============================================================
function startMeczuOnline(pokoj) {
  // Przekazanie ustawień pokoju do silnika
  punktyStartowe = pokoj.punkty_startowe || 501;
  doceloweLegi = pokoj.docelowe_legi || 3;
  trybWejscia = pokoj.zasady_wejscia || "si";
  trybWyjscia = pokoj.zasady_wyjscia || "do";
  liczbaGraczy = 2;

  gracze = [
    {
      id: 0,
      nazwa: pokoj.host_nazwa || "Gospodarz",
      punkty: punktyStartowe,
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
      punkty: punktyStartowe,
      wygraneLegi: 0,
      rzuty: [],
      najlepszyLeg: null,
      lotkiNaDoubla: 0,
      trafioneDouble: 0,
      czyBot: false
    }
  ];

  // Blokada cofania rzutów w trybie online (zapobiega desynchronizacji)
  document.querySelectorAll("#btn-cofnij-rzut, .btn-cofnij").forEach((el) => {
    el.style.display = "none";
  });

  // Otwarcie kanału WebSocket Realtime Broadcast
  zainicjalizujKanalMeczu(pokoj.kod_pokoju);

  // Wygenerowanie kart graczy na tarczy
  const kontener = document.getElementById("kontener-graczy-w-grze");
  if (kontener) {
    kontener.innerHTML = "";
    gracze.forEach((g, i) => {
      kontener.innerHTML += `
        <div class="karta-gracza" id="karta-g${i}">
          <h2>${g.nazwa} ${i === mojIndeksOnline ? "(Ty)" : ""}</h2>
          <div class="stan-meczu" id="wygrane-g${i}">Wygrane rundy: 0</div>
          <div class="wynik-główny" id="punkty-g${i}">${punktyStartowe}</div>
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

  // Włączenie ekranu tarczy
  document.getElementById("formularz-ustawien").style.display = "none";
  document.getElementById("ekran-gry").style.display = "block";
  document.getElementById("cel-meczu").textContent = `Do ${doceloweLegi} wygranych`;

  // Start rozgrywki — pierwszy leg rozpoczyna Host (indeks 0)
  graczZaczynajacyLegIndex = 0;
  resetujLeg();
  window.sprawdzTureOnline();
}

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
  wykonajProcesRzutu(dane.punkty, dane.opis, dane.zuzyteLotki, dane.czyFura, null);
  odbieranieRzutuZSieci = false;
  
  // Natychmiast zaktualizuj blokadę po rzucie rywala
  window.sprawdzTureOnline();
}

// Przechwytywanie silnika gry
function podepnijNasluchRzutowSilnika() {
  // 1. Nadpisanie wykonania rzutu (wysyłka w sieć)
  const staryProces = wykonajProcesRzutu;
  wykonajProcesRzutu = function (punkty, opis, zuzyte, fura, panel) {
    if (czyTrybOnline && !odbieranieRzutuZSieci) {
      wyslijMojRzut(punkty, opis, zuzyte, fura);
    }
    staryProces(punkty, opis, zuzyte, fura, panel);
  };

  // 2. Automatyczne blokowanie/odblokowywanie tarczy przy każdej zmianie tury
  const staraAktualizacjaUI = aktualizujKartyUI;
  aktualizujKartyUI = function () {
    staraAktualizacjaUI();
    window.sprawdzTureOnline();
  };

  // 3. Wyłączenie popupu o liczbę rzuconych doubli na ekranie rywala (gdy nie jest nasza tura)
  const staryPopupDoubles = pokazPopupDoubles;
  pokazPopupDoubles = function (czyZakonczyl, punktyPrzed, rzucone, maxLotek, callback) {
    if (czyTrybOnline && aktualnyGraczIndex !== mojIndeksOnline) {
      // Rywal nie odpowiada za doubla rzucającego – automatycznie pomijamy
      callback(czyZakonczyl ? 3 : 3, 0);
      return;
    }
    staryPopupDoubles(czyZakonczyl, punktyPrzed, rzucone, maxLotek, callback);
  };
}
