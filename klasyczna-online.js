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
  podepnijNasluchSilnika();
}

if (onlineKodPokoju) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", uruchomModulOnline);
  } else {
    uruchomModulOnline();
  }
}

// ============================================================
// 1. STEROWANIE BLOKADAMI I KOLEJKĄ
// ============================================================
window.sprawdzTureOnline = function () {
  if (!czyTrybOnline) return;

  const graczIndex = (typeof aktualnyGraczIndex !== "undefined") ? aktualnyGraczIndex : (window.aktualnyGraczIndex || 0);
  const listaGraczy = (typeof gracze !== "undefined") ? gracze : (window.gracze || []);
  const graczRzucajacy = listaGraczy[graczIndex];

  const belkaKolejki = document.getElementById("wyswietl-kolejke");

  if (czyWidz) {
    const opcjeLiczenia = document.querySelector(".opcje-liczenia");
    if (opcjeLiczenia) opcjeLiczenia.style.display = "none";

    if (belkaKolejki) {
      belkaKolejki.innerHTML = `<span style="color: #38bdf8; font-weight: bold;">👁 TRYB WIDZA | Rzuca: ${graczRzucajacy?.nazwa || "Gracz"}</span>`;
    }
    return;
  }

  const mojaKolej = (graczIndex === mojIndeksOnline);
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
// 2. POCZEKALNIA STOŁU I WERYFIKACJA TOŻSAMOŚCI
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
          }, 800);
        }
      }
    )
    .subscribe();
}

// ============================================================
// 3. START MECZU ONLINE
// ============================================================
function startMeczuOnline(pokoj) {
  window.punktyStartowe = pokoj.punkty_startowe || 501;
  window.doceloweLegi = pokoj.docelowe_legi || 3;
  window.trybWejscia = pokoj.zasady_wejscia || "si";
  window.trybWyjscia = pokoj.zasady_wyjscia || "do";
  window.liczbaGraczy = 2;

  if (typeof punktyStartowe !== "undefined") punktyStartowe = window.punktyStartowe;
  if (typeof doceloweLegi !== "undefined") doceloweLegi = window.doceloweLegi;
  if (typeof liczbaGraczy !== "undefined") liczbaGraczy = 2;

  const hostNazwa = (!pokoj.host_nazwa || pokoj.host_nazwa === "Gracz") ? "Gospodarz" : pokoj.host_nazwa;
  const goscNazwa = (!pokoj.gosc_nazwa || pokoj.gosc_nazwa === "Gracz") ? "Gość" : pokoj.gosc_nazwa;

  const nowiGracze = [
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

  window.gracze = nowiGracze;
  if (typeof gracze !== "undefined") gracze = nowiGracze;

  document.querySelectorAll("#btn-cofnij-rzut, .btn-cofnij").forEach((el) => {
    el.style.display = "none";
  });

  const kontener = document.getElementById("kontener-graczy-w-grze");
  if (kontener) {
    kontener.innerHTML = "";
    nowiGracze.forEach((g, i) => {
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

  if (pokoj.stan_gry) {
    zastosujStanGry(pokoj.stan_gry);
  } else {
    window.graczZaczynajacyLegIndex = 0;
    if (typeof graczZaczynajacyLegIndex !== "undefined") graczZaczynajacyLegIndex = 0;
    if (typeof resetujLeg === "function") resetujLeg();
  }

  zainicjalizujKanalMeczu(pokoj.kod_pokoju);
  window.sprawdzTureOnline();
}

// ============================================================
// 4. TRANSMISJA STANU (BROADCAST + POSTGRES)
// ============================================================
function zainicjalizujKanalMeczu(kod) {
  if (kanalMeczuRealtime) supabaseClient.removeChannel(kanalMeczuRealtime);

  kanalMeczuRealtime = supabaseClient.channel(`game-${kod}`, {
    config: { broadcast: { self: false } }
  });

  kanalMeczuRealtime
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "rooms", filter: `kod_pokoju=eq.${kod}` },
      (payload) => {
        if (payload.new && payload.new.stan_gry) {
          zastosujStanGry(payload.new.stan_gry);
        }
      }
    )
    .on("broadcast", { event: "aktualizacja-stanu" }, ({ payload }) => {
      zastosujStanGry(payload);
    })
    .on("broadcast", { event: "prosba-o-stan" }, () => {
      if (!czyWidz) {
        wyslijAktualnyStanGry();
      }
    })
    .on("broadcast", { event: "mecz-przerwany" }, () => {
      alert("Mecz został przerwany przez jednego z graczy.");
      window.location.href = "./online.html";
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        kanalMeczuRealtime.send({
          type: "broadcast",
          event: "prosba-o-stan",
          payload: {}
        });
      }
    });
}

function wyslijAktualnyStanGry() {
  const listaGraczy = (typeof gracze !== "undefined") ? gracze : (window.gracze || []);
  const graczIndex = (typeof aktualnyGraczIndex !== "undefined") ? aktualnyGraczIndex : (window.aktualnyGraczIndex || 0);
  const kolejka = (typeof aktualnaKolejka !== "undefined") ? aktualnaKolejka : (window.aktualnaKolejka || 1);
  const historiaLegu = (typeof historiaAktualnegoLegu !== "undefined") ? historiaAktualnegoLegu : (window.historiaAktualnegoLegu || []);

  if (!czyTrybOnline || listaGraczy.length === 0) return;

  const stan = {
    aktualnyGraczIndex: graczIndex,
    aktualnaKolejka: kolejka,
    historiaAktualnegoLegu: historiaLegu,
    gracze: listaGraczy.map((g) => ({
      id: g.id,
      punkty: g.punkty,
      wygraneLegi: g.wygraneLegi,
      rzuty: g.rzuty || [],
      srednia: typeof obliczSredniaGracza === "function" ? obliczSredniaGracza(g.id) : "0.00",
      srednia9: typeof obliczSrednia9Lotek === "function" ? obliczSrednia9Lotek(g.id) : "0.00"
    }))
  };

  kanalMeczuRealtime?.send({
    type: "broadcast",
    event: "aktualizacja-stanu",
    payload: stan
  });

  supabaseClient
    .from("rooms")
    .update({
      stan_gry: stan,
      wynik_host: listaGraczy[0]?.wygraneLegi || 0,
      wynik_gosc: listaGraczy[1]?.wygraneLegi || 0
    })
    .eq("kod_pokoju", onlineKodPokoju)
    .then();
}

function zastosujStanGry(dane) {
  if (!dane || !dane.gracze) return;

  odbieranieRzutuZSieci = true;

  const listaGraczy = (typeof gracze !== "undefined") ? gracze : (window.gracze || []);
  if (typeof historiaAktualnegoLegu !== "undefined") historiaAktualnegoLegu = dane.historiaAktualnegoLegu || [];
  window.historiaAktualnegoLegu = dane.historiaAktualnegoLegu || [];

  dane.gracze.forEach((zdalnyGracz, idx) => {
    if (listaGraczy && listaGraczy[idx]) {
      listaGraczy[idx].punkty = zdalnyGracz.punkty;
      listaGraczy[idx].wygraneLegi = zdalnyGracz.wygraneLegi;
      listaGraczy[idx].rzuty = zdalnyGracz.rzuty || [];

      const elPunkty = document.getElementById(`punkty-g${idx}`);
      if (elPunkty) elPunkty.textContent = zdalnyGracz.punkty;

      const elWygrane = document.getElementById(`wygrane-g${idx}`);
      if (elWygrane) elWygrane.textContent = `Wygrane rundy: ${zdalnyGracz.wygraneLegi}`;

      const elSrednia = document.getElementById(`srednia-tabela-g${idx}`);
      if (elSrednia) elSrednia.textContent = zdalnyGracz.srednia;

      const elSrednia9 = document.getElementById(`dziewiec-lotek-g${idx}`);
      if (elSrednia9) elSrednia9.textContent = zdalnyGracz.srednia9;

      const elCheckout = document.getElementById(`checkout-g${idx}`);
      if (elCheckout && typeof getCheckout === "function") {
        elCheckout.textContent = (zdalnyGracz.punkty <= 170 && zdalnyGracz.punkty > 1) ? getCheckout(zdalnyGracz.punkty) : "";
      }

      if (typeof aktualizujHistorieRzutowUI === "function") {
        aktualizujHistorieRzutowUI(listaGraczy[idx].id, idx);
      }
    }
  });

  if (typeof aktualnyGraczIndex !== "undefined") aktualnyGraczIndex = dane.aktualnyGraczIndex;
  window.aktualnyGraczIndex = dane.aktualnyGraczIndex;

  if (typeof aktualnaKolejka !== "undefined") aktualnaKolejka = dane.aktualnaKolejka;
  window.aktualnaKolejka = dane.aktualnaKolejka;

  const elKolejka = document.getElementById("wyswietl-kolejke");
  if (elKolejka && !czyWidz) {
    elKolejka.textContent = `Lotki: ${(dane.aktualnaKolejka - 1) * 3}`;
  }

  if (typeof aktualizujCalaHistorieLeguUI === "function") {
    aktualizujCalaHistorieLeguUI();
  }

  document.querySelectorAll(".karta-gracza").forEach((karta, idx) => {
    if (idx === dane.aktualnyGraczIndex) {
      karta.classList.add("aktywne-tury");
    } else {
      karta.classList.remove("aktywne-tury");
    }
  });

  setTimeout(() => {
    odbieranieRzutuZSieci = false;
  }, 50);

  window.sprawdzTureOnline();
}

// ============================================================
// 5. OBSŁUGA SILNIKA GRY
// ============================================================
function podepnijNasluchSilnika() {
  const orgProces = window.wykonajProcesRzutu || (typeof wykonajProcesRzutu === "function" ? wykonajProcesRzutu : null);

  window.wykonajProcesRzutu = function (punkty, opis, zuzyte, fura, panel) {
    if (orgProces) orgProces(punkty, opis, zuzyte, fura, panel);

    if (czyTrybOnline && !czyWidz && !odbieranieRzutuZSieci) {
      wyslijAktualnyStanGry();
    }
  };

  const staryPopupDoubles = window.pokazPopupDoubles;
  window.pokazPopupDoubles = function (czyZakonczyl, punktyPrzed, rzucone, maxLotek, callback) {
    const graczIndex = (typeof aktualnyGraczIndex !== "undefined") ? aktualnyGraczIndex : window.aktualnyGraczIndex;
    if (czyTrybOnline && (czyWidz || graczIndex !== mojIndeksOnline)) {
      callback(czyZakonczyl ? 3 : 3, 0);
      return;
    }
    if (typeof staryPopupDoubles === "function") {
      staryPopupDoubles(czyZakonczyl, punktyPrzed, rzucone, maxLotek, callback);
    }
  };

  document.getElementById("powrot-gra")?.addEventListener("click", async () => {
    if (czyTrybOnline) {
      kanalMeczuRealtime?.send({ type: "broadcast", event: "mecz-przerwany", payload: {} });
      if (mojIndeksOnline === 0) await usunAktualnyPokoj();
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
    await supabaseClient
      .from("rooms")
      .delete()
      .eq("kod_pokoju", onlineKodPokoju);
  } catch (err) {
    console.warn("Błąd usuwania stołu:", err);
  }
}