// ============================================================
// MODUŁ SIECIOWY ARENY ONLINE (klasyczna-online.js)
// ============================================================

let czyTrybOnline = false;
let czyWidz = false;
let mojIndeksOnline = -1; // 0 = Host, 1 = Gość, -1 = Widz
let kanalMeczuRealtime = null;
let kanalCzekaniaPoczekalni = null;
let czyMeczJuzWystartowal = false;
let timerSprawdzaniaPoczekalni = null;
let sprawdzaniePoczekalni = false;
let odbieranieRzutuZSieci = false;
let lokalnaWersjaStanu = 0;
let czyMeczZakonczonyOnline = false;

function onlineZLimitemCzasu(obietnica, etap, timeoutMs = 12000) {
  let timerId;
  const timeout = new Promise((resolve, reject) => {
    timerId = setTimeout(() => reject(new Error(`Przekroczono czas oczekiwania: ${etap}`)), timeoutMs);
  });
  return Promise.race([obietnica, timeout]).finally(() => clearTimeout(timerId));
}

async function pobierzWierszeOnline(tabela, params, accessToken, etap) {
  const apiKey = supabaseClient.supabaseKey;
  if (!apiKey) throw new Error("Brak klucza API klienta Supabase.");

  const response = await onlineZLimitemCzasu(fetch("/api/supabase-read", {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ table: tabela, params, accessToken }),
    cache: "no-store",
  }), etap);
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || result.details || `Błąd HTTP ${response.status}`);
  return result;
}

async function przypiszGosciaDoPokoju(kod, user, nick, hostId, accessToken) {
  const klient = window.supabaseClient || window.supabaseKlient;
  const wyslij = async (token) => {
    const response = await onlineZLimitemCzasu(fetch("/api/supabase-write", {
      method: "POST",
      headers: { apikey: klient.supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "rooms",
        operation: "update",
        filters: { kod_pokoju: kod, status: "waiting", gosc_id: null },
        values: {
          gosc_id: user.id,
          gosc_nazwa: nick,
          status: "in_progress",
          aktualny_gracz_id: hostId,
          stan_meczu: { tura: 1, pozostale_rzuty: 3 },
        },
        accessToken: token,
      }),
      cache: "no-store",
    }), "zapisywanie gościa w pokoju");

    const text = await response.text();
    const rows = text ? JSON.parse(text) : [];
    if (!response.ok) {
      const error = new Error(rows.message || rows.details || `Błąd HTTP ${response.status}`);
      error.code = rows.code;
      throw error;
    }
    if (!Array.isArray(rows) || !rows[0]) {
      throw new Error("Pokój nie został zaktualizowany. Sprawdź, czy nadal czeka na gościa i politykę UPDATE tabeli rooms.");
    }
    return rows[0];
  };

  try {
    return await wyslij(accessToken);
  } catch (error) {
    if (!/JWT issued at future/i.test(error.message)) throw error;
    const refreshed = await onlineZLimitemCzasu(klient.auth.refreshSession(), "odświeżanie sesji gościa");
    const freshToken = refreshed.data?.session?.access_token;
    if (refreshed.error || !freshToken) throw new Error(refreshed.error?.message || error.message);
    return wyslij(freshToken);
  }
}

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
  const mojaKolej = (graczIndex === mojIndeksOnline);

  // 1. Obliczamy rzucone lotki i limit
  const kolejka = (typeof aktualnaKolejka !== "undefined") ? aktualnaKolejka : (window.aktualnaKolejka || 1);
  const rzuconeLotki = (kolejka - 1) * 3;
  const limitAktywny = window.limitLotekAktywny || (typeof limitLotekAktywny !== "undefined" && limitLotekAktywny);
  const maxLotek = window.maksymalnyLimitLotek || (typeof maksymalnyLimitLotek !== "undefined" && maksymalnyLimitLotek) || 30;

  const belkaKolejki = document.getElementById("wyswietl-kolejke");
  const tekstLotek = limitAktywny
    ? `Lotki: ${rzuconeLotki} / ${maxLotek}`
    : `Lotki: ${rzuconeLotki}`;

  // 2. Wypisujemy na środkowej belce TYLKO lotki i limit
  if (belkaKolejki) {
    if (czyWidz) {
      belkaKolejki.innerHTML = `<span style="color: #38bdf8;">👁 WIDZ</span> • <strong>${tekstLotek}</strong>`;
    } else {
      belkaKolejki.innerHTML = `<strong>${tekstLotek}</strong>`;
    }
  }

  if (czyWidz) {
    const opcjeLiczenia = document.querySelector(".opcje-liczenia");
    if (opcjeLiczenia) opcjeLiczenia.style.display = "none";
    return;
  }

  // 3. Sterowanie blokadami inputów (zostaje bez zmian)
  const inpWynik = document.getElementById("wpisz-wynik");
  const btnZatwierdz = document.getElementById("zatwierdz-rzut");
  const strefaKlik = document.querySelector(".strefa-klikania");
  const strefaManual = document.querySelector(".strefa-manualna");

  if (inpWynik) {
    if (!mojaKolej) {
      inpWynik.disabled = true;
    } else {
      inpWynik.disabled = (window.innerWidth < 1200);
      if (!inpWynik.disabled) {
        setTimeout(() => inpWynik.focus(), 50);
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
};

// ============================================================
// 2. POCZEKALNIA STOŁU I WERYFIKACJA TOŻSAMOŚCI
// ============================================================
async function inicjalizujPoczekalnieOnline(kod) {
  const formOffline = document.getElementById("formularz-ustawien");
  const tytul = document.getElementById("tytul-strony");
  const menuBelka = document.querySelector(".menu");
  const btnPowrot = document.getElementById("powrot-do-gier");
  const statusStartu = document.createElement("div");
  statusStartu.id = "status-startu-online";
  statusStartu.setAttribute("role", "status");
  statusStartu.style.cssText = "position:fixed;z-index:9998;left:50%;top:50%;transform:translate(-50%,-50%);width:min(90vw,440px);padding:24px;border:1px solid #22c55e;border-radius:12px;background:rgba(17,24,39,.97);color:#fff;text-align:center;font:600 16px/1.5 sans-serif;box-shadow:0 20px 40px rgba(0,0,0,.5)";
  statusStartu.textContent = "Uruchamianie stołu online...";
  document.body.appendChild(statusStartu);
  const ustawStatusStartu = (tekst) => {
    statusStartu.textContent = tekst;
  };

  try {
  if (formOffline) formOffline.style.display = "none";
  if (tytul) tytul.style.display = "none";
  if (menuBelka) menuBelka.style.display = "none";
  if (btnPowrot) btnPowrot.style.display = "none";

  ustawStatusStartu("Sprawdzanie sesji gracza...");
  const { data: { session }, error: sessionError } = await onlineZLimitemCzasu(supabaseClient.auth.getSession(), "odczyt sesji");
  if (sessionError) throw sessionError;
  const user = session?.user;

  ustawStatusStartu("Pobieranie danych stołu...");
  const pokoje = await pobierzWierszeOnline("rooms", {
    select: "id,kod_pokoju,host_id,gosc_id,host_nazwa,gosc_nazwa,format_gry,punkty_startowe,docelowe_legi,dystans,zasady_wejscia,zasady_wyjscia,limit_lotek,status,aktualny_gracz_id,stan_meczu,stan_gry,wynik_host,wynik_gosc",
    kod_pokoju: `eq.${kod}`,
    limit: "1",
  }, session?.access_token || null, "pobieranie danych stołu");
  const pokoj = pokoje[0] || null;

  if (!pokoj) {
    statusStartu.remove();
    pokazModalSystemowyOnline("Błąd stołu", "Ten stół nie istnieje lub został już usunięty.", "alert", () => {
      window.location.href = "./online.html";
    });
    return;
  }

  // --- KRYTYCZNA ZMIANA: ROZPOZNAWANIE GRACZA (ZAMIAST TOKENÓW) ---
  if (onlineTryb === "widz" || !user) {
    czyWidz = true;
    mojIndeksOnline = -1;
  } else {
    // 1. Sprawdzamy czy jestem Hostem
    if (pokoj.host_id === user.id) {
      mojIndeksOnline = 0;
      czyWidz = false;
    } 
    // 2. Sprawdzamy czy byłem już przypisany jako gość (odświeżenie strony)
    else if (pokoj.gosc_id === user.id) {
      mojIndeksOnline = 1;
      czyWidz = false;
    } 
    // 3. JESTEM GOŚCIEM Z ZAPROSZENIA - Wchodzę i ZAJMUJĘ STÓŁ!
    else if (pokoj.gosc_id === null && pokoj.status === 'waiting') {
      mojIndeksOnline = 1;
      czyWidz = false;
      
      ustawStatusStartu("Dołączanie do stołu...");
      const profileData = await pobierzWierszeOnline("profiles", {
        select: "id,nazwa_gracza",
        id: `eq.${user.id}`,
        limit: "1",
      }, null, "pobieranie profilu gościa");
      const mojNick = profileData[0]?.nazwa_gracza || user.user_metadata?.username || user.email.split('@')[0];
      
      // Claim the empty room and start it in one guarded update; the host observes this state change.
      const pokojPoDolaczeniu = await przypiszGosciaDoPokoju(kod, user, mojNick, pokoj.host_id, session.access_token);
      Object.assign(pokoj, pokojPoDolaczeniu);
    } 
    // 4. Stół pełny - mogę być tylko widzem
    else {
      mojIndeksOnline = -1;
      czyWidz = true;
    }
  }

  if (pokoj.status === "in_progress" || pokoj.status === "finished") {
    statusStartu.remove();
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
  statusStartu.remove();

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
    if (mojIndeksOnline === 0 && !(await usunAktualnyPokoj())) return;
    window.location.href = "./online.html";
  });

  kanalCzekaniaPoczekalni = supabaseClient
    .channel(`room-wait-${kod}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "rooms", filter: `kod_pokoju=eq.${kod}` },
      (payload) => {
        const zaktualizowanyPokoj = payload.new;
        
        // Host zauważa gościa i odpala mecz
        if (mojIndeksOnline === 0 && zaktualizowanyPokoj.status === "waiting" && zaktualizowanyPokoj.gosc_id) {
            supabaseClient.from("rooms").update({ 
                status: "in_progress",
                aktualny_gracz_id: zaktualizowanyPokoj.host_id,
                stan_meczu: { tura: 1, pozostale_rzuty: 3 }
            }).eq("kod_pokoju", kod).then();
        }

        // Gdy status zmieni się na in_progress (odpala u obu)
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

  timerSprawdzaniaPoczekalni = window.setInterval(async () => {
    if (czyMeczJuzWystartowal) {
      clearInterval(timerSprawdzaniaPoczekalni);
      timerSprawdzaniaPoczekalni = null;
      return;
    }
    if (sprawdzaniePoczekalni) return;

    sprawdzaniePoczekalni = true;
    try {
      const { data: aktualnyPokoj, error: bladPobierania } = await supabaseClient
        .from("rooms")
        .select("*")
        .eq("kod_pokoju", kod)
        .maybeSingle();

      if (bladPobierania || !aktualnyPokoj) return;

      if (mojIndeksOnline === 0 && aktualnyPokoj.status === "waiting") {
        try {
          const zaproszenia = await pobierzWierszeOnline("game_invites", {
            select: "status,kod_pokoju",
            kod_pokoju: `eq.${kod}`,
            od_kogo_id: `eq.${aktualnyPokoj.host_id}`,
            limit: "1",
          }, session?.access_token || null, "sprawdzanie odpowiedzi na zaproszenie");

          if (zaproszenia[0]?.status === "odrzucone") {
            if (timerSprawdzaniaPoczekalni) clearInterval(timerSprawdzaniaPoczekalni);
            timerSprawdzaniaPoczekalni = null;
            if (kanalCzekaniaPoczekalni) {
              supabaseClient.removeChannel(kanalCzekaniaPoczekalni);
              kanalCzekaniaPoczekalni = null;
            }

            const statusBox = document.getElementById("status-oczekiwania");
            if (statusBox) {
              statusBox.innerHTML = "";
              const komunikat = document.createElement("span");
              komunikat.textContent = "Znajomy odrzucił zaproszenie do gry.";
              komunikat.style.color = "#fca5a5";
              statusBox.appendChild(komunikat);

              const przyciskPowrotu = document.createElement("button");
              przyciskPowrotu.type = "button";
              przyciskPowrotu.textContent = "Wróć do lobby";
              przyciskPowrotu.style.cssText = "display:block;margin:16px auto 0;padding:10px 18px;border:0;border-radius:8px;background:#22c55e;color:#07120a;font-weight:700";
              przyciskPowrotu.onclick = async () => {
                await usunAktualnyPokoj();
                window.location.href = "./online.html";
              };
              statusBox.appendChild(przyciskPowrotu);
            }
            return;
          }
        } catch (error) {
          console.warn("Błąd sprawdzania statusu zaproszenia:", error);
        }
      }

      if (mojIndeksOnline === 0 && aktualnyPokoj.status === "waiting" && aktualnyPokoj.gosc_id) {
        const { error: bladStartu } = await supabaseClient
          .from("rooms")
          .update({
            status: "in_progress",
            aktualny_gracz_id: aktualnyPokoj.host_id,
            stan_meczu: { tura: 1, pozostale_rzuty: 3 },
          })
          .eq("kod_pokoju", kod)
          .eq("status", "waiting");

        if (bladStartu) return;
        aktualnyPokoj.status = "in_progress";
        aktualnyPokoj.aktualny_gracz_id = aktualnyPokoj.host_id;
        aktualnyPokoj.stan_meczu = { tura: 1, pozostale_rzuty: 3 };
      }

      if (aktualnyPokoj.status === "in_progress" || aktualnyPokoj.status === "finished") {
        if (timerSprawdzaniaPoczekalni) clearInterval(timerSprawdzaniaPoczekalni);
        timerSprawdzaniaPoczekalni = null;
        if (kanalCzekaniaPoczekalni) {
          supabaseClient.removeChannel(kanalCzekaniaPoczekalni);
          kanalCzekaniaPoczekalni = null;
        }
        document.getElementById("poczekalnia-online")?.remove();
        startMeczuOnline(aktualnyPokoj);
      }
    } catch (blad) {
      console.warn("Błąd sprawdzania statusu stołu:", blad);
    } finally {
      sprawdzaniePoczekalni = false;
    }
  }, 3000);
  } catch (error) {
    console.error("Błąd uruchamiania stołu online:", error);
    ustawStatusStartu(`Nie udało się uruchomić stołu: ${error.message || "nieznany błąd"}`);
    const btnPowrotu = document.createElement("button");
    btnPowrotu.type = "button";
    btnPowrotu.textContent = "Wróć do lobby";
    btnPowrotu.style.cssText = "display:block;margin:18px auto 0;padding:10px 18px;border:0;border-radius:8px;background:#22c55e;color:#07120a;font-weight:700";
    btnPowrotu.onclick = () => { window.location.href = "./online.html"; };
    statusStartu.appendChild(btnPowrotu);
  }
}

// ============================================================
// 3. START MECZU ONLINE
// ============================================================
function startMeczuOnline(pokoj) {
  if (czyMeczJuzWystartowal) return;
  czyMeczJuzWystartowal = true;
  if (timerSprawdzaniaPoczekalni) clearInterval(timerSprawdzaniaPoczekalni);
  timerSprawdzaniaPoczekalni = null;

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

  // PRZEKAZANIE LIMITU Z BAZY:
  if (pokoj.limit_lotek && Number(pokoj.limit_lotek) > 0) {
    window.limitLotekAktywny = true;
    window.maksymalnyLimitLotek = Number(pokoj.limit_lotek);
    if (typeof limitLotekAktywny !== "undefined") limitLotekAktywny = true;
    if (typeof maksymalnyLimitLotek !== "undefined") maksymalnyLimitLotek = Number(pokoj.limit_lotek);
  } else {
    window.limitLotekAktywny = false;
    if (typeof limitLotekAktywny !== "undefined") limitLotekAktywny = false;
  }

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

  // Inkrementujemy licznik wersji zamiast pobierać Date.now()
  lokalnaWersjaStanu = (Number(lokalnaWersjaStanu) || 0) + 1;

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
    const sufiksLimitu = window.limitLotekAktywny ? ` / ${window.maksymalnyLimitLotek}` : "";
    elKolejka.textContent = `Lotki: ${(dane.aktualnaKolejka - 1) * 3}${sufiksLimitu}`;
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
      callback(czyZakonczyl ? 3 : 3, 0);
      return;
    }

    if (typeof staryPopupDoubles === "function") {
      staryPopupDoubles(czyZakonczyl, punktyPrzed, rzucone, maxLotek, (lotkaKonczaca, lotkiNaDoubla) => {
        callback(lotkaKonczaca, lotkiNaDoubla);
        window.sprawdzTureOnline();
        if (czyTrybOnline && !czyWidz && !odbieranieRzutuZSieci) {
          wyslijAktualnyStanGry();
        }
      });
    } else {
      // Zapasowe wywołanie callbacku, jeśli popup nie istnieje
      callback(czyZakonczyl ? 3 : 0, 0);
      window.sprawdzTureOnline();
      if (czyTrybOnline && !czyWidz && !odbieranieRzutuZSieci) {
        wyslijAktualnyStanGry();
      }
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
              if (mojIndeksOnline === 0 && !(await usunAktualnyPokoj())) return;
              window.location.href = "./online.html";
            }
          }
        );
      }
    }
  });

}

async function usunAktualnyPokoj() {
  if (!onlineKodPokoju) return;
  try {
    const { data: { session }, error: sessionError } = await onlineZLimitemCzasu(supabaseClient.auth.getSession(), "odczyt sesji przed usunięciem stołu");
    if (sessionError) throw sessionError;
    if (!session?.access_token) throw new Error("Nie znaleziono aktywnej sesji użytkownika.");

    const wyslijUsuniecie = (accessToken) => fetch("/api/supabase-write", {
      method: "POST",
      headers: {
        apikey: supabaseClient.supabaseKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        table: "rooms",
        operation: "delete",
        filters: { kod_pokoju: onlineKodPokoju },
        accessToken,
      }),
      cache: "no-store",
    });

    let response = await onlineZLimitemCzasu(wyslijUsuniecie(session.access_token), "usuwanie stołu");
    let responseText = await response.text();
    let result = responseText ? JSON.parse(responseText) : {};
    if (response.status === 401 && /JWT issued at future/i.test(result.message || "")) {
      const refreshed = await onlineZLimitemCzasu(supabaseClient.auth.refreshSession(), "odświeżanie sesji przy usuwaniu stołu");
      const freshToken = refreshed.data?.session?.access_token;
      if (refreshed.error || !freshToken) throw new Error(refreshed.error?.message || result.message);
      response = await onlineZLimitemCzasu(wyslijUsuniecie(freshToken), "ponowne usuwanie stołu");
      responseText = await response.text();
      result = responseText ? JSON.parse(responseText) : {};
    }
    if (!response.ok) throw new Error(result.message || result.details || `Błąd HTTP ${response.status}`);
    return true;
  } catch (err) {
    console.warn("Błąd usuwania stołu:", err);
    pokazModalSystemowyOnline("Nie udało się opuścić stołu", err.message || "Błąd usuwania pokoju.");
    return false;
  }
}
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && czyTrybOnline && onlineKodPokoju) {
    const { data } = await supabaseClient
      .from("rooms")
      .select("stan_gry")
      .eq("kod_pokoju", onlineKodPokoju)
      .maybeSingle();
    if (data?.stan_gry) zastosujStanGry(data.stan_gry);
  }
});