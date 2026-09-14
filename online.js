// ============================================================
// 1. INICJALIZACJA I STAN LOKALNY
// ============================================================
const supabaseClient = window.supabaseKlient || (window.supabase
  ? window.supabase.createClient(
      "https://mjebhhagwxtvhggyjwue.supabase.co",
      "sb_publishable_1n3SqWhrrIzojpyFgnmaTw_a1pfzi5R"
    )
  : null);

let mojeIP = "gosc_" + Math.random().toString(36).substring(2, 8);
let wszystkiePokoje = [];
let zalogowanyNick = null;

// Pobieranie IP z timeoutem (bezpieczne dla adblocków i incognito)
async function pobierzMojeIP() {
  try {
    const controller = new AbortController();
    const tId = setTimeout(() => controller.abort(), 1500);
    const res = await fetch("https://api64.ipify.org?format=json", { signal: controller.signal });
    clearTimeout(tId);
    if (res.ok) {
      const data = await res.json();
      mojeIP = data.ip;
    }
  } catch (err) {
    // Pozostaje domyślny gosc_...
  }
}

// Sprawdzenie profilu zalogowanego użytkownika
async function sprawdzProfilGracza() {
  const poleNickHosta = document.getElementById("nowy-host-nick");
  if (!supabaseClient) {
    if (poleNickHosta) poleNickHosta.value = "Gość_" + Math.floor(100 + Math.random() * 900);
    return;
  }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user) {
      zalogowanyNick = session.user.user_metadata?.username || session.user.email.split("@")[0];
      if (poleNickHosta) {
        poleNickHosta.value = zalogowanyNick;
        poleNickHosta.readOnly = true;
      }
    } else {
      zalogowanyNick = null;
      if (poleNickHosta) {
        poleNickHosta.value = "Gość_" + Math.floor(100 + Math.random() * 900);
        poleNickHosta.readOnly = false;
      }
    }
  } catch (err) {
    console.warn("Tryb gościa:", err);
    if (poleNickHosta) poleNickHosta.value = "Gość";
  }
}

// ============================================================
// 2. BEZPIECZEŃSTWO (BANLISTA)
// ============================================================
async function sprawdzCzyZbanowany(ip) {
  if (!ip || ip.startsWith("gosc_") || !supabaseClient) return null;

  try {
    const { data, error } = await supabaseClient
      .from("banned_ips")
      .select("ip, powod")
      .eq("ip", ip)
      .maybeSingle();

    if (!error && data) return data;
  } catch (err) {
    console.warn("Błąd sprawdzania bana:", err);
  }
  return null;
}

// ============================================================
// 3. POBIERANIE I RENDEROWANIE STOŁÓW (LOBBY)
// ============================================================
async function pobierzStoły() {
  if (!supabaseClient) return;
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
        Brak aktywnych stołów. Kliknij <strong>+ Stwórz stół</strong>, aby zagrać!
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
// 4. REALTIME LOBBY
// ============================================================
function wlaczRealtimeLobby() {
  if (!supabaseClient) return;
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
// 5. DOŁĄCZANIE DO POKOJU
// ============================================================
window.dolaczDoPokoju = async function (kodPokoju, tryb) {
  if (tryb === "widz") {
    window.location.href = `./klasyczna.html?pokoj=${kodPokoju}&tryb=widz`;
    return;
  }

  const domyslny = zalogowanyNick || "Gość_" + Math.floor(100 + Math.random() * 900);
  const nick = zalogowanyNick || prompt("Podaj swój nick do gry:", domyslny) || domyslny;

  try {
    const ban = await sprawdzCzyZbanowany(mojeIP);
    if (ban) {
      alert(`Blokada: ${ban.powod || "Naruszenie zasad"}`);
      return;
    }

    const { data: pokoj, error: fetchErr } = await supabaseClient
      .from("rooms")
      .select("*")
      .eq("kod_pokoju", kodPokoju)
      .single();

    if (fetchErr || !pokoj) {
      alert("Taki pokój nie istnieje lub został zamknięty.");
      return;
    }

    if (pokoj.status !== "waiting") {
      alert("Ten stół jest już zajęty!");
      return;
    }

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
    console.error("Błąd dołączania:", err);
    alert("Wystąpił problem przy dołączaniu do stołu.");
  }
};

// ============================================================
// 6. TWORZENIE STOŁU
// ============================================================
async function stworzStolZKonfiguracji() {
  const btnSubmit = document.getElementById("btn-potwierdz-stworzenie");
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Tworzenie...";
  }

  try {
    const ban = await sprawdzCzyZbanowany(mojeIP);
    if (ban) {
      alert(`Blokada: ${ban.powod || "Naruszenie zasad"}`);
      return;
    }

    const nick = document.getElementById("nowy-host-nick")?.value.trim() || (zalogowanyNick || "Gospodarz");
    const punkty = parseInt(document.getElementById("nowy-format")?.value || 501);
    const dystans = parseInt(document.getElementById("nowy-dystans")?.value || 3);
    const wejscie = document.getElementById("nowe-wejscie")?.value || "si";
    const wyjscie = document.getElementById("nowe-wyjscie")?.value || "do";
    const czyPrywatny = document.getElementById("nowy-czy-prywatny")?.checked || false;
    const formatTekst = `${punkty} ${wyjscie.toUpperCase()}`;
    const kodPokoju = "SD-" + Math.floor(1000 + Math.random() * 9000);

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
    console.error("Błąd tworzenia stołu:", err);
    alert("Nie udało się utworzyć stołu.");
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Utwórz stół";
    }
  }
}

// ============================================================
// 7. INICJALIZACJA DOM
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
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
    const kod = prompt("Podaj kod stołu (np. SD-4821):");
    if (!kod) return;
    const sformatowany = kod.toUpperCase().trim().startsWith("SD-")
      ? kod.toUpperCase().trim()
      : `SD-${kod.toUpperCase().trim()}`;
    dolaczDoPokoju(sformatowany, "gracz");
  });

  inicjalizujDane();
});

async function inicjalizujDane() {
  await sprawdzProfilGracza();
  await pobierzMojeIP();
  await pobierzStoły();
  wlaczRealtimeLobby();
}