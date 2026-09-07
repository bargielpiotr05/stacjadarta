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

// Bezpieczny start niezależnie od momentu załadowania DOM
function uruchomModulOnline() {
  if (!onlineKodPokoju) return;

  czyTrybOnline = true;
  czyWidz = (onlineTryb === "widz" || onlineMojaRola === "widz");

  if (!czyWidz) {
    mojIndeksOnline = (onlineMojaRola === "host") ? 0 : 1;
  }

  inicjalizujPoczekalnieOnline(onlineKodPokoju, onlineMojaRola);
  podepnijNasluchRzutowSilnika();
}

if (onlineKodPokoju) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", uruchomModulOnline);
  } else {
    uruchomModulOnline();
  }
}

// ============================================================
// 2. STEROWANIE WIDOKIEM TURY I BLOKADAMI
// ============================================================
window.sprawdzTureOnline = function () {
  if (!czyTrybOnline) return;

  const belkaKolejki = document.getElementById("wyswietl-kolejke");
  const graczRzucajacy = window.gracze ? window.gracze[window.aktualnyGraczIndex] : null;

  if (czyWidz) {
    const opcjeLiczenia = document.querySelector(".opcje-liczenia");
    if (opcjeLiczenia) opcjeLiczenia.style.display = "none";

    if (belkaKolejki) {
      belkaKolejki.innerHTML = `<span style="color: #38bdf8; font-weight: bold;">👁 TRYB WIDZA | Rzuca: ${graczRzucajacy?.nazwa || "Gracz"}</span>`;
    }
    return;
  }

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
// 3. POCZEKALNIA STOŁU (WYŚRODKOWANA W <MAIN>)
// ============================================================
async function inicjalizujPoczekalnieOnline(kod, rola) {
  const formOffline = document.getElementById("formularz-ustawien");
  const tytul = document.getElementById("tytul-strony");
  const menuBelka = document.querySelector(".menu");
  const btnPowrot = document.getElementById("powrot-do-gier");

  if (formOffline) formOffline.style.display = "none";
  if (tytul) tytul.style.display = "none";
  if (menuBelka) menuBelka.style.display = "none";
  if (btnPowrot) btnPowrot.style.display = "none";

  const { data: pokoj, error } = await supabaseClient
    .from("rooms")
    .select("*")
    .eq("kod_pokoju", kod)
    .maybeSingle();

  if (error || !pokoj) {
    alert("Ten stół nie istnieje lub został już usunięty. Przenoszę do lobby.");
    window.location.href = "./online.html";
    return;
  }

  if (pokoj.status === "in_progress") {
    startMeczuOnline(pokoj);
    return;
  }

  // Budowa poczekalni wyśrodkowanej w <main>
  const poczekalnia = document.createElement("div");
  poczekalnia.id = "poczekalnia-online";
  poczekalnia.style.width = "100%";
  poczekalnia.style.display = "flex";
  poczekalnia.style.justifyContent = "center";
  poczekalnia.style.alignItems = "center";
  poczekalnia.style.minHeight = "60vh";
  poczekalnia.style.position = "relative";
  poczekalnia.style.zIndex = "10";

  poczekalnia.innerHTML = `
    <div style="background: rgba(17, 24, 39, 0.95); border: 1px solid #22c55e; border-radius: 16px; padding: 32px; max-width: 480px; width: 90%; margin: auto; text-align: center; color: #fff; box-shadow: 0 20px 40px rgba(0,0,0,0.6); backdrop-filter: blur(10px);">
      <h2 style="color: #22c55e; margin: 0 0 10px 0; font-size: 24px;">Stół: ${kod}</h2>
      <p style="color: #94a3b8; font-size: 14px; margin: 0 0 20px 0;">Gospodarz: <strong>${pokoj.host_nazwa}</strong> | Format: <strong>${pokoj.format_gry}</strong></p>
      
      <div id="status-oczekiwania" style="margin: 20px 0; padding: 16px; background: rgba(34,197,94,0.08); border: 1px dashed #22c55e; border-radius: 12px;">
        <span style="color: #22c55e; font-weight: 600;">⏳ Oczekiwanie na dołączenie drugiego gracza...</span>
      </div>

      <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 24px;">
        <button type="button" id="btn-kopiuj-kod" class="btn-primary" style="padding: 12px; font-weight: bold; cursor: pointer;">
          📋 Kopiuj Kod Stołu (${kod})
        </button>
        <button type="button" id="btn-opusc-poczekalnie" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 13px; text-decoration: underline;">
          Opuść stół i usuń pokój
        </button>
      </div>
    </div>
  `;

  // Wstawienie jako pierwszy element <main> (idealnie pod paskiem nawigacji)
  const kontenerMain = document.querySelector("main") || document.body;
  kontenerMain.prepend(poczekalnia);

  document.getElementById("btn-kopiuj-kod")?.addEventListener("click", () => {
    navigator.clipboard.writeText(kod);
    alert(`Skopiowano kod: ${kod}`);
  });

  document.getElementById("btn-opusc-poczekalnie")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const btn = e.currentTarget;
    btn.textContent = "Usuwanie...";
    btn.disabled = true;

    if (onlineMojaRola === "host") {
      await usunAktualnyPokoj();
    }
    window.location.href = "./online.html";
  });

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
            statusBox.innerHTML = `<span style="color:#22c55e; font-weight:bold;">🎮 Rywal (${zaktualizowanyPokoj.gosc_nazwa}) dołączył! Startujemy...</span>`;
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

  document.querySelectorAll("#btn-cofnij-rzut, .btn-cofnij").forEach((el) => {
    el.style.display = "none";
  });

  zainicjalizujKanalMeczu(pokoj.kod_pokoju);

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

  document.getElementById("formularz-ustawien").style.display = "none";
  document.getElementById("ekran-gry").style.display = "block";
  document.getElementById("cel-meczu").textContent = `Do ${window.doceloweLegi} wygranych`;

  window.graczZaczynajacyLegIndex = 0;
  if (typeof window.resetujLeg === "function") {
    window.resetujLeg();
  }
  window.sprawdzTureOnline();
}

// ============================================================
// 5. SYNCHRONIZACJA TRANSMISJI RZUTÓW
// ============================================================
function zainicjalizujKanalMeczu(kod) {
  kanalMeczuRealtime = supabaseClient.channel(`game-${kod}`, {
    config: { broadcast: { self: false } }
  });

  kanalMeczuRealtime
    .on("broadcast", { event: "rzut-rywala" }, ({ payload }) => {
      odbierzRzutRywala(payload);
    })
    .on("broadcast", { event: "mecz-przerwany" }, () => {
      alert("Przeciwnik opuścił stół. Mecz został zakończony.");
      window.location.href = "./online.html";
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
// 6. PRZECHWYTYWANIE SILNIKA I USUWANIE STOŁU
// ============================================================
function podepnijNasluchRzutowSilnika() {
  const staryProces = window.wykonajProcesRzutu;
  window.wykonajProcesRzutu = function (punkty, opis, zuzyte, fura, panel) {
    if (czyTrybOnline && !czyWidz && !odbieranieRzutuZSieci) {
      wyslijMojRzut(punkty, opis, zuzyte, fura);
    }
    staryProces(punkty, opis, zuzyte, fura, panel);
  };

  const staraAktualizacjaUI = window.aktualizujKartyUI;
  window.aktualizujKartyUI = function () {
    staraAktualizacjaUI();
    window.sprawdzTureOnline();
  };

  const staryPopupDoubles = window.pokazPopupDoubles;
  window.pokazPopupDoubles = function (czyZakonczyl, punktyPrzed, rzucone, maxLotek, callback) {
    if (czyTrybOnline && (czyWidz || window.aktualnyGraczIndex !== mojIndeksOnline)) {
      callback(czyZakonczyl ? 3 : 3, 0);
      return;
    }
    staryPopupDoubles(czyZakonczyl, punktyPrzed, rzucone, maxLotek, callback);
  };

  const staryZakonczMecz = window.zakonczMecz;
  window.zakonczMecz = async function (zwyciezca) {
    staryZakonczMecz(zwyciezca);
    if (czyTrybOnline && mojIndeksOnline === 0) {
      await usunAktualnyPokoj();
    }
  };

  document.getElementById("powrot-gra")?.addEventListener("click", async () => {
    if (czyTrybOnline) {
      if (kanalMeczuRealtime) {
        kanalMeczuRealtime.send({ type: "broadcast", event: "mecz-przerwany", payload: {} });
      }
      if (mojIndeksOnline === 0) {
        await usunAktualnyPokoj();
      }
      window.location.href = "./online.html";
    }
  });

  window.addEventListener("pagehide", () => {
    if (czyTrybOnline && mojIndeksOnline === 0 && onlineKodPokoju) {
      fetch(`${SUPABASE_URL}/rest/v1/rooms?kod_pokoju=eq.${onlineKodPokoju}`, {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        },
        keepalive: true
      });
    }
  });
}

async function usunAktualnyPokoj() {
  if (!onlineKodPokoju) return;
  try {
    const { error } = await supabaseClient
      .from("rooms")
      .delete()
      .eq("kod_pokoju", onlineKodPokoju);

    if (error) {
      console.error("Błąd usuwania stołu:", error);
    }
  } catch (err) {
    console.warn("Wyjątek usuwania stołu:", err);
  }
}
