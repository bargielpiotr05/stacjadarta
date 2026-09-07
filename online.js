// ============================================================
// 1. INICJALIZACJA I STAN LOKALNY
// ============================================================
const SUPABASE_URL = "https://mjebhhagwxtvhggyjwue.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1n3SqWhrrIzojpyFgnmaTw_a1pfzi5R";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let mojeIP = null;
let wszystkiePokoje = [];

// Pobranie IP użytkownika z Twojej funkcji Cloudflare
async function pobierzMojeIP() {
  try {
    const res = await fetch("/api/get-ip");
    if (!res.ok) throw new Error("Błąd pobierania IP");
    const data = await res.json();
    mojeIP = data.ip;
  } catch (err) {
    console.warn("Nie udało się ustalić IP przez Cloudflare:", err);
    mojeIP = "nieznane";
  }
}

// ============================================================
// 2. BEZPIECZEŃSTWO (BANLISTA I LIMITY)
// ============================================================
async function sprawdzCzyZbanowany(ip) {
  if (!ip || ip === "nieznane") return null;

  const { data, error } = await supabaseClient
    .from("banned_ips")
    .select("ip, powod")
    .eq("ip", ip)
    .maybeSingle();

  if (error) {
    console.error("Błąd bazy przy sprawdzaniu banlisty:", error);
    return null;
  }
  return data;
}

// ============================================================
// 3. POBIERANIE I RENDEROWANIE STOŁÓW (LOBBY)
// ============================================================
async function pobierzStoły() {
  const { data, error } = await supabaseClient
    .from("rooms")
    .select("*")
    .in("status", ["waiting", "in_progress"])
    .order("utworzono", { ascending: false });

  if (error) {
    console.error("Błąd pobierania stołów:", error);
    return;
  }

  wszystkiePokoje = data || [];
  renderujStoly(wszystkiePokoje);
}

function renderujStoly(lista) {
  const kontener = document.querySelector(".grid-pokojow");
  const licznikBadge = document.querySelector(".kontener-meczy-online .badge-count");
  if (!kontener) return;

  if (licznikBadge) {
    licznikBadge.textContent = `${lista.length} dostępne`;
  }

  if (lista.length === 0) {
    kontener.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #94a3b8;">
        Brak aktywnych stołów. Kliknij <strong>+ Stwórz stół</strong>, aby rozpocząć grę!
      </div>
    `;
    return;
  }

  kontener.innerHTML = lista.map((pokoj) => {
    const czyWToku = pokoj.status === "in_progress";

    if (czyWToku) {
      return `
        <div class="karta-stolu w-trakcie">
          <div class="stol-top">
            <span class="status-badge status-live">● Mecz w toku</span>
            <span class="widzowie-badge">👁 ${pokoj.liczba_widzow || 0} widzów</span>
          </div>
          <div class="stol-host">
            <div class="host-avatar rival">SD</div>
            <div class="host-info">
              <strong>Mecz na żywo (#${pokoj.kod_pokoju})</strong>
              <span>Stan: ${pokoj.wynik_host || 0} - ${pokoj.wynik_gosc || 0}</span>
            </div>
          </div>
          <div class="stol-parametry">
            <div><span>Format:</span> <strong>${pokoj.format_gry}</strong></div>
            <div><span>Dystans:</span> <strong>Do ${pokoj.dystans} wygranych</strong></div>
          </div>
          <button type="button" class="btn-ogladaj-stol" onclick="dolaczDoPokoju('${pokoj.kod_pokoju}', 'widz')">
            <span>👁</span> Oglądaj na żywo
          </button>
        </div>
      `;
    }

    return `
      <div class="karta-stolu">
        <div class="stol-top">
          <span class="status-badge status-oczekuje">Oczekuje na rywala</span>
          <span class="stol-id">#${pokoj.kod_pokoju}</span>
        </div>
        <div class="stol-host">
          <div class="host-avatar">PB</div>
          <div class="host-info">
            <strong>Stół gracza</strong>
            <span>Dystans: Do ${pokoj.dystans} legów</span>
          </div>
        </div>
        <div class="stol-parametry">
          <div><span>Format:</span> <strong>${pokoj.format_gry}</strong></div>
          <div><span>Dystans:</span> <strong>Do ${pokoj.dystans} wygranych</strong></div>
        </div>
        <button type="button" class="btn-graj-stol" onclick="dolaczDoPokoju('${pokoj.kod_pokoju}', 'gracz')">
          Dołącz do gry
        </button>
      </div>
    `;
  }).join("");
}

// ============================================================
// 4. SYNCHRONIZACJA REALTIME (WEBSOCKET)
// ============================================================
function wlaczRealtimeLobby() {
  supabaseClient
    .channel("public-rooms-lobby")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms" },
      () => {
        // Przy każdej zmianie (nowy stół, start gry, usunięcie) odśwież listę
        pobierzStoły();
      }
    )
    .subscribe();
}

// ============================================================
// 5. TWORZENIE ORAZ DOŁĄCZANIE DO POKOJU
// ============================================================
async function stworzStolZabezpieczony() {
  const btn = document.getElementById("btn-stworz-stol");
  btn.disabled = true;
  btn.textContent = "Weryfikacja...";

  try {
    // 1. Ponowna weryfikacja IP i banlisty
    if (!mojeIP) await pobierzMojeIP();

    const ban = await sprawdzCzyZbanowany(mojeIP);
    if (ban) {
      alert(`Twój adres IP jest zablokowany. Powód: ${ban.powod || "Naruszenie zasad"}`);
      return;
    }

    // 2. Limit otwartych stołów na dane IP
    if (mojeIP !== "nieznane") {
      const { count } = await supabaseClient
        .from("rooms")
        .select("*", { count: "exact", head: true })
        .eq("host_ip", mojeIP)
        .eq("status", "waiting");

      if (count && count >= 2) {
        alert("Osiągnięto limit: masz już 2 otwarte stoły oczekujące w lobby.");
        return;
      }
    }

    // 3. Generowanie unikalnego kodu stołu
    const kodPokoju = "SD-" + Math.floor(1000 + Math.random() * 9000);

    const { data, error } = await supabaseClient
      .from("rooms")
      .insert([
        {
          kod_pokoju: kodPokoju,
          host_ip: mojeIP,
          format_gry: "501 DO",
          dystans: 3,
          status: "waiting",
          punkty_startowe: 501,
          docelowe_legi: 3,
          zasady_wejscia: "si",
          zasady_wyjscia: "do"
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Przekierowanie do tarczy meczowej jako Host
    window.location.href = `./klasyczna.html?pokoj=${data.kod_pokoju}&rola=host`;

  } catch (err) {
    console.error("Błąd tworzenia stołu:", err);
    alert("Wystąpił błąd podczas tworzenia stołu.");
  } finally {
    btn.disabled = false;
    btn.textContent = "+ Stwórz stół";
  }
}

window.dolaczDoPokoju = function (kodPokoju, tryb) {
  if (tryb === "widz") {
    window.location.href = `./klasyczna.html?pokoj=${kodPokoju}&tryb=widz`;
  } else {
    window.location.href = `./klasyczna.html?pokoj=${kodPokoju}&rola=gosc`;
  }
};

// ============================================================
// 6. START PO ZAŁADOWANIU DOM
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  await pobierzMojeIP();
  await pobierzStoły();
  wlaczRealtimeLobby();

  document.getElementById("btn-stworz-stol")?.addEventListener("click", stworzStolZabezpieczony);

  // Proste dołączanie przez kod
  document.getElementById("btn-dolacz-kod")?.addEventListener("click", () => {
    const kod = prompt("Podaj 4-cyfrowy numer lub pełny kod stołu (np. SD-4821):");
    if (!kod) return;
    const sformatowany = kod.toUpperCase().startsWith("SD-") ? kod.toUpperCase() : `SD-${kod}`;
    dolaczDoPokoju(sformatowany, "gracz");
  });
});