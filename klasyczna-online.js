// ============================================================
// MODUŁ SIECIOWY ARENY ONLINE (klasyczna-online.js)
// ============================================================

let czyTrybOnline = false;
let czyWidz = false;
let mojIndeksOnline = -1; // 0 = Host, 1 = Gość, -1 = Widz
let kanalMeczuRealtime = null;
let kanalCzekaniaPoczekalni = null;
let czyMeczJuzWystartowal = false;
let odbieranieRzutuZSieci = false;
let lokalnaWersjaStanu = 0;
let czyMeczZakonczonyOnline = false;

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
// SYSTEMOWY MODAL ONLINE (zamiast standardowych alert i confirm)
// ============================================================
function pokazModalSystemowyOnline(tytul, wiadomosc, typ = 'alert', callback = null) {
  const overlay = document.createElement('div');
  overlay.className = 'custom-popup-overlay';
  overlay.style.display = 'flex';
  overlay.style.zIndex = '9999'; // Gwarantuje przykrycie całej gry

  const box = document.createElement('div');
  box.className = 'custom-popup-box';

  const title = document.createElement('h3');
  title.textContent = tytul;

  const desc = document.createElement('p');
  desc.textContent = wiadomosc;

  const btnContainer = document.createElement('div');
  btnContainer.className = 'custom-popup-buttons';

  if (typ === 'confirm') {
    const btnTak = document.createElement('button');
    btnTak.className = 'popup-btn popup-btn-yes';
    btnTak.textContent = 'Tak';
    btnTak.onclick = () => { overlay.remove(); if (callback) callback(true); };

    const btnNie = document.createElement('button');
    btnNie.className = 'popup-btn popup-btn-no';
    btnNie.textContent = 'Nie';
    btnNie.onclick = () => { overlay.remove(); if (callback) callback(false); };

    btnContainer.appendChild(btnTak);
    btnContainer.appendChild(btnNie);
  } else {
    // Tryb alert (tylko przycisk OK)
    const btnOk = document.createElement('button');
    btnOk.className = 'popup-btn popup-btn-yes';
    btnOk.textContent = 'OK';
    btnOk.onclick = () => { overlay.remove(); if (callback) callback(); };
    btnContainer.appendChild(btnOk);
  }

  box.appendChild(title);
  box.appendChild(desc);
  box.appendChild(btnContainer);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
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

  // NAPRAWA: Zablokowanie klawiatury tel. + AUTO-FOCUS na PC
  if (inpWynik) {
    if (!mojaKolej) {
      inpWynik.disabled = true; // Zawsze zablokowane w turze rywala
    } else {
      // W naszej turze włączamy input TYLKO na komputerach (>=1500px)
      inpWynik.disabled = (window.innerWidth < 1500);

      // Jeśli jesteśmy na komputerze (pole nie jest disabled), wymuszamy focus
      if (!inpWynik.disabled) {
        // setTimeout gwarantuje, że focus wskoczy zaraz po odświeżeniu DOM
        setTimeout(() => {
          inpWynik.focus();
        }, 50);
      }
    }
  }

  if (btnZatwierdz) btnZatwierdz.disabled = !mojaKolej;

  if (strefaKlik) {
    strefaKlik.style.pointerEvents = mojaKolej ? "auto" : "none";
    strefaKlik.style.opacity = mojaKolej ? "1" : "0.45";
    strefaKlik.style.transition = "opacity 0.25s ease";
  }
  if (strefaManual) {
    strefaManual.style.pointerEvents = mojaKolej ? "auto" : "none";
    strefaManual.style.opacity = mojaKolej ? "1" : "0.45";
    strefaManual.style.transition = "opacity 0.25s ease";
  }

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
    pokazModalSystemowyOnline("Błąd stołu", "Ten stół nie istnieje lub został już usunięty.", "alert", () => {
      window.location.href = "./online.html";
    });
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

  if (pokoj.status === "in_progress" || pokoj.status === "finished") {
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
    if (typeof pokazCustomowyAlert === "function") {
      pokazCustomowyAlert(`Skopiowano kod stołu: ${kod}`);
    } else {
      alert(`Skopiowano kod: ${kod}`);
    }
  });

  document.getElementById("btn-opusc-poczekalnie")?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (mojIndeksOnline === 0) await usunAktualnyPokoj();
    window.location.href = "./online.html";
  });

  kanalCzekaniaPoczekalni = supabaseClient
    .channel(`room-wait-${kod}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "rooms", filter: `kod_pokoju=eq.${kod}` },
      (payload) => {
        const zaktualizowanyPokoj = payload.new;
        if (zaktualizowanyPokoj.status === "in_progress" && !czyMeczJuzWystartowal) {
          if (kanalCzekaniaPoczekalni) {
            supabaseClient.removeChannel(kanalCzekaniaPoczekalni);
            kanalCzekaniaPoczekalni = null;
          }

          const statusBox = document.getElementById("status-oczekiwania");
          if (statusBox) {
            statusBox.innerHTML = `<span style="color:#22c55e; font-weight:bold;">🎮 Rywal (${zaktualizowanyPokoj.gosc_nazwa}) dołączył! Startujemy...</span>`;
          }
          setTimeout(() => {
            document.getElementById("poczekalnia-online")?.remove();
            startMeczuOnline(zaktualizowanyPokoj);
          }, 600);
        }
      }
    )
    .subscribe();
}

// ============================================================
// 3. START MECZU ONLINE
// ============================================================
function startMeczuOnline(pokoj) {
  if (czyMeczJuzWystartowal) return;
  czyMeczJuzWystartowal = true;

  if (kanalCzekaniaPoczekalni) {
    supabaseClient.removeChannel(kanalCzekaniaPoczekalni);
    kanalCzekaniaPoczekalni = null;
  }
  document.getElementById("poczekalnia-online")?.remove();

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

  if (pokoj.status === "finished" && pokoj.stan_gry?.zwyciezca) {
    pokazEkranKoncaMeczu(pokoj.stan_gry.zwyciezca, pokoj.stan_gry.historiaMeczuLegi);
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
        if (payload.new && payload.new.status === "finished" && !czyMeczZakonczonyOnline) {
          setTimeout(() => {
            pokazEkranKoncaMeczu(payload.new.stan_gry?.zwyciezca, payload.new.stan_gry?.historiaMeczuLegi);
          }, 250);
        }
      }
    )
    .on("broadcast", { event: "aktualizacja-stanu" }, ({ payload }) => {
      zastosujStanGry(payload);
    })
    .on("broadcast", { event: "koniec-meczu" }, ({ payload }) => {
      if (!czyMeczZakonczonyOnline) {
        setTimeout(() => {
          pokazEkranKoncaMeczu(payload.zwyciezca, payload.historiaMeczuLegi);
        }, 250);
      }
    })
    .on("broadcast", { event: "prosba-o-stan" }, () => {
      if (!czyWidz) {
        wyslijAktualnyStanGry();
      }
    })
    .on("broadcast", { event: "mecz-przerwany" }, () => {
      pokazModalSystemowyOnline("Mecz przerwany", "Mecz został zakończony przez drugiego gracza.", "alert", () => {
        window.location.href = "./online.html";
      });
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        const { data, error } = await supabaseClient
          .from("rooms")
          .select("stan_gry")
          .eq("kod_pokoju", kod)
          .maybeSingle();
        if (data && data.stan_gry) {
          zastosujStanGry(data.stan_gry);
        } else {
          kanalMeczuRealtime.send({
            type: "broadcast",
            event: "prosba-o-stan",
            payload: {}
          });
        }
      }
    });
}

function wyslijAktualnyStanGry(dodatkowePola = {}) {
  const listaGraczy = (typeof gracze !== "undefined") ? gracze : (window.gracze || []);
  const graczIndex = (typeof aktualnyGraczIndex !== "undefined") ? aktualnyGraczIndex : (window.aktualnyGraczIndex || 0);
  const kolejka = (typeof aktualnaKolejka !== "undefined") ? aktualnaKolejka : (window.aktualnaKolejka || 1);
  const historiaLegu = (typeof historiaAktualnegoLegu !== "undefined") ? historiaAktualnegoLegu : (window.historiaAktualnegoLegu || []);
  const historiaLegow = (typeof historiaMeczuLegi !== "undefined") ? historiaMeczuLegi : (window.historiaMeczuLegi || []);
  const zaczynajacyIndex = (typeof graczZaczynajacyLegIndex !== "undefined") ? graczZaczynajacyLegIndex : (window.graczZaczynajacyLegIndex || 0);

  if (!czyTrybOnline || listaGraczy.length === 0) return;

  lokalnaWersjaStanu = Date.now();

  const stan = {
    aktualnyGraczIndex: graczIndex,
    aktualnaKolejka: kolejka,
    graczZaczynajacyLegIndex: zaczynajacyIndex,
    historiaAktualnegoLegu: historiaLegu,
    historiaMeczuLegi: historiaLegow,
    wersjaStanu: lokalnaWersjaStanu,
    gracze: listaGraczy.map((g) => ({
      id: g.id,
      punkty: g.punkty,
      wygraneLegi: g.wygraneLegi,
      rzuty: g.rzuty || [],
      najlepszyLeg: g.najlepszyLeg || null,
      lotkiNaDoubla: g.lotkiNaDoubla || 0,
      trafioneDouble: g.trafioneDouble || 0,
      srednia: typeof obliczSredniaGracza === "function" ? obliczSredniaGracza(g.id) : "0.00",
      srednia9: typeof obliczSrednia9Lotek === "function" ? obliczSrednia9Lotek(g.id) : "0.00"
    })),
    ...dodatkowePola
  };

  kanalMeczuRealtime?.send({
    type: "broadcast",
    event: "aktualizacja-stanu",
    payload: stan
  });

  const payloadBaza = {
    stan_gry: stan,
    wynik_host: listaGraczy[0]?.wygraneLegi || 0,
    wynik_gosc: listaGraczy[1]?.wygraneLegi || 0
  };

  if (dodatkowePola.czyKoniec) {
    payloadBaza.status = "finished";
  }

  supabaseClient
    .from("rooms")
    .update(payloadBaza)
    .eq("kod_pokoju", onlineKodPokoju)
    .then();
}

function zastosujStanGry(dane) {
  if (!dane || !dane.gracze) return;
  if (dane.wersjaStanu && dane.wersjaStanu <= lokalnaWersjaStanu) {
    return;
  }
  if (dane.wersjaStanu) {
    lokalnaWersjaStanu = dane.wersjaStanu;
  }

  odbieranieRzutuZSieci = true;

  const listaGraczy = (typeof gracze !== "undefined") ? gracze : (window.gracze || []);

  if (typeof historiaAktualnegoLegu !== "undefined") historiaAktualnegoLegu = dane.historiaAktualnegoLegu || [];
  window.historiaAktualnegoLegu = dane.historiaAktualnegoLegu || [];

  if (dane.historiaMeczuLegi) {
    if (typeof historiaMeczuLegi !== "undefined") historiaMeczuLegi = dane.historiaMeczuLegi;
    window.historiaMeczuLegi = dane.historiaMeczuLegi;
  }

  if (dane.graczZaczynajacyLegIndex !== undefined) {
    window.graczZaczynajacyLegIndex = dane.graczZaczynajacyLegIndex;
    if (typeof graczZaczynajacyLegIndex !== "undefined") graczZaczynajacyLegIndex = dane.graczZaczynajacyLegIndex;
  }

  dane.gracze.forEach((zdalnyGracz, idx) => {
    if (listaGraczy && listaGraczy[idx]) {
      listaGraczy[idx].punkty = zdalnyGracz.punkty;
      listaGraczy[idx].wygraneLegi = zdalnyGracz.wygraneLegi;
      listaGraczy[idx].rzuty = zdalnyGracz.rzuty || [];
      listaGraczy[idx].najlepszyLeg = zdalnyGracz.najlepszyLeg || null;
      listaGraczy[idx].lotkiNaDoubla = zdalnyGracz.lotkiNaDoubla || 0;
      listaGraczy[idx].trafioneDouble = zdalnyGracz.trafioneDouble || 0;

      const elPunkty = document.getElementById(`punkty-g${idx}`);
      if (elPunkty) elPunkty.textContent = zdalnyGracz.punkty;

      const elWygrane = document.getElementById(`wygrane-g${idx}`);
      if (elWygrane) elWygrane.textContent = `Wygrane rundy: ${zdalnyGracz.wygraneLegi}`;

      const elSrednia = document.getElementById(`srednia-tabela-g${idx}`);
      if (elSrednia) elSrednia.textContent = zdalnyGracz.srednia;

      const elSrednia9 = document.getElementById(`dziewiec-lotek-g${idx}`);
      if (elSrednia9) elSrednia9.textContent = zdalnyGracz.srednia9;

      const elOstatniLeg = document.getElementById(`ostatni-leg-g${idx}`);
      if (elOstatniLeg && typeof pobierzOstatniLeg === "function") {
        elOstatniLeg.textContent = pobierzOstatniLeg(listaGraczy[idx].id);
      }

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

  if (dane.czyKoniec && dane.zwyciezca && !czyMeczZakonczonyOnline) {
    setTimeout(() => {
      pokazEkranKoncaMeczu(dane.zwyciezca, dane.historiaMeczuLegi);
    }, 250);
  }
}

function pokazEkranKoncaMeczu(zwyciezca, historiaLegow) {
  if (czyMeczZakonczonyOnline) return;
  czyMeczZakonczonyOnline = true; // Zabezpieczenie przed podwójnym wyświetleniem

  if (historiaLegow) {
    if (typeof historiaMeczuLegi !== "undefined") historiaMeczuLegi = historiaLegow;
    window.historiaMeczuLegi = historiaLegow;
  }

  if (typeof zakonczMecz === "function") {
    zakonczMecz(zwyciezca);
  } else {
    document.getElementById("ekran-gry").style.display = "none";
    const ekranWyg = document.querySelector(".ekran-wygranej");
    if (ekranWyg) ekranWyg.style.display = "flex";
    const wygrTxt = document.getElementById("wygrany");
    if (wygrTxt && zwyciezca) wygrTxt.textContent = `Wygrywa ${zwyciezca.nazwa}!`;
  }
}

// ============================================================
// 5. OBSŁUGA SILNIKA GRY I ZMIAN TURY
// ============================================================
function podepnijNasluchSilnika() {
  const orgProces = window.wykonajProcesRzutu || (typeof wykonajProcesRzutu === "function" ? wykonajProcesRzutu : null);
  window.wykonajProcesRzutu = function (punkty, opis, zuzyte, fura, panel) {
    if (orgProces) orgProces(punkty, opis, zuzyte, fura, panel);
    window.sprawdzTureOnline();
    if (czyTrybOnline && !czyWidz && !odbieranieRzutuZSieci) {
      wyslijAktualnyStanGry();
    }
  };

  const staryPopupDoubles = window.pokazPopupDoubles;
  window.pokazPopupDoubles = function (czyZakonczyl, punktyPrzed, rzucone, maxLotek, callback) {
    const graczIndex = (typeof aktualnyGraczIndex !== "undefined") ? aktualnyGraczIndex : window.aktualnyGraczIndex;

    if (czyTrybOnline && (czyWidz || graczIndex !== mojIndeksOnline)) {
      // Oszukana odpowiedź u drugiego gracza, aby skrypt nie zablokował się w tle
      callback(czyZakonczyl ? 3 : 3, 0);
      return;
    }

    if (typeof staryPopupDoubles === "function") {
      staryPopupDoubles(czyZakonczyl, punktyPrzed, rzucone, maxLotek, (lotkaKonczaca, lotkiNaDoubla) => {
        callback(lotkaKonczaca, lotkiNaDoubla);
      });
    }
  };

  const orgResetuj = window.resetujLeg;
  window.resetujLeg = function () {
    if (typeof orgResetuj === "function") orgResetuj();
    window.sprawdzTureOnline();
    if (czyTrybOnline && !czyWidz && !odbieranieRzutuZSieci) {
      wyslijAktualnyStanGry();
    }
  };

  const orgAktualizujUI = window.aktualizujKartyUI;
  window.aktualizujKartyUI = function () {
    if (typeof orgAktualizujUI === "function") orgAktualizujUI();
    window.sprawdzTureOnline();
  };

  // Zerowanie flagi końca przed nowym meczem
  const orgRozpocznij = window.rozpocznijWlasciwaGre || (typeof rozpocznijWlasciwaGre === "function" ? rozpocznijWlasciwaGre : null);
  window.rozpocznijWlasciwaGre = function (idx) {
    czyMeczZakonczonyOnline = false;
    if (orgRozpocznij) orgRozpocznij(idx);
  };

  const orgZakoncz = window.zakonczMecz;
  window.zakonczMecz = function (zwyciezca) {
    const bylJuzKoniec = czyMeczZakonczonyOnline;
    czyMeczZakonczonyOnline = true;

    if (typeof orgZakoncz === "function") orgZakoncz(zwyciezca);
    window.sprawdzTureOnline();

    if (czyTrybOnline && !czyWidz && !odbieranieRzutuZSieci && !bylJuzKoniec) {
      const historiaLegow = (typeof historiaMeczuLegi !== "undefined") ? historiaMeczuLegi : (window.historiaMeczuLegi || []);

      kanalMeczuRealtime?.send({
        type: "broadcast",
        event: "koniec-meczu",
        payload: { zwyciezca, historiaMeczuLegi: historiaLegow }
      });
      wyslijAktualnyStanGry({ czyKoniec: true, zwyciezca, historiaMeczuLegi: historiaLegow });
    }
  };

  const orgCofnij = window.cofnijRzut || (typeof cofnijRzut === "function" ? cofnijRzut : null);
  window.cofnijRzut = function () {
    if (orgCofnij) orgCofnij();
    window.sprawdzTureOnline();
    if (czyTrybOnline && !czyWidz && !odbieranieRzutuZSieci) {
      wyslijAktualnyStanGry();
    }
  };

  // NAPRAWA: Nadpisujemy funkcję responsywną z klasyczna.html, żeby obracanie 
  // telefonu w trakcie gry nie psuło blokady tur online.
  const orgSprawdzRozmiar = window.sprawdzRozmiar;
  window.sprawdzRozmiar = function () {
    if (czyTrybOnline && !czyWidz) {
      window.sprawdzTureOnline(); // Używa naszej nowej, bezpiecznej logiki
    } else if (orgSprawdzRozmiar) {
      orgSprawdzRozmiar(); // Tryb offline działa po staremu
    }
  };

  document.getElementById("powrot-gra")?.addEventListener("click", () => {
    if (czyTrybOnline) {
      if (czyWidz) {
        window.location.href = "./online.html";
      } else {
        pokazModalSystemowyOnline(
          "Przerwanie meczu",
          "Czy na pewno chcesz opuścić stół? Mecz zostanie natychmiast przerwany dla obu graczy.",
          "confirm",
          async (potwierdzono) => {
            if (potwierdzono) {
              kanalMeczuRealtime?.send({ type: "broadcast", event: "mecz-przerwany", payload: {} });
              if (mojIndeksOnline === 0) await usunAktualnyPokoj();
              window.location.href = "./online.html";
            }
          }
        );
      }
    }
  });

  window.addEventListener("pagehide", () => {
    if (czyTrybOnline && mojIndeksOnline === 0 && onlineKodPokoju) {
      fetch(`${SUPABASE_URL}/rest/v1/rooms?kod_pokoju=eq.${onlineKodPokoju}&status=neq.finished`, {
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