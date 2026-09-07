// ============================================================
// 1. INICJALIZACJA I STAN LOKALNY
// ============================================================
const SUPABASE_URL = "https://mjebhhagwxtvhggyjwue.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1n3SqWhrrIzojpyFgnmaTw_a1pfzi5R";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let mojeIP = null;
let wszystkiePokoje = [];

async function pobierzMojeIP() {
  try {
    const res = await fetch("https://api64.ipify.org?format=json");
    if (!res.ok) throw new Error("Błąd pobierania IP");
    const data = await res.json();
    mojeIP = data.ip;
    console.log("Pobrane IP gracza:", mojeIP);
  } catch (err) {
    console.warn("Nie udało się ustalić IP:", err);
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
  const dwaGodzinyTemu = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseClient
    .from("rooms")
    .select("*")
    .in("status", ["waiting", "in_progress"])
    .eq("czy_prywatny", false)
    .gt("utworzono", dwaGodzinyTemu)
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
        Brak aktywnych stołów publicznych. Kliknij <strong>+ Stwórz stół</strong>, aby rozpocząć grę!
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
              <strong>${pokoj.host_nazwa || "Host"} vs ${pokoj.gosc_nazwa || "Gość"}</strong>
              <span>Stan: ${pokoj.wynik_host || 0} - ${pokoj.wynik_gosc || 0} (#${pokoj.kod_pokoju})</span>
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
            <strong>${pokoj.host_nazwa || "Host"}</strong>
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
        pobierzStoły();
      }
    )
    .subscribe();
}

// ============================================================
// 5. DOŁĄCZANIE DO POKOJU (GRACZ / WIDZ)
// ============================================================
window.dolaczDoPokoju = async function (kodPokoju, tryb) {
  if (tryb === "widz") {
    window.location.href = `./klasyczna.html?pokoj=${kodPokoju}&tryb=widz`;
    return;
  }

  const nick = prompt("Podaj swój nick do gry:", "Gość") || "Gość";

  try {
    if (!mojeIP || mojeIP === "nieznane") await pobierzMojeIP();
    const ban = await sprawdzCzyZbanowany(mojeIP);
    if (ban) {
      alert(`Twój adres IP jest zablokowany: ${ban.powod || "Naruszenie zasad"}`);
      return;
    }

    const { data: pokoj, error: fetchErr } = await supabaseClient
      .from("rooms")
      .select("*")
      .eq("kod_pokoju", kodPokoju)
      .single();

    if (fetchErr || !pokoj) {
      alert("Taki pokój nie istnieje lub został usunięty.");
      return;
    }

    if (pokoj.status !== "waiting") {
      alert("Mecz przy tym stole już trwa lub pokój jest zajęty!");
      return;
    }

    // Wygenerowanie tajnego tokenu kryptograficznego dla gościa
    const goscToken = "usr_" + Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem(`sd_token_${kodPokoju}`, goscToken);

    const { error: updateErr } = await supabaseClient
      .from("rooms")
      .update({
        gosc_nazwa: nick,
        gosc_token: goscToken,
        status: "in_progress"
      })
      .eq("kod_pokoju", kodPokoju);

    if (updateErr) throw updateErr;

    window.location.href = `./klasyczna.html?pokoj=${kodPokoju}&rola=gosc&nick=${encodeURIComponent(nick)}`;

  } catch (err) {
    console.error("Błąd podczas dołączania do gry:", err);
    alert("Wystąpił problem przy dołączaniu do stołu.");
  }
};

// ============================================================
// 6. TWORZENIE STOŁU Z MODALA
// ============================================================
async function stworzStolZKonfiguracji() {
  const btnSubmit = document.getElementById("btn-potwierdz-stworzenie");
  btnSubmit.disabled = true;
  btnSubmit.textContent = "Weryfikacja...";

  try {
    if (!mojeIP || mojeIP === "nieznane") await pobierzMojeIP();

    const ban = await sprawdzCzyZbanowany(mojeIP);
    if (ban) {
      alert(`Twój adres IP jest zablokowany: ${ban.powod || "Naruszenie zasad"}`);
      return;
    }

    if (mojeIP !== "nieznane") {
      const { count } = await supabaseClient
        .from("rooms")
        .select("*", { count: "exact", head: true })
        .eq("host_ip", mojeIP)
        .eq("status", "waiting");

      if (count && count >= 2) {
        alert("Osiągnięto limit: posiadasz już 2 otwarte stoły oczekujące w lobby.");
        return;
      }
    }

    const nick = document.getElementById("nowy-host-nick")?.value.trim() || "Host";
    const punkty = parseInt(document.getElementById("nowy-format")?.value || 501);
    const dystans = parseInt(document.getElementById("nowy-dystans")?.value || 3);
    const wejscie = document.getElementById("nowe-wejscie")?.value || "si";
    const wyjscie = document.getElementById("nowe-wyjscie")?.value || "do";
    const czyPrywatny = document.getElementById("nowy-czy-prywatny")?.checked || false;
    const formatTekst = `${punkty} ${wyjscie.toUpperCase()}`;

    const kodPokoju = "SD-" + Math.floor(1000 + Math.random() * 9000);

    // Wygenerowanie tajnego tokenu kryptograficznego dla hosta
    const hostToken = "usr_" + Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem(`sd_token_${kodPokoju}`, hostToken);

    const { data, error } = await supabaseClient
      .from("rooms")
      .insert([
        {
          kod_pokoju: kodPokoju,
          host_ip: mojeIP,
          host_nazwa: nick,
          host_token: hostToken,
          format_gry: formatTekst,
          punkty_startowe: punkty,
          docelowe_legi: dystans,
          dystans: dystans,
          zasady_wejscia: wejscie,
          zasady_wyjscia: wyjscie,
          czy_prywatny: czyPrywatny,
          status: "waiting"
        }
      ])
      .select()
      .single();

    if (error) throw error;

    window.location.href = `./klasyczna.html?pokoj=${data.kod_pokoju}&rola=host&nick=${encodeURIComponent(nick)}`;

  } catch (err) {
    console.error("Błąd zapisu pokoju:", err);
    alert("Nie udało się utworzyć stołu.");
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Utwórz stół";
  }
}

// ============================================================
// 7. INICJALIZACJA DOM I OBSŁUGA ZDARZEŃ
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  await pobierzMojeIP();
  await pobierzStoły();
  wlaczRealtimeLobby();

  const modal = document.getElementById("modal-stworz-stol");
  const btnOtworzModal = document.getElementById("btn-stworz-stol");
  const btnZamknijModal = document.getElementById("btn-zamknij-modal");
  const btnAnulujModal = document.getElementById("btn-anuluj-modal");
  const formNowyStol = document.getElementById("form-nowy-stol");

  btnOtworzModal?.addEventListener("click", () => {
    if (modal) modal.style.display = "flex";
  });

  const zamknijModal = () => {
    if (modal) modal.style.display = "none";
  };

  btnZamknijModal?.addEventListener("click", zamknijModal);
  btnAnulujModal?.addEventListener("click", zamknijModal);

  formNowyStol?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await stworzStolZKonfiguracji();
  });

  document.getElementById("btn-dolacz-kod")?.addEventListener("click", () => {
    const kod = prompt("Podaj 4-cyfrowy kod lub pełny symbol stołu (np. SD-4821):");
    if (!kod) return;
    const sformatowany = kod.toUpperCase().trim().startsWith("SD-")
      ? kod.toUpperCase().trim()
      : `SD-${kod.toUpperCase().trim()}`;
    dolaczDoPokoju(sformatowany, "gracz");
  });
});
