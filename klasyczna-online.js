// ============================================================
// MODUŁ SIECIOWY ARENY ONLINE (klasyczna-online.js)
// ============================================================

let czyTrybOnline = false;
let czyWidz = false;
let mojIndeksOnline = -1; // 0 = Host, 1 = Gość, -1 = Widz
let kanalMeczuRealtime = null;
let odbieranieRzutuZSieci = false;

const parametryURL = new URLSearchParams(window.location.search);
const onlineKodPokoju = parametryURL.get("pokoj");
const onlineTryb = parametryURL.get("tryb");

function uruchomModulOnline() {
  if (!onlineKodPokoju) return;
  czyTrybOnline = true;
  inicjalizujPoczekalnieOnline(onlineKodPokoju);
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
// 1. STEROWANIE WIDOKIEM TURY I BLOKADAMI
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
// 2. POCZEKALNIA STOŁU I WERYFIKACJA TOŻSAMOŚCI TOKENEM
// ============================================================
async function inicjalizujPoczekalnieOnline(kod) {
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
    alert("Ten stół nie istnieje lub został już usunięty.");
    window.location.href = "./online.html";
    return;
  }

  // Bezpieczna weryfikacja tożsamości po stronie klienta (odporna na edycję URL ?rola=host)
  if (onlineTryb === "widz") {
    czyWidz = true;
    mojIndeksOnline = -1;
  } else {
    const zapisanyToken = sessionStorage.getItem(`sd_token_${kod}`);
    if (pokoj.host_token && pokoj.host_token === zapisanyToken) {
      mojIndeksOnline = 0;
      czyWidz = false;
    } else if (pokoj.gosc_token && pokoj.gosc_token === zapisanyToken) {
      mojIndeksOnline = 1;
      czyWidz = false;
    } else {
      // Jeśli brak tokenu w sesji, traktujemy jako widza (zapobiega oszustwom z adresu URL)
      mojIndeksOnline = -1;
      czyWidz = true;
    }
  }

  if (pokoj.status === "in_progress") {
    startMeczuOnline(pokoj);
    return;
  }

  const poczekalnia = document.createElement("div");
  poczekalnia.id = "poczekalnia-online";
  poczekalnia.style.width = "100%";
  poczekalnia.style.display = "flex";
  poczekalnia.style.justifyContent = "center";
  poczekalnia.style.alignItems = "center";
  poczekalnia.style.minHeight = "60vh";

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

  const kontenerMain = document.querySelector("main") || document.body;
  kontenerMain.prepend(poczekalnia);

  document.getElementById("btn-kopiuj-kod")?.addEventListener("click", () => {
    navigator.clipboard.writeText(kod);
    alert(`Skopiowano kod: ${kod}`);
  });

  document.getElementById("btn-opusc-poczekalnie")?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (mojIndeksOnline === 0) await usunAktualnyPokoj();
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
// 3. START MECZU ONLINE I AUTOZAPIS (F5)
// ============================================================
function startMeczuOnline(pokoj) {
  window.punktyStartowe = pokoj.punkty_startowe || 501;
  window.doceloweLegi = pokoj.docelowe_legi || 3;
  window.trybWejscia = pokoj.zasady_wejscia || "si";
  window.trybWyjscia = pokoj.zasady_wyjscia || "do";
  window.liczbaGraczy = 2;

  const hostNazwa = (!pokoj.host_nazwa || pokoj.host_nazwa === "Gracz") ? "Gospodarz" : pokoj.host_nazwa;
  const goscNazwa = (!pokoj.gosc_nazwa || pokoj.gosc_nazwa === "Gracz") ? "Gość" : pokoj.gosc_nazwa;

  window.gracze = [
    {
      id: 0,
      nazwa: hostNazwa,
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
      nazwa: goscNazwa,
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

  const czyPrzywrocono = przywrocStanOnlineZStorage();
  if (!czyPrzywrocono) {
    window.graczZaczynajacyLegIndex = 0;
    if (typeof window.resetujLeg === "function") {
      window.resetujLeg();
    }
  }

  window.sprawdzTureOnline();

  if (czyWidz || czyPrzywrocono) {
    setTimeout(() => {
      kanalMeczuRealtime?.send({
        type: "broadcast",
        event: "prosba-o-stan",
        payload: {}
      });
    }, 400);
  }
}

// ============================================================
// 4. TRANSMISJA STANU GRY NA ŻYWO (BROADCAST SNAPSHOT)
// ============================================================
function zainicjalizujKanalMeczu(kod) {
  kanalMeczuRealtime = supabaseClient.channel(`game-${kod}`, {
    config: { broadcast: { self: false } }
  });

  kanalMeczuRealtime
    .on("broadcast", { event: "aktualizacja-stanu" }, ({ payload }) => {
      zastosujStanGry(payload);
    })
    .on("broadcast", { event: "prosba-o-stan" }, () => {
      // Każdy z graczy (Host lub Gość) może odpowiedzieć na prośbę widza o stan
      wyslijAktualnyStanGry();
    })
    .on("broadcast", { event: "mecz-przerwany" }, () => {
      alert("Mecz został przerwany przez jednego z graczy.");
      sessionStorage.removeItem(`sd_stan_${onlineKodPokoju}`);
      sessionStorage.removeItem(`sd_token_${onlineKodPokoju}`);
      window.location.href = "./online.html";
    })
    .subscribe();

  // Jeśli jesteśmy widzem, ponawiaj prośbę o stan co 1.5 sekundy, dopóki tarcza się nie zaktualizuje
  if (czyWidz) {
    const interwalWidza = setInterval(() => {
      if (!window.gracze || window.gracze[0].punkty === window.punktyStartowe) {
        kanalMeczuRealtime?.send({
          type: "broadcast",
          event: "prosba-o-stan",
          payload: {}
        });
      } else {
        clearInterval(interwalWidza);
      }
    }, 1500);
  }
}

function wyslijAktualnyStanGry() {
  if (!czyTrybOnline || !kanalMeczuRealtime || !window.gracze) return;

  const stan = {
    aktualnyGraczIndex: window.aktualnyGraczIndex,
    aktualnaKolejka: window.aktualnaKolejka,
    gracze: window.gracze.map((g) => ({
      id: g.id,
      punkty: g.punkty,
      wygraneLegi: g.wygraneLegi,
      rzuty: g.rzuty || [],
      srednia: typeof window.obliczSredniaGracza === "function" ? window.obliczSredniaGracza(g.id) : "0.00",
      srednia9: typeof window.obliczSrednia9Lotek === "function" ? window.obliczSrednia9Lotek(g.id) : "0.00"
    }))
  };

  kanalMeczuRealtime.send({
    type: "broadcast",
    event: "aktualizacja-stanu",
    payload: stan
  });

  zapiszStanOnlineDoStorage();
}

function zastosujStanGry(dane) {
  if (!dane || !dane.gracze) return;

  odbieranieRzutuZSieci = true;

  dane.gracze.forEach((zdalnyGracz, idx) => {
    if (window.gracze && window.gracze[idx]) {
      window.gracze[idx].punkty = zdalnyGracz.punkty;
      window.gracze[idx].wygraneLegi = zdalnyGracz.wygraneLegi;
      window.gracze[idx].rzuty = zdalnyGracz.rzuty || [];

      const elPunkty = document.getElementById(`punkty-g${idx}`);
      if (elPunkty) elPunkty.textContent = zdalnyGracz.punkty;

      const elWygrane = document.getElementById(`wygrane-g${idx}`);
      if (elWygrane) elWygrane.textContent = `Wygrane rundy: ${zdalnyGracz.wygraneLegi}`;

      const elSrednia = document.getElementById(`srednia-tabela-g${idx}`);
      if (elSrednia) elSrednia.textContent = zdalnyGracz.srednia;

      const elSrednia9 = document.getElementById(`dziewiec-lotek-g${idx}`);
      if (elSrednia9) elSrednia9.textContent = zdalnyGracz.srednia9;

      const elCheckout = document.getElementById(`checkout-g${idx}`);
      if (elCheckout && typeof window.getCheckout === "function") {
        elCheckout.textContent = zdalnyGracz.punkty <= 170 && zdalnyGracz.punkty > 1 ? window.getCheckout(zdalnyGracz.punkty) : "";
      }
    }
  });

  window.aktualnyGraczIndex = dane.aktualnyGraczIndex;
  window.aktualnaKolejka = dane.aktualnaKolejka;

  document.querySelectorAll(".karta-gracza").forEach((karta, idx) => {
    if (idx === window.aktualnyGraczIndex) {
      karta.classList.add("aktywne-tury");
    } else {
      karta.classList.remove("aktywne-tury");
    }
  });

  odbieranieRzutuZSieci = false;
  window.sprawdzTureOnline();
  zapiszStanOnlineDoStorage();
}

// ============================================================
// 5. OBSŁUGA PAMIĘCI DLA MECZU SIECIOWEGO (F5)
// ============================================================
function zapiszStanOnlineDoStorage() {
  if (!czyTrybOnline || !window.gracze) return;
  const stan = {
    aktualnyGraczIndex: window.aktualnyGraczIndex,
    aktualnaKolejka: window.aktualnaKolejka,
    gracze: window.gracze,
    historiaAktualnegoLegu: window.historiaAktualnegoLegu || []
  };
  sessionStorage.setItem(`sd_stan_${onlineKodPokoju}`, JSON.stringify(stan));
}

function przywrocStanOnlineZStorage() {
  const surowe = sessionStorage.getItem(`sd_stan_${onlineKodPokoju}`);
  if (!surowe) return false;

  try {
    const stan = JSON.parse(surowe);
    window.aktualnyGraczIndex = stan.aktualnyGraczIndex;
    window.aktualnaKolejka = stan.aktualnaKolejka;
    window.gracze = stan.gracze;
    window.historiaAktualnegoLegu = stan.historiaAktualnegoLegu || [];

    if (typeof window.aktualizujKartyUI === "function") {
      window.aktualizujKartyUI();
    }
    return true;
  } catch (e) {
    return false;
  }
}

// ============================================================
// 6. PRZECHWYTYWANIE SILNIKA I USUWANIE STOŁU
// ============================================================
function podepnijNasluchRzutowSilnika() {
  const staryProces = window.wykonajProcesRzutu;
  window.wykonajProcesRzutu = function (punkty, opis, zuzyte, fura, panel) {
    staryProces(punkty, opis, zuzyte, fura, panel);

    if (czyTrybOnline && !czyWidz && !odbieranieRzutuZSieci) {
      wyslijAktualnyStanGry();
    }
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
    if (czyTrybOnline) {
      wyslijAktualnyStanGry();
      sessionStorage.removeItem(`sd_stan_${onlineKodPokoju}`);
      sessionStorage.removeItem(`sd_token_${onlineKodPokoju}`);
      if (mojIndeksOnline === 0) {
        await usunAktualnyPokoj();
      }
    }
  };

  document.getElementById("powrot-gra")?.addEventListener("click", async () => {
    if (czyTrybOnline) {
      if (kanalMeczuRealtime) {
        kanalMeczuRealtime.send({ type: "broadcast", event: "mecz-przerwany", payload: {} });
      }
      sessionStorage.removeItem(`sd_stan_${onlineKodPokoju}`);
      sessionStorage.removeItem(`sd_token_${onlineKodPokoju}`);
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
