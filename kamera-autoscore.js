// =========================================================================
// STACJA DARTA - ZAAWANSOWANY MODUŁ KAMER & AUTOSCORE MULTI-KAMERA (1-3 KAMERY)
// Lazy-loaded OpenCV.js WebAssembly Engine
// =========================================================================

(function () {
    "use strict";

    const btnDodajKamere = document.getElementById("btn-dodaj-kamere");
    const btnStartKam = document.getElementById("btn-start-kamera");
    const btnAutoSkan = document.getElementById("btn-auto-skan");
    const btnResetTla = document.getElementById("btn-reset-tla");
    const btnZatwierdzKam = document.getElementById("btn-zatwierdz-kamera");
    const opencvStatusEl = document.getElementById("kamera-opencv-status");
    const tarczaStanEl = document.getElementById("kamera-stan-tarczy");
    const strefaKamera = document.querySelector(".strefa-kamera");

    let liczbaUzywanychKamer = parseInt(localStorage.getItem("sd_liczba_kamer") || "1") || 1;
    let kolejkaLotekKamery = [];
    let czyOpenCvGotowe = false;
    let czyLadujeOpenCv = false;
    let autoDetekcjaAktywna = false;
    let petlaDetekcjiId = null;

    const SEKTORY_DARTA = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

    // =========================================================================
    // MATEMATYKA TRANSFORMACJI PERSPEKTYWICZNEJ (HOMOGRAFIA 3x3 DLA DARTA)
    // =========================================================================
    const CANONICAL_R = 170; // promień zewnętrznego drutu Double w mm
    const CANONICAL_SRC = [
        { x: 0, y: -CANONICAL_R }, // D20 (góra, 0°)
        { x: CANONICAL_R, y: 0 },  // D6 (prawo, 90°)
        { x: 0, y: CANONICAL_R },  // D3 (dół, 180°)
        { x: -CANONICAL_R, y: 0 }, // D11 (lewo, 270°)
    ];

    function solveLinearSystem(A, b) {
        const n = b.length;
        for (let i = 0; i < n; i++) {
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
            }
            [A[i], A[maxRow]] = [A[maxRow], A[i]];
            [b[i], b[maxRow]] = [b[maxRow], b[i]];
            if (Math.abs(A[i][i]) < 1e-12) return null;
            for (let k = i + 1; k < n; k++) {
                const factor = A[k][i] / A[i][i];
                for (let j = i; j < n; j++) A[k][j] -= factor * A[i][j];
                b[k] -= factor * b[i];
            }
        }
        const x = new Array(n);
        for (let i = n - 1; i >= 0; i--) {
            let sum = b[i];
            for (let j = i + 1; j < n; j++) sum -= A[i][j] * x[j];
            x[i] = sum / A[i][i];
        }
        return x;
    }

    function getHomography(srcPts, dstPts) {
        const A = [];
        const b = [];
        for (let i = 0; i < 4; i++) {
            const u = srcPts[i].x, v = srcPts[i].y;
            const x = dstPts[i].x, y = dstPts[i].y;
            A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
            b.push(x);
            A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
            b.push(y);
        }
        const h = solveLinearSystem(A, b);
        if (!h) return null;
        return [
            [h[0], h[1], h[2]],
            [h[3], h[4], h[5]],
            [h[6], h[7], 1.0]
        ];
    }

    function invert3x3(m) {
        if (!m) return null;
        const a = m[0][0], b = m[0][1], c = m[0][2];
        const d = m[1][0], e = m[1][1], f = m[1][2];
        const g = m[2][0], h = m[2][1], k = m[2][2];
        const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
        if (Math.abs(det) < 1e-12) return null;
        const invdet = 1.0 / det;
        return [
            [(e * k - f * h) * invdet, (c * h - b * k) * invdet, (b * f - c * e) * invdet],
            [(f * g - d * k) * invdet, (a * k - c * g) * invdet, (c * d - a * f) * invdet],
            [(d * h - e * g) * invdet, (g * b - a * h) * invdet, (a * e - b * d) * invdet]
        ];
    }

    function transformPoint(m, pt) {
        if (!m || !pt) return { x: 0, y: 0 };
        const w = m[2][0] * pt.x + m[2][1] * pt.y + m[2][2];
        if (Math.abs(w) < 1e-12) return { x: 0, y: 0 };
        return {
            x: (m[0][0] * pt.x + m[0][1] * pt.y + m[0][2]) / w,
            y: (m[1][0] * pt.x + m[1][1] * pt.y + m[1][2]) / w
        };
    }

    function utworzPunktyZOkregu(cx, cy, r, katRotacji = 0, aspekt = 1.0) {
        const rot = katRotacji || 0;
        const asp = aspekt || 1.0;
        const getP = (deg) => {
            const rad = (deg - 90) * Math.PI / 180 + rot;
            return {
                x: cx + r * Math.cos(rad) * asp,
                y: cy + r * Math.sin(rad)
            };
        };
        return {
            p20: getP(0),
            p6:  getP(90),
            p3:  getP(180),
            p11: getP(270)
        };
    }

    function aktualizujMacierzeKalibracji(kal) {
        if (!kal || !kal.punkty4) return false;
        const dst = [
            kal.punkty4.p20,
            kal.punkty4.p6,
            kal.punkty4.p3,
            kal.punkty4.p11
        ];
        const H = getHomography(CANONICAL_SRC, dst);
        if (!H) return false;
        const Hinv = invert3x3(H);
        if (!Hinv) return false;
        kal.homografia = H;
        kal.homografiaInv = Hinv;

        const bull = transformPoint(H, { x: 0, y: 0 });
        kal.srodekX = bull.x;
        kal.srodekY = bull.y;

        const d0 = Math.hypot(dst[0].x - bull.x, dst[0].y - bull.y);
        const d1 = Math.hypot(dst[1].x - bull.x, dst[1].y - bull.y);
        const d2 = Math.hypot(dst[2].x - bull.x, dst[2].y - bull.y);
        const d3 = Math.hypot(dst[3].x - bull.x, dst[3].y - bull.y);
        kal.promienD20 = (d0 + d1 + d2 + d3) / 4;
        kal.skalibrowana = true;
        return true;
    }

    function zapiszKalibracjeKamery(k) {
        if (!k || !k.kalibracja) return;
        localStorage.setItem(`sd_dart_kalibracja_${k.id}`, JSON.stringify(k.kalibracja));
        if (k.id === 1) {
            localStorage.setItem("sd_dart_kalibracja", JSON.stringify(k.kalibracja));
        }
    }

    function wczytajKalibracje(klucz) {
        const raw = JSON.parse(localStorage.getItem(klucz) || "null");
        if (!raw) return null;
        if (raw.punkty4) {
            aktualizujMacierzeKalibracji(raw);
        } else if (raw.srodekX && raw.promienD20) {
            raw.punkty4 = utworzPunktyZOkregu(raw.srodekX, raw.srodekY, raw.promienD20, raw.katRotacji || 0, raw.aspekt || 1.0);
            aktualizujMacierzeKalibracji(raw);
        }
        return raw;
    }

    const domyslnaKalibracja = () => ({
        srodekX: 0,
        srodekY: 0,
        promienD20: 0,
        katRotacji: 0,
        aspekt: 1.0,
        punkty4: null,
        homografia: null,
        homografiaInv: null,
        skalibrowana: false,
    });

    const kamery = [
        {
            id: 1,
            selectEl: document.getElementById("kamera-select"),
            videoEl: document.getElementById("kamera-podglad"),
            canvasEl: document.getElementById("kamera-canvas"),
            radarEl: document.getElementById("radar-skanera"),
            boxEl: document.getElementById("box-kamera-1"),
            slotSelectEl: document.getElementById("slot-select-kamera-1"),
            strumien: null,
            klatkaTlaMat: null,
            kalibracja: wczytajKalibracje("sd_dart_kalibracja_1") || wczytajKalibracje("sd_dart_kalibracja") || domyslnaKalibracja(),
        },
        {
            id: 2,
            selectEl: document.getElementById("kamera-select-2"),
            videoEl: document.getElementById("kamera-podglad-2"),
            canvasEl: document.getElementById("kamera-canvas-2"),
            radarEl: document.getElementById("radar-skanera-2"),
            boxEl: document.getElementById("box-kamera-2"),
            slotSelectEl: document.getElementById("slot-select-kamera-2"),
            strumien: null,
            klatkaTlaMat: null,
            kalibracja: wczytajKalibracje("sd_dart_kalibracja_2") || domyslnaKalibracja(),
        },
        {
            id: 3,
            selectEl: document.getElementById("kamera-select-3"),
            videoEl: document.getElementById("kamera-podglad-3"),
            canvasEl: document.getElementById("kamera-canvas-3"),
            radarEl: document.getElementById("radar-skanera-3"),
            boxEl: document.getElementById("box-kamera-3"),
            slotSelectEl: document.getElementById("slot-select-kamera-3"),
            strumien: null,
            klatkaTlaMat: null,
            kalibracja: wczytajKalibracje("sd_dart_kalibracja_3") || domyslnaKalibracja(),
        },
    ];

    // Pomocniczy alert
    function wywolajAlert(wiadomosc) {
        if (typeof window.pokazCustomowyAlert === "function") {
            window.pokazCustomowyAlert(wiadomosc);
        } else {
            alert(wiadomosc);
        }
    }

    // =========================================================================
    // 1. LAZY-LOADING OPENCV.JS (Pobieranie tylko na żądanie po wejściu w kamerę)
    // =========================================================================
    function zaladujOpenCvNaZadanie() {
        if (typeof cv !== "undefined" && cv.Mat) {
            czyOpenCvGotowe = true;
            if (opencvStatusEl) {
                opencvStatusEl.textContent = "Silnik wizyjny AI aktywny ✓";
                opencvStatusEl.style.color = "#4ade80";
            }
            return Promise.resolve();
        }

        if (czyLadujeOpenCv) return;
        czyLadujeOpenCv = true;

        if (opencvStatusEl) {
            opencvStatusEl.textContent = "Pobieranie silnika AI (OpenCV)...";
            opencvStatusEl.style.color = "#facc15";
        }

        return new Promise((resolve, reject) => {
            const istniejacy = document.getElementById("opencv-script");
            if (istniejacy) istniejacy.remove();

            const script = document.createElement("script");
            script.id = "opencv-script";
            script.async = true;
            script.src = "https://docs.opencv.org/4.x/opencv.js";

            const sprawdzGotowosc = () => {
                let proby = 0;
                const timer = setInterval(() => {
                    proby++;
                    if (typeof cv !== "undefined" && cv.Mat) {
                        clearInterval(timer);
                        czyOpenCvGotowe = true;
                        if (opencvStatusEl) {
                            opencvStatusEl.textContent = "Silnik wizyjny AI aktywny ✓";
                            opencvStatusEl.style.color = "#4ade80";
                        }
                        resolve();
                    } else if (proby > 50) {
                        if (opencvStatusEl && !czyOpenCvGotowe) {
                            opencvStatusEl.textContent = "Ładowanie OpenCV trwa dłużej niż zwykle...";
                            opencvStatusEl.style.color = "#facc15";
                        }
                    }
                }, 300);
            };

            script.onload = () => {
                if (typeof cv !== "undefined") {
                    if (cv.onRuntimeInitialized) {
                        cv.onRuntimeInitialized = () => {
                            czyOpenCvGotowe = true;
                            if (opencvStatusEl) {
                                opencvStatusEl.textContent = "Silnik wizyjny AI aktywny ✓";
                                opencvStatusEl.style.color = "#4ade80";
                            }
                            resolve();
                        };
                    } else {
                        sprawdzGotowosc();
                    }
                } else {
                    sprawdzGotowosc();
                }
            };

            script.onerror = () => {
                czyLadujeOpenCv = false;
                if (opencvStatusEl) {
                    opencvStatusEl.textContent = "Błąd pobierania silnika AI (sprawdź sieć)";
                    opencvStatusEl.style.color = "#f87171";
                }
                reject(new Error("Błąd sieci podczas pobierania OpenCV"));
            };

            document.head.appendChild(script);
        });
    }

    // =========================================================================
    // 2. ZARZĄDZANIE WIDOKIEM I UKŁADEM KAMER (1-3)
    // =========================================================================
    function aktualizujWidokLiczbyKamer() {
        const siatka = document.getElementById("siatka-kamer");

        if (btnDodajKamere) {
            if (liczbaUzywanychKamer >= 3) {
                btnDodajKamere.style.display = "none";
            } else {
                btnDodajKamere.style.display = "inline-flex";
                btnDodajKamere.innerHTML = `<span>Dodaj kamerę (${liczbaUzywanychKamer}/3)</span>`;
            }
        }

        if (strefaKamera) {
            strefaKamera.style.maxWidth = liczbaUzywanychKamer === 1 ? "600px" : liczbaUzywanychKamer === 2 ? "760px" : "840px";
        }

        if (siatka) {
            if (liczbaUzywanychKamer === 1) {
                siatka.style.gridTemplateColumns = "1fr";
                siatka.style.maxWidth = "480px";
            } else if (liczbaUzywanychKamer === 2) {
                siatka.style.gridTemplateColumns = "repeat(2, 1fr)";
                siatka.style.maxWidth = "680px";
            } else {
                siatka.style.gridTemplateColumns = "repeat(3, 1fr)";
                siatka.style.maxWidth = "780px";
            }
        }

        kamery.forEach((k, idx) => {
            const czyAktywna = idx < liczbaUzywanychKamer;
            if (k.slotSelectEl) k.slotSelectEl.style.display = czyAktywna ? "flex" : "none";
            if (k.boxEl) k.boxEl.style.display = czyAktywna ? "block" : "none";
            if (!czyAktywna && k.strumien) {
                k.strumien.getTracks().forEach((t) => t.stop());
                k.strumien = null;
                if (k.videoEl) k.videoEl.srcObject = null;
                if (k.klatkaTlaMat) {
                    try {
                        k.klatkaTlaMat.delete();
                    } catch (e) {}
                    k.klatkaTlaMat = null;
                }
            }
        });

        aktualizujStanTarczyUI();
    }

    function czyJakakolwiekTarczaWykryta() {
        const aktywne = kamery.slice(0, liczbaUzywanychKamer);
        return aktywne.some((k) => k.kalibracja && k.kalibracja.skalibrowana);
    }

    function aktualizujStanTarczyUI() {
        if (!tarczaStanEl) return;
        const aktywne = kamery.slice(0, liczbaUzywanychKamer);
        const skalibrowane = aktywne.filter((k) => k.kalibracja && k.kalibracja.skalibrowana).length;

        if (skalibrowane === aktywne.length && aktywne.length > 0) {
            tarczaStanEl.textContent = liczbaUzywanychKamer > 1 ? `Tarcze: Wykryte (${skalibrowane}/${aktywne.length}) ✓ (punktacja aktywna)` : "Tarcza: Wykryta ✓ (punktacja aktywna)";
            tarczaStanEl.style.color = "#4ade80";
        } else if (skalibrowane > 0) {
            tarczaStanEl.textContent = `Tarcze: Wykryte częściowo (${skalibrowane}/${aktywne.length}) - punktacja z ${skalibrowane} kamer`;
            tarczaStanEl.style.color = "#facc15";
        } else {
            tarczaStanEl.textContent = "Tarcza: Niewykryta ❌ (punktacja wyłączona)";
            tarczaStanEl.style.color = "#ef4444";
        }
    }

    // =========================================================================
    // 3. ENUMERACJA I LISTOWANIE KAMER USB
    // =========================================================================
    async function wypelnijListeKamer() {
        try {
            const urzadzenia = await navigator.mediaDevices.enumerateDevices();
            const kameryUrzadzenia = urzadzenia.filter((d) => d.kind === "videoinput");

            kamery.forEach((k, camIdx) => {
                if (!k.selectEl) return;
                const poprzWartosc = k.selectEl.value;
                k.selectEl.innerHTML = "";
                kameryUrzadzenia.forEach((dev, idx) => {
                    const opt = document.createElement("option");
                    opt.value = dev.deviceId;
                    opt.textContent = dev.label || `Kamera USB ${idx + 1}`;
                    k.selectEl.appendChild(opt);
                });

                if (poprzWartosc && Array.from(k.selectEl.options).some((o) => o.value === poprzWartosc)) {
                    k.selectEl.value = poprzWartosc;
                } else if (kameryUrzadzenia[camIdx]) {
                    k.selectEl.value = kameryUrzadzenia[camIdx].deviceId;
                }
            });
        } catch (e) {
            console.warn("Dostęp do urządzeń wideo:", e);
        }
    }

    // =========================================================================
    // 4. URUCHAMIANIE I WYŁĄCZANIE KAMER
    // =========================================================================
    async function uruchomKamere() {
        let uruchomionoCokolwiek = false;

        for (let i = 0; i < liczbaUzywanychKamer; i++) {
            const k = kamery[i];
            if (k.strumien) {
                k.strumien.getTracks().forEach((t) => t.stop());
                k.strumien = null;
            }

            const deviceId = k.selectEl ? k.selectEl.value : null;
            const constraints = {
                video: deviceId ? { deviceId: { exact: deviceId } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
            };

            try {
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                k.strumien = stream;
                if (k.videoEl) {
                    k.videoEl.srcObject = stream;
                    k.videoEl.onloadedmetadata = () => {
                        const vw = k.videoEl.videoWidth || 640;
                        const vh = k.videoEl.videoHeight || 480;
                        if (k.canvasEl) {
                            k.canvasEl.width = vw;
                            k.canvasEl.height = vh;
                        }
                        if (k.boxEl) {
                            k.boxEl.style.aspectRatio = `${vw} / ${vh}`;
                        }
                        rysujNakladkeKalibracji(k);
                    };
                }
                uruchomionoCokolwiek = true;
            } catch (err) {
                console.warn(`Błąd kamery ${i + 1}:`, err);
                wywolajAlert(`Kamera ${i + 1}: błąd dostępu (${err.message})`);
            }
        }

        if (uruchomionoCokolwiek) {
            if (btnStartKam) {
                btnStartKam.textContent = liczbaUzywanychKamer > 1 ? "Kamery działają" : "Kamera działa";
                btnStartKam.style.background = "#40da40";
            }

            setTimeout(() => {
                odswiezKlatkiTlaWszystkich();
                aktualizujStanTarczyUI();
                if (!czyJakakolwiekTarczaWykryta()) {
                    automatycznySkanTarczy();
                } else {
                    wlaczAutoDetekcjeRzutow();
                }
            }, 800);
        }
    }

    function wylaczKamere() {
        autoDetekcjaAktywna = false;
        if (petlaDetekcjiId) {
            clearInterval(petlaDetekcjiId);
            petlaDetekcjiId = null;
        }

        kamery.forEach((k) => {
            if (k.strumien) {
                k.strumien.getTracks().forEach((track) => track.stop());
                k.strumien = null;
            }
            if (k.videoEl) {
                k.videoEl.srcObject = null;
            }
            if (k.klatkaTlaMat) {
                try {
                    k.klatkaTlaMat.delete();
                } catch (e) {}
                k.klatkaTlaMat = null;
            }
            if (k.canvasEl) {
                const cctx = k.canvasEl.getContext("2d");
                if (cctx) cctx.clearRect(0, 0, k.canvasEl.width, k.canvasEl.height);
            }
            if (k.radarEl) {
                k.radarEl.style.display = "none";
            }
        });

        if (btnStartKam) {
            btnStartKam.textContent = liczbaUzywanychKamer > 1 ? "Włącz kamery" : "Włącz kamerę";
            btnStartKam.style.background = "#40da40";
        }
    }

    // =========================================================================
    // 5. KALIBRACJA I SKANOWANIE TARCZY
    // =========================================================================
    function skanujPojedynczaKamere(k) {
        if (!czyOpenCvGotowe || typeof cv === "undefined") return false;
        let src = null, gray = null, blurred = null, circles = null;
        try {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = k.canvasEl.width || 640;
            tempCanvas.height = k.canvasEl.height || 480;
            tempCanvas.getContext("2d").drawImage(k.videoEl, 0, 0, tempCanvas.width, tempCanvas.height);

            src = cv.imread(tempCanvas);
            gray = new cv.Mat();
            blurred = new cv.Mat();

            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            cv.GaussianBlur(gray, blurred, new cv.Size(9, 9), 2, 2);

            const minDim = Math.min(src.rows, src.cols);
            const minPromien = Math.floor(minDim * 0.18);
            const maxPromien = Math.floor(minDim * 0.52);

            // Kilka prób z różną czułością dla pewniejszego wykrycia tarczy
            const proby = [
                { dp: 1.2, minDist: blurred.rows / 6, p1: 100, p2: 40 },
                { dp: 1.4, minDist: blurred.rows / 5, p1: 80,  p2: 32 },
                { dp: 1.0, minDist: blurred.rows / 6, p1: 120, p2: 50 },
            ];

            let znaleziony = false;
            for (const proba of proby) {
                circles = new cv.Mat();
                cv.HoughCircles(blurred, circles, cv.HOUGH_GRADIENT, proba.dp, proba.minDist, proba.p1, proba.p2, minPromien, maxPromien);
                if (circles.cols > 0) { znaleziony = true; break; }
                circles.delete(); circles = null;
            }

            if (znaleziony && circles && circles.cols > 0) {
                let bestIdx = 0, maxR = 0;
                for (let i = 0; i < circles.cols; ++i) {
                    const r = circles.data32F[i * 3 + 2];
                    if (r > maxR) { maxR = r; bestIdx = i; }
                }

                const rawR = circles.data32F[bestIdx * 3 + 2];
                // Jeśli wykryty okrąg to zewnętrzna obudowa/surround (>33% wymiaru kadru),
                // promień pola gry (drut double) to ~81% obudowy
                const promienD20 = rawR > minDim * 0.33 ? rawR * 0.81 : rawR;
                const cx = circles.data32F[bestIdx * 3];
                const cy = circles.data32F[bestIdx * 3 + 1];

                k.kalibracja = {
                    punkty4: utworzPunktyZOkregu(cx, cy, promienD20),
                    skalibrowana: true,
                };
                aktualizujMacierzeKalibracji(k.kalibracja);
                k.kalibracja._rawPunkty4 = JSON.parse(JSON.stringify(k.kalibracja.punkty4));

                zapiszKalibracjeKamery(k);
                rysujNakladkeKalibracji(k);
                return true;
            }

            // Fallback: jeśli algorytm nie znalazł okręgu, ustaw bezpieczny środek kadru
            const cx = Math.floor(tempCanvas.width / 2);
            const cy = Math.floor(tempCanvas.height / 2);
            const domyslnyR = Math.floor(minDim * 0.36);
            k.kalibracja = {
                punkty4: utworzPunktyZOkregu(cx, cy, domyslnyR),
                skalibrowana: true,
            };
            aktualizujMacierzeKalibracji(k.kalibracja);
            k.kalibracja._rawPunkty4 = JSON.parse(JSON.stringify(k.kalibracja.punkty4));

            zapiszKalibracjeKamery(k);
            rysujNakladkeKalibracji(k);
            return true;
        } catch (e) {
            console.warn(`Błąd skanowania dla kamery ${k.id}:`, e);
            return false;
        } finally {
            if (src) src.delete();
            if (gray) gray.delete();
            if (blurred) blurred.delete();
            if (circles) { try { circles.delete(); } catch(e){} }
        }
    }

    function automatycznySkanTarczy() {
        if (!czyOpenCvGotowe) {
            wywolajAlert("Silnik OpenCV jeszcze się ładuje, poczekaj chwilę...");
            return;
        }
        const aktywneKamery = kamery.slice(0, liczbaUzywanychKamer).filter((k) => k.videoEl && k.videoEl.videoWidth);
        if (aktywneKamery.length === 0) {
            wywolajAlert("Najpierw włącz kamery!");
            return;
        }

        aktywneKamery.forEach((k) => {
            if (k.radarEl) k.radarEl.style.display = "block";
        });
        if (tarczaStanEl) {
            tarczaStanEl.textContent = "Tarcza: Skanowanie...";
            tarczaStanEl.style.color = "#38bdf8";
        }

        setTimeout(() => {
            let skalibrowanoIle = 0;
            aktywneKamery.forEach((k) => {
                const sukces = skanujPojedynczaKamere(k);
                if (sukces) skalibrowanoIle++;
            });

            aktywneKamery.forEach((k) => {
                if (k.radarEl) k.radarEl.style.display = "none";
            });

            if (skalibrowanoIle > 0) {
                wywolajAlert(liczbaUzywanychKamer > 1 ? `Skalibrowano ${skalibrowanoIle}/${liczbaUzywanychKamer} kamer!` : "Tarcza została zlokalizowana! W razie potrzeby dopasuj ją panelem precyzyjnej kalibracji.");
                odswiezKlatkiTlaWszystkich();
                wlaczAutoDetekcjeRzutow();
                if (typeof window._pokazPanelFineTune === "function") window._pokazPanelFineTune();
                rysujNakladkiWszystkich();
            } else {
                wywolajAlert("Nie znaleziono tarczy. Możesz kliknąć '🎯 Kliknij w Bullseye' w panelu kalibracji.");
            }
            aktualizujStanTarczyUI();
        }, 300);
    }

    // =========================================================================
    // 6. RYSOWANIE NAKŁADEK KALIBRACJI I LOTEK (PERSPEKTYWA + INTERAKTYWNE UCHWYTY)
    // =========================================================================
    let krokKalibracji4Pkt = 0; // 0=wyłączony, 1=D20, 2=D6, 3=D3, 4=D11
    let aktywnyWybranyPunkt = "bull"; // "bull", "p20", "p6", "p3", "p11"

    function rysujNakladkeKalibracji(k) {
        if (!k || !k.canvasEl) return;
        const ctxK = k.canvasEl.getContext("2d");
        if (!ctxK) return;

        ctxK.clearRect(0, 0, k.canvasEl.width, k.canvasEl.height);
        if (!k.kalibracja || !k.kalibracja.skalibrowana || !k.kalibracja.punkty4 || !k.kalibracja.homografia) {
            const w = k.canvasEl.width || 640;
            const h = k.canvasEl.height || 480;
            ctxK.fillStyle = "rgba(15, 23, 42, 0.72)";
            ctxK.fillRect(0, h - 50, w, 50);
            ctxK.fillStyle = "#f87171";
            ctxK.font = "bold 13px Inter, sans-serif";
            ctxK.textAlign = "center";
            ctxK.fillText("⚠️ Tarcza niewykryta - punktacja zablokowana", w / 2, h - 28);
            ctxK.fillStyle = "#94a3b8";
            ctxK.font = "11px Inter, sans-serif";
            ctxK.fillText("Skieruj kamerę na tarczę i kliknij '🎯 Auto-Skanuj' lub '📍 Kalibruj 4 punkty'", w / 2, h - 12);
            return;
        }

        const kal = k.kalibracja;
        const H = kal.homografia;

        // 1. Druty radialne (20 linii pajęczyny sizalu od Bulla do podwójnego pierścienia)
        const rBull = CANONICAL_R * 0.0935;
        const rDouble = CANONICAL_R;
        ctxK.lineWidth = 1;
        ctxK.strokeStyle = "rgba(148, 163, 184, 0.35)";
        for (let i = 0; i < 20; i++) {
            const katRad = (-81 + i * 18) * Math.PI / 180;
            const pIn = transformPoint(H, { x: rBull * Math.cos(katRad), y: rBull * Math.sin(katRad) });
            const pOut = transformPoint(H, { x: rDouble * Math.cos(katRad), y: rDouble * Math.sin(katRad) });
            ctxK.beginPath();
            ctxK.moveTo(pIn.x, pIn.y);
            ctxK.lineTo(pOut.x, pOut.y);
            ctxK.stroke();
        }

        // 2. Wypukłe pierścienie perspektywiczne tarczy
        const pierscienie = [
            { r: CANONICAL_R * 0.0374, kolor: "rgba(239, 68, 68, 0.95)", w: 3 },  // D-Bull
            { r: CANONICAL_R * 0.0935, kolor: "rgba(34, 197, 94, 0.9)",  w: 2 },  // Bull
            { r: CANONICAL_R * 0.5706, kolor: "rgba(56, 189, 248, 0.7)", w: 1.5 },// Treble in
            { r: CANONICAL_R * 0.6294, kolor: "rgba(239, 68, 68, 0.9)",  w: 2.5 },// Treble out
            { r: CANONICAL_R * 0.9529, kolor: "rgba(56, 189, 248, 0.7)", w: 1.5 },// Double in
            { r: CANONICAL_R * 1.0,    kolor: "rgba(239, 68, 68, 0.95)", w: 3 },  // Double out
        ];

        const KROKI = 72;
        pierscienie.forEach((p) => {
            ctxK.beginPath();
            for (let i = 0; i <= KROKI; i++) {
                const th = (i * 2 * Math.PI) / KROKI;
                const pt = transformPoint(H, { x: p.r * Math.cos(th), y: p.r * Math.sin(th) });
                if (i === 0) ctxK.moveTo(pt.x, pt.y);
                else ctxK.lineTo(pt.x, pt.y);
            }
            ctxK.closePath();
            ctxK.strokeStyle = p.kolor;
            ctxK.lineWidth = p.w;
            ctxK.stroke();
        });

        // 3. Celownik na środku (Bullseye)
        const bullPt = transformPoint(H, { x: 0, y: 0 });
        const czyBullHover = k._hoverHandle === "bull" || k._dragHandle === "bull" || aktywnyWybranyPunkt === "bull";
        if (czyBullHover) {
            ctxK.beginPath();
            ctxK.arc(bullPt.x, bullPt.y, 14, 0, Math.PI * 2);
            ctxK.fillStyle = "rgba(34, 197, 94, 0.3)";
            ctxK.fill();
            ctxK.strokeStyle = "#22c55e";
            ctxK.lineWidth = 1.5;
            ctxK.stroke();
        }
        ctxK.beginPath();
        ctxK.arc(bullPt.x, bullPt.y, czyBullHover ? 5 : 4, 0, Math.PI * 2);
        ctxK.fillStyle = "#22c55e";
        ctxK.fill();
        ctxK.strokeStyle = "#ffffff";
        ctxK.lineWidth = 1.5;
        ctxK.stroke();

        // 4. 4 interaktywne punkty kontrolne na podwójnym pierścieniu (D20, D6, D3, D11)
        const punktyOrient = [
            { id: "p20", pt: kal.punkty4.p20, kolor: "#ef4444", etykieta: "D20" },
            { id: "p6",  pt: kal.punkty4.p6,  kolor: "#06b6d4", etykieta: "D6"  },
            { id: "p3",  pt: kal.punkty4.p3,  kolor: "#f59e0b", etykieta: "D3"  },
            { id: "p11", pt: kal.punkty4.p11, kolor: "#a855f7", etykieta: "D11" },
        ];

        punktyOrient.forEach(({ id, pt, kolor, etykieta }) => {
            const czyHover = k._hoverHandle === id || k._dragHandle === id || aktywnyWybranyPunkt === id;

            if (czyHover) {
                ctxK.beginPath();
                ctxK.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
                ctxK.fillStyle = `${kolor}44`;
                ctxK.fill();
                ctxK.strokeStyle = kolor;
                ctxK.lineWidth = 1.5;
                ctxK.stroke();
            }

            ctxK.beginPath();
            ctxK.arc(pt.x, pt.y, czyHover ? 8 : 6, 0, Math.PI * 2);
            ctxK.fillStyle = kolor;
            ctxK.fill();
            ctxK.strokeStyle = "#ffffff";
            ctxK.lineWidth = 2;
            ctxK.stroke();

            const badgeOffsetY = id === "p20" ? -16 : id === "p3" ? 16 : 0;
            const badgeOffsetX = id === "p6" ? 22 : id === "p11" ? -22 : 0;
            const bx = pt.x + badgeOffsetX;
            const by = pt.y + badgeOffsetY;

            ctxK.font = "bold 10px Inter, sans-serif";
            ctxK.textAlign = "center";
            ctxK.textBaseline = "middle";
            ctxK.fillStyle = "rgba(15, 23, 42, 0.85)";
            ctxK.fillRect(bx - 13, by - 8, 26, 16);
            ctxK.strokeStyle = kolor;
            ctxK.lineWidth = 1;
            ctxK.strokeRect(bx - 13, by - 8, 26, 16);
            ctxK.fillStyle = "#ffffff";
            ctxK.fillText(etykieta, bx, by);
        });

        // 5. Pasek kroków szybkiej kalibracji 4 punktów
        if (krokKalibracji4Pkt > 0) {
            const tekstyKrokow = [
                "",
                "1/4: Kliknij na zewnętrzny drut DOUBLE 20 (góra)",
                "2/4: Kliknij na zewnętrzny drut DOUBLE 6 (prawo)",
                "3/4: Kliknij na zewnętrzny drut DOUBLE 3 (dół)",
                "4/4: Kliknij na zewnętrzny drut DOUBLE 11 (lewo)"
            ];
            const w = k.canvasEl.width || 640;
            ctxK.fillStyle = "rgba(15, 23, 42, 0.9)";
            ctxK.fillRect(0, 0, w, 36);
            ctxK.fillStyle = "#38bdf8";
            ctxK.font = "bold 13px Inter, sans-serif";
            ctxK.textAlign = "center";
            ctxK.textBaseline = "middle";
            ctxK.fillText(`📍 ${tekstyKrokow[krokKalibracji4Pkt]}`, w / 2, 18);
        }

        // 6. Rysowanie zarejestrowanych lotek z precyzyjnym grotem i wektorem trzonka
        kolejkaLotekKamery.forEach((lotka, lIdx) => {
            let lx = lotka.x, ly = lotka.y;
            let cx = lotka.centroidX, cy = lotka.centroidY;
            if (lotka.kamCoords && lotka.kamCoords[k.id]) {
                lx = lotka.kamCoords[k.id].x;
                ly = lotka.kamCoords[k.id].y;
                if (typeof lotka.kamCoords[k.id].centroidX === "number") {
                    cx = lotka.kamCoords[k.id].centroidX;
                    cy = lotka.kamCoords[k.id].centroidY;
                }
            }
            if (typeof lx === "number" && typeof ly === "number") {
                // Jeśli mamy współrzędne trzonka/piórka, rysujemy wektor orientacji korpusu lotki
                if (typeof cx === "number" && typeof cy === "number" && Math.hypot(lx - cx, ly - cy) > 5) {
                    ctxK.beginPath();
                    ctxK.moveTo(lx, ly);
                    ctxK.lineTo(cx, cy);
                    ctxK.strokeStyle = "rgba(56, 189, 248, 0.75)"; // błękitna linia shaftu/lotki
                    ctxK.lineWidth = 2.5;
                    ctxK.stroke();

                    // Znacznik piórka/środka ciężkości
                    ctxK.beginPath();
                    ctxK.arc(cx, cy, 3, 0, Math.PI * 2);
                    ctxK.fillStyle = "#38bdf8";
                    ctxK.fill();
                }

                // Precyzyjny celownik w miejscu wbicia grota
                ctxK.beginPath();
                ctxK.arc(lx, ly, 6, 0, Math.PI * 2);
                ctxK.fillStyle = "#facc15";
                ctxK.fill();
                ctxK.strokeStyle = "#0f172a";
                ctxK.lineWidth = 2;
                ctxK.stroke();

                ctxK.beginPath();
                ctxK.arc(lx, ly, 2.5, 0, Math.PI * 2);
                ctxK.fillStyle = "#ef4444"; // czerwony punkt kontaktu z sizalem
                ctxK.fill();

                // Krzyżyk na grocie
                ctxK.beginPath();
                ctxK.moveTo(lx - 9, ly);
                ctxK.lineTo(lx + 9, ly);
                ctxK.moveTo(lx, ly - 9);
                ctxK.lineTo(lx, ly + 9);
                ctxK.strokeStyle = "rgba(239, 68, 68, 0.85)";
                ctxK.lineWidth = 1.2;
                ctxK.stroke();

                ctxK.font = "bold 11px Inter, sans-serif";
                const etykieta = `${lIdx + 1}: ${lotka.opis}`;
                const textWidth = ctxK.measureText(etykieta).width;
                ctxK.fillStyle = "rgba(15, 23, 42, 0.85)";
                ctxK.fillRect(lx + 9, ly - 9, textWidth + 8, 18);
                ctxK.strokeStyle = "#facc15";
                ctxK.lineWidth = 1;
                ctxK.strokeRect(lx + 9, ly - 9, textWidth + 8, 18);
                ctxK.fillStyle = "#ffffff";
                ctxK.textAlign = "left";
                ctxK.textBaseline = "middle";
                ctxK.fillText(etykieta, lx + 13, ly);
            }
        });
    }

    function rysujNakladkiWszystkich() {
        kamery.forEach((k, idx) => {
            if (idx < liczbaUzywanychKamer) {
                rysujNakladkeKalibracji(k);
            }
        });
    }

    // =========================================================================
    // 7. PRZELICZANIE POZYCJI NA PUNKTY DARTA (Z TRANSFORMCJĄ HOMOGRAFII)
    // =========================================================================
    function przeliczWspolrzedneNaPunkty(x, y, kal) {
        if (!kal || !kal.skalibrowana) return { punkty: 0, opis: "0" };

        let u, v;
        if (kal.homografiaInv) {
            const canPt = transformPoint(kal.homografiaInv, { x, y });
            u = canPt.x;
            v = canPt.y;
        } else {
            const aspektRatio = kal.aspekt || 1.0;
            u = (x - kal.srodekX) / aspektRatio;
            v = y - kal.srodekY;
        }

        const odleglosc = Math.hypot(u, v);
        const R = CANONICAL_R;

        if (odleglosc > R * 1.04) return { punkty: 0, opis: "0" };
        if (odleglosc <= R * 0.0374) return { punkty: 50, opis: "D-BULL" };
        if (odleglosc <= R * 0.0935) return { punkty: 25, opis: "BULL" };

        let kat = Math.atan2(v, u);
        let katStopnie = (kat * 180) / Math.PI + 90;
        if (katStopnie < 0) katStopnie += 360;
        katStopnie %= 360;

        let index = Math.floor(((katStopnie + 9) % 360) / 18);
        const wartosc = SEKTORY_DARTA[index];

        if (odleglosc >= R * 0.5706 && odleglosc <= R * 0.6294) return { punkty: wartosc * 3, opis: `T${wartosc}` };
        if (odleglosc >= R * 0.9529 && odleglosc <= R * 1.0)   return { punkty: wartosc * 2, opis: `D${wartosc}` };

        return { punkty: wartosc, opis: `${wartosc}` };
    }

    // =========================================================================
    // 8. OBSŁUGA TŁA I KONSENSUSU WIELU KAMER
    // =========================================================================
    function odswiezKlatkiTlaWszystkich() {
        if (!czyOpenCvGotowe || typeof cv === "undefined") return;
        kamery.forEach((k, idx) => {
            if (idx >= liczbaUzywanychKamer || !k.videoEl || !k.videoEl.videoWidth) return;
            let src = null, gray = null;
            try {
                const tempCanvas = document.createElement("canvas");
                tempCanvas.width = k.canvasEl.width || 640;
                tempCanvas.height = k.canvasEl.height || 480;
                tempCanvas.getContext("2d").drawImage(k.videoEl, 0, 0, tempCanvas.width, tempCanvas.height);

                if (k.klatkaTlaMat) {
                    try {
                        k.klatkaTlaMat.delete();
                    } catch (e) {}
                    k.klatkaTlaMat = null;
                }
                src = cv.imread(tempCanvas);
                gray = new cv.Mat();
                cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
                k.klatkaTlaMat = new cv.Mat();
                cv.GaussianBlur(gray, k.klatkaTlaMat, new cv.Size(5, 5), 1.5, 1.5);
            } catch (e) {
                console.warn(`Błąd odświeżania tła dla kamery ${k.id}:`, e);
            } finally {
                if (gray) gray.delete();
                if (src) src.delete();
            }
        });
    }

    function ustalKonsensusRzutu(kandydaci) {
        if (!kandydaci || kandydaci.length === 0) return null;

        const kamCoords = {};
        kandydaci.forEach((k) => {
            kamCoords[k.kameraId] = {
                x: k.x,
                y: k.y,
                centroidX: k.centroidX,
                centroidY: k.centroidY,
                flightX: k.flightX,
                flightY: k.flightY,
            };
        });

        if (kandydaci.length === 1) {
            return {
                punkty: kandydaci[0].punkty,
                opis: kandydaci[0].opis,
                x: kandydaci[0].x,
                y: kandydaci[0].y,
                centroidX: kandydaci[0].centroidX,
                centroidY: kandydaci[0].centroidY,
                flightX: kandydaci[0].flightX,
                flightY: kandydaci[0].flightY,
                kamCoords,
            };
        }

        const glosy = {};
        kandydaci.forEach((k) => {
            glosy[k.opis] = (glosy[k.opis] || 0) + 1;
        });

        let najlepszyOpis = kandydaci[0].opis;
        let maxGlosow = 0;
        for (const opis in glosy) {
            if (glosy[opis] > maxGlosow) {
                maxGlosow = glosy[opis];
                najlepszyOpis = opis;
            }
        }

        const pasujacy = kandydaci.filter((k) => k.opis === najlepszyOpis);
        pasujacy.sort((a, b) => b.pole - a.pole);
        const glowny = pasujacy[0] || kandydaci[0];

        return {
            punkty: glowny.punkty,
            opis: glowny.opis,
            x: glowny.x,
            y: glowny.y,
            centroidX: glowny.centroidX,
            centroidY: glowny.centroidY,
            flightX: glowny.flightX,
            flightY: glowny.flightY,
            kamCoords,
        };
    }

    // -------------------------------------------------------------------------
    // Pomocnik ekstrakcji punktów z konturu OpenCV.js
    // -------------------------------------------------------------------------
    function wyciagnijPunktyKonturu(cnt) {
        const pts = [];
        if (!cnt) return pts;
        const count = cnt.rows || 0;
        if (cnt.data32S && cnt.data32S.length >= count * 2) {
            const d = cnt.data32S;
            for (let i = 0; i < count; i++) {
                pts.push({ x: d[i * 2], y: d[i * 2 + 1] });
            }
        } else if (typeof cnt.intPtr === "function") {
            for (let i = 0; i < count; i++) {
                const ptr = cnt.intPtr(i, 0);
                pts.push({ x: ptr[0], y: ptr[1] });
            }
        }
        return pts;
    }

    // -------------------------------------------------------------------------
    // Algorytm detekcji grota lotki wbitego w tarczę (eliminacja błędu piórka/korpusu)
    // -------------------------------------------------------------------------
    function wykryjGrotLotki(pts, kal) {
        if (!pts || pts.length < 3) {
            if (pts && pts.length > 0) {
                return { x: pts[0].x, y: pts[0].y, centroidX: pts[0].x, centroidY: pts[0].y, flightX: pts[0].x, flightY: pts[0].y, grot: false };
            }
            return null;
        }

        const N = pts.length;
        let sumX = 0, sumY = 0;
        for (let i = 0; i < N; i++) {
            sumX += pts[i].x;
            sumY += pts[i].y;
        }
        const cx = sumX / N;
        const cy = sumY / N;

        // Momenty centralne do wyznaczenia osi wzdłużnej lotki (PCA)
        let sxx = 0, syy = 0, sxy = 0;
        for (let i = 0; i < N; i++) {
            const dx = pts[i].x - cx;
            const dy = pts[i].y - cy;
            sxx += dx * dx;
            syy += dy * dy;
            sxy += dx * dy;
        }

        const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        let vx = Math.cos(theta);
        let vy = Math.sin(theta);

        // Niezmiennik perspektywiczny kamery zamontowanej z lewej strony tarczy:
        // Piórko i korpus wystają przed płaszczyznę sizalu w przestrzeń (Z > 0),
        // przez co z perspektywy lewej kamery piórko ZAWSZE rzutuje się bardziej w lewo (mniejsze x).
        // Grot jest wbity bezpośrednio w sizal (Z = 0) i ZAWSZE znajduje się bardziej po prawej (większe x).
        // Ujednolicamy wektor osi vx tak, aby był skierowany w prawo (w stronę wbitego grota):
        if (vx < 0) {
            vx = -vx;
            vy = -vy;
        }

        let tMin = Infinity, tMax = -Infinity;
        for (let i = 0; i < N; i++) {
            const t = (pts[i].x - cx) * vx + (pts[i].y - cy) * vy;
            if (t < tMin) tMin = t;
            if (t > tMax) tMax = t;
        }

        const L = tMax - tMin;
        if (L < 10) {
            return { x: cx, y: cy, centroidX: cx, centroidY: cy, flightX: cx, flightY: cy, grot: false };
        }

        // Wierzchołek grota (tMax - po prawej stronie osi, styk z sizalem)
        const progGrot = tMax - Math.min(3.5, 0.08 * L);
        let sumGrotX = 0, sumGrotY = 0, numGrot = 0;

        // Piórko lotki (tMin - po lewej stronie osi, w powietrzu)
        const progPiorko = tMin + Math.min(3.5, 0.08 * L);
        let sumPiorkoX = 0, sumPiorkoY = 0, numPiorko = 0;

        for (let i = 0; i < N; i++) {
            const t = (pts[i].x - cx) * vx + (pts[i].y - cy) * vy;
            if (t >= progGrot) {
                sumGrotX += pts[i].x;
                sumGrotY += pts[i].y;
                numGrot++;
            }
            if (t <= progPiorko) {
                sumPiorkoX += pts[i].x;
                sumPiorkoY += pts[i].y;
                numPiorko++;
            }
        }

        let tip = {
            x: numGrot > 0 ? sumGrotX / numGrot : cx + vx * tMax,
            y: numGrot > 0 ? sumGrotY / numGrot : cy + vy * tMax,
        };
        let flight = {
            x: numPiorko > 0 ? sumPiorkoX / numPiorko : cx + vx * tMin,
            y: numPiorko > 0 ? sumPiorkoY / numPiorko : cy + vy * tMin,
        };

        // Walidacja kanoniczna geometrii tarczy
        if (kal && kal.homografiaInv) {
            const canTip = transformPoint(kal.homografiaInv, tip);
            const canFlight = transformPoint(kal.homografiaInv, flight);
            const distTip = Math.hypot(canTip.x, canTip.y);
            const distFlight = Math.hypot(canFlight.x, canFlight.y);

            // Jeśli koniec o większym x wystawałby poza tarczę (> 175mm), a koniec o mniejszym x byłby w tarczy:
            if (distTip > CANONICAL_R * 1.05 && distFlight <= CANONICAL_R * 1.02) {
                const tmp = tip;
                tip = flight;
                flight = tmp;
            }
        }

        return {
            x: tip.x,
            y: tip.y,
            centroidX: cx,
            centroidY: cy,
            flightX: flight.x,
            flightY: flight.y,
            length: L,
            angle: theta,
            grot: true,
        };
    }

    // =========================================================================
    // 9. AUTOMATYCZNA PĘTLA DETEKCJI RZUTÓW
    // =========================================================================
    function wlaczAutoDetekcjeRzutow() {
        if (petlaDetekcjiId) clearInterval(petlaDetekcjiId);
        autoDetekcjaAktywna = true;

        let ostatniRzutCzas = 0;
        let kandydatStabilny = null;
        let liczbaStabilnychRamek = 0;
        const COOLDOWN_PO_RZUCIE_MS = 1200;

        petlaDetekcjiId = setInterval(() => {
            if (!autoDetekcjaAktywna || !czyOpenCvGotowe || typeof cv === "undefined" || kolejkaLotekKamery.length >= 3 || !czyJakakolwiekTarczaWykryta()) return;

            if (Date.now() - ostatniRzutCzas < COOLDOWN_PO_RZUCIE_MS) return;

            const aktywneKamery = kamery.slice(0, liczbaUzywanychKamer).filter((k) => k.klatkaTlaMat && k.videoEl && k.videoEl.videoWidth && k.kalibracja && k.kalibracja.skalibrowana);
            if (aktywneKamery.length === 0) return;

            const kandydaci = [];

            for (const k of aktywneKamery) {
                let obecnaMat = null,
                    obecnaGray = null,
                    obecnaBlurred = null,
                    diff = null,
                    thresh = null,
                    contours = null,
                    hierarchy = null;
                try {
                    const tempCanvas = document.createElement("canvas");
                    tempCanvas.width = k.canvasEl.width || 640;
                    tempCanvas.height = k.canvasEl.height || 480;
                    tempCanvas.getContext("2d").drawImage(k.videoEl, 0, 0, tempCanvas.width, tempCanvas.height);

                    obecnaMat = cv.imread(tempCanvas);
                    obecnaGray = new cv.Mat();
                    obecnaBlurred = new cv.Mat();
                    cv.cvtColor(obecnaMat, obecnaGray, cv.COLOR_RGBA2GRAY);
                    cv.GaussianBlur(obecnaGray, obecnaBlurred, new cv.Size(5, 5), 1.5, 1.5);

                    diff = new cv.Mat();
                    thresh = new cv.Mat();
                    cv.absdiff(k.klatkaTlaMat, obecnaBlurred, diff);
                    // Próg odrzucający drobny szum sensora (35 jest optymalne dla kontrastu lotki na sizalu)
                    cv.threshold(diff, thresh, 35, 255, cv.THRESH_BINARY);

                    contours = new cv.MatVector();
                    hierarchy = new cv.Mat();
                    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);

                    const kal = k.kalibracja;
                    const R = kal.promienD20;
                    const asp = kal.aspekt || 1.0;
                    const srodekX = kal.srodekX;
                    const srodekY = kal.srodekY;

                    const validneKontury = [];
                    let lacznePoleWTarczy = 0;

                    for (let i = 0; i < contours.size(); ++i) {
                        let cnt = contours.get(i);
                        try {
                            let area = cv.contourArea(cnt);
                            // Filtrujemy szum pojedynczych pikseli (< 40 px)
                            if (area >= 40) {
                                let rect = cv.boundingRect(cnt);
                                let pts = wyciagnijPunktyKonturu(cnt);
                                let tipInfo = wykryjGrotLotki(pts, kal);

                                let hitX = rect.x + rect.width / 2;
                                let hitY = rect.y + rect.height / 2;
                                let centroidX = hitX;
                                let centroidY = hitY;
                                let flightX = hitX;
                                let flightY = hitY;

                                if (tipInfo) {
                                    hitX = tipInfo.x;
                                    hitY = tipInfo.y;
                                    centroidX = tipInfo.centroidX;
                                    centroidY = tipInfo.centroidY;
                                    flightX = tipInfo.flightX;
                                    flightY = tipInfo.flightY;
                                }

                                // Sprawdzamy odległość samego grota od środka tarczy
                                let distGrot;
                                if (kal.homografiaInv) {
                                    const can = transformPoint(kal.homografiaInv, { x: hitX, y: hitY });
                                    distGrot = Math.hypot(can.x, can.y);
                                } else {
                                    distGrot = Math.hypot((hitX - srodekX) / asp, hitY - srodekY);
                                }
                                const maxD = kal.homografiaInv ? CANONICAL_R * 1.05 : R * 1.04;
                                // Sprawdzamy czy grot wbił się w tarczę (+ margines na zewnętrzny drut Double)
                                if (distGrot <= maxD) {
                                    lacznePoleWTarczy += area;
                                    validneKontury.push({
                                        area,
                                        rect,
                                        hitX,
                                        hitY,
                                        centroidX,
                                        centroidY,
                                        flightX,
                                        flightY,
                                        dist: distGrot,
                                    });
                                }
                            }
                        } finally {
                            cnt.delete();
                        }
                    }

                    // 1. Zabezpieczenie przed ręką / ciałem wyjmującym lotki (> 8500 px w tarczy)
                    if (lacznePoleWTarczy > 8500) {
                        kandydatStabilny = null;
                        liczbaStabilnychRamek = 0;
                        continue;
                    }

                    if (validneKontury.length > 0) {
                        validneKontury.sort((a, b) => b.area - a.area);
                        const glownyKontur = validneKontury[0];

                        // 2. Zabezpieczenie przed drżeniem kamery / wstrząsem konstrukcji:
                        // Gdy kamera zadrży, linie pajęczyny w różnych ćwiartkach dają kontury oddalone od siebie o >120px
                        const odlegleKontury = validneKontury.filter((c) => {
                            if (c === glownyKontur) return false;
                            let distOdGlownego;
                            if (kal.homografiaInv) {
                                const cCan = transformPoint(kal.homografiaInv, { x: c.hitX, y: c.hitY });
                                const gCan = transformPoint(kal.homografiaInv, { x: glownyKontur.hitX, y: glownyKontur.hitY });
                                distOdGlownego = Math.hypot(cCan.x - gCan.x, cCan.y - gCan.y);
                            } else {
                                distOdGlownego = Math.hypot((c.hitX - glownyKontur.hitX) / asp, c.hitY - glownyKontur.hitY);
                            }
                            return distOdGlownego > 120 && c.area > 70;
                        });

                        // Pojedyncza lotka tworzy 1 skupiony obszar (korpus + cienie). Jeśli są rozrzucone kontury > 2, to wstrząs
                        if (odlegleKontury.length <= 2 && glownyKontur.area >= 45 && glownyKontur.area <= 5000) {
                            const wynik = przeliczWspolrzedneNaPunkty(glownyKontur.hitX, glownyKontur.hitY, k.kalibracja);
                            kandydaci.push({
                                kameraId: k.id,
                                x: glownyKontur.hitX,
                                y: glownyKontur.hitY,
                                centroidX: glownyKontur.centroidX,
                                centroidY: glownyKontur.centroidY,
                                flightX: glownyKontur.flightX,
                                flightY: glownyKontur.flightY,
                                punkty: wynik.punkty,
                                opis: wynik.opis,
                                pole: glownyKontur.area,
                            });
                        }
                    }
                } catch (err) {
                    // Cichy fallback klatki
                } finally {
                    if (obecnaMat) obecnaMat.delete();
                    if (obecnaGray) obecnaGray.delete();
                    if (obecnaBlurred) obecnaBlurred.delete();
                    if (diff) diff.delete();
                    if (thresh) thresh.delete();
                    if (contours) contours.delete();
                    if (hierarchy) hierarchy.delete();
                }
            }

            if (kandydaci.length > 0) {
                const obecny = kandydaci[0];
                // Weryfikacja stabilności przestrzennej: lotka musi pozostać w tym samym punkcie (+- 24px) przez 2 kolejne klatki (~360ms)
                if (kandydatStabilny && Math.hypot(obecny.x - kandydatStabilny.x, obecny.y - kandydatStabilny.y) < 25) {
                    liczbaStabilnychRamek++;
                    if (liczbaStabilnychRamek >= 2) {
                        const wygrany = ustalKonsensusRzutu(kandydaci);
                        if (wygrany) {
                            zarejestrujPunktKamerki(wygrany);
                            ostatniRzutCzas = Date.now();
                            odswiezKlatkiTlaWszystkich();
                        }
                        kandydatStabilny = null;
                        liczbaStabilnychRamek = 0;
                    }
                } else {
                    kandydatStabilny = obecny;
                    liczbaStabilnychRamek = 1;
                }
            } else {
                kandydatStabilny = null;
                liczbaStabilnychRamek = 0;
            }
        }, 180);
    }

    // =========================================================================
    // 10. REJESTRACJA I PODGLĄD PUNKTÓW
    // =========================================================================
    function zarejestrujPunktKamerki(lotka) {
        if (!czyJakakolwiekTarczaWykryta()) {
            wywolajAlert("Tarcza nie została wykryta! Punkty nie są liczone dopóki tarcza nie zostanie znaleziona.");
            return;
        }
        if (kolejkaLotekKamery.length >= 3) return;

        kolejkaLotekKamery.push(lotka);
        rysujNakladkiWszystkich();
        aktualizujPodgladKolejkiKamery();
        wywolajAlert(`Trafienie: ${lotka.opis} (${lotka.punkty} pkt)`);

        if (kolejkaLotekKamery.length === 3) {
            setTimeout(() => {
                if (kolejkaLotekKamery.length === 3 && btnZatwierdzKam) {
                    btnZatwierdzKam.click();
                }
            }, 1200);
        }
    }

    function aktualizujPodgladKolejkiKamery() {
        for (let i = 1; i <= 3; i++) {
            const el = document.getElementById(`kam-lotka-${i}`);
            if (el) el.textContent = kolejkaLotekKamery[i - 1] ? kolejkaLotekKamery[i - 1].opis : "-";
        }
        const suma = kolejkaLotekKamery.reduce((sum, l) => sum + l.punkty, 0);
        const sumEl = document.getElementById("kam-suma-wartosc");
        if (sumEl) sumEl.textContent = suma;
    }

    // =========================================================================
    // 11. PODPIĘCIE ZDARZEŃ DOM
    // =========================================================================
    function podepnijZdarzeniaKamery() {
        let trybUstawianiaSrodka = false;
        let tempPunkty4 = {};
        let blokadaKliknieciaCzas = 0;

        const btnUstawSrodek = document.getElementById("btn-ustaw-srodek-klik");
        const btnKreator4Pkt = document.getElementById("btn-kreator-4pkt");
        const panelFineTune = document.getElementById("panel-fine-tune");
        const sliderPromien = document.getElementById("fine-tune-promien");
        const sliderVal = document.getElementById("fine-tune-promien-val");
        const sliderRotacja = document.getElementById("fine-tune-rotacja");
        const sliderRotacjaVal = document.getElementById("fine-tune-rotacja-val");
        const btnFineTuneReset = document.getElementById("fine-tune-reset");

        function aktualizujPrzyciskAktywnegoPunktu() {
            document.querySelectorAll(".btn-wybierz-punkt").forEach((btn) => {
                const czyTen = btn.dataset.punkt === aktywnyWybranyPunkt;
                if (czyTen) {
                    btn.classList.add("fine-punkt-aktywny");
                    btn.style.background = "#0284c7";
                    btn.style.color = "#ffffff";
                    btn.style.borderColor = "#38bdf8";
                } else {
                    btn.classList.remove("fine-punkt-aktywny");
                    btn.style.background = "#1e293b";
                    btn.style.borderColor = "#334155";
                    const kolorMap = { p20: "#ef4444", p6: "#06b6d4", p3: "#f59e0b", p11: "#a855f7", bull: "#38bdf8" };
                    btn.style.color = kolorMap[btn.dataset.punkt] || "#cbd5e1";
                }
            });
        }

        // 1. KREATOR 4 PUNKTÓW
        if (btnKreator4Pkt) {
            btnKreator4Pkt.addEventListener("click", () => {
                if (krokKalibracji4Pkt > 0) {
                    krokKalibracji4Pkt = 0;
                    btnKreator4Pkt.style.background = "#1e293b";
                    btnKreator4Pkt.style.color = "#38bdf8";
                    btnKreator4Pkt.textContent = "📍 Kalibruj 4 punkty";
                    rysujNakladkiWszystkich();
                } else {
                    krokKalibracji4Pkt = 1;
                    tempPunkty4 = {};
                    trybUstawianiaSrodka = false;
                    if (btnUstawSrodek) {
                        btnUstawSrodek.style.background = "#1e293b";
                        btnUstawSrodek.style.color = "#38bdf8";
                        btnUstawSrodek.textContent = "🎯 Kliknij w Bullseye";
                    }
                    btnKreator4Pkt.style.background = "#059669";
                    btnKreator4Pkt.style.color = "#ffffff";
                    btnKreator4Pkt.textContent = "Krok 1/4: D20 (góra)";
                    wywolajAlert("Kliknij teraz w zewnętrzny drut pola 20 na samej górze tarczy.");
                    rysujNakladkiWszystkich();
                }
            });
        }

        // 2. USTAWIANIE ŚRODKA (BULLSEYE)
        if (btnUstawSrodek) {
            btnUstawSrodek.addEventListener("click", () => {
                trybUstawianiaSrodka = !trybUstawianiaSrodka;
                krokKalibracji4Pkt = 0;
                if (btnKreator4Pkt) {
                    btnKreator4Pkt.style.background = "#1e293b";
                    btnKreator4Pkt.style.color = "#38bdf8";
                    btnKreator4Pkt.textContent = "📍 Kalibruj 4 punkty";
                }
                if (trybUstawianiaSrodka) {
                    btnUstawSrodek.style.background = "#0284c7";
                    btnUstawSrodek.style.color = "#ffffff";
                    btnUstawSrodek.textContent = "👆 Kliknij w Bullseye!";
                    wywolajAlert("Kliknij teraz dokładnie w czerwony środek (Bullseye) na podglądzie kamery.");
                } else {
                    btnUstawSrodek.style.background = "#1e293b";
                    btnUstawSrodek.style.color = "#38bdf8";
                    btnUstawSrodek.textContent = "🎯 Kliknij w Bullseye";
                }
                rysujNakladkiWszystkich();
            });
        }

        // 3. WYBÓR PUNKTU DO MIKRO-KOREKTY
        document.querySelectorAll(".btn-wybierz-punkt").forEach((btn) => {
            btn.addEventListener("click", () => {
                aktywnyWybranyPunkt = btn.dataset.punkt || "bull";
                aktualizujPrzyciskAktywnegoPunktu();
                rysujNakladkiWszystkich();
            });
        });

        // Pomocnik pobierania współrzędnych canvas (mysz i dotyk)
        function pobierzWspolrzedne(e, canvasEl) {
            const rect = canvasEl.getBoundingClientRect();
            const skalaX = canvasEl.width / rect.width;
            const skalaY = canvasEl.height / rect.height;
            let cx = e.clientX, cy = e.clientY;
            if (e.touches && e.touches.length > 0) {
                cx = e.touches[0].clientX;
                cy = e.touches[0].clientY;
            } else if (e.changedTouches && e.changedTouches.length > 0) {
                cx = e.changedTouches[0].clientX;
                cy = e.changedTouches[0].clientY;
            }
            return {
                x: (cx - rect.left) * skalaX,
                y: (cy - rect.top) * skalaY,
            };
        }

        function znajdzUchwyt(pos, kal) {
            if (!kal || !kal.punkty4) return null;
            const PROG = 26;
            const uchwyty = [
                { id: "p20", pt: kal.punkty4.p20 },
                { id: "p6",  pt: kal.punkty4.p6 },
                { id: "p3",  pt: kal.punkty4.p3 },
                { id: "p11", pt: kal.punkty4.p11 },
                { id: "bull", pt: { x: kal.srodekX, y: kal.srodekY } },
            ];
            for (const u of uchwyty) {
                if (Math.hypot(pos.x - u.pt.x, pos.y - u.pt.y) <= PROG) {
                    return u.id;
                }
            }
            return null;
        }

        // Obsługa interakcji na canvas (Przeciąganie 5 uchwytów, Kreator 4 pkt, Klikanie lotek)
        kamery.forEach((k) => {
            if (!k.canvasEl) return;

            const onStart = (e) => {
                if (krokKalibracji4Pkt > 0 || trybUstawianiaSrodka) return;
                const pos = pobierzWspolrzedne(e, k.canvasEl);
                const hid = znajdzUchwyt(pos, k.kalibracja);
                if (hid && k.kalibracja && k.kalibracja.punkty4) {
                    k._dragHandle = hid;
                    k._dragStartX = pos.x;
                    k._dragStartY = pos.y;
                    k._dragOrigPunkty = JSON.parse(JSON.stringify(k.kalibracja.punkty4));
                    k._czyPrzesunieto = false;
                    aktywnyWybranyPunkt = hid;
                    aktualizujPrzyciskAktywnegoPunktu();
                    k.canvasEl.style.cursor = "grabbing";
                    rysujNakladkeKalibracji(k);
                    if (e.cancelable) e.preventDefault();
                }
            };

            const onMove = (e) => {
                const pos = pobierzWspolrzedne(e, k.canvasEl);
                if (k._dragHandle && k.kalibracja && k.kalibracja.punkty4) {
                    const distMoved = Math.hypot(pos.x - k._dragStartX, pos.y - k._dragStartY);
                    if (distMoved > 2) k._czyPrzesunieto = true;

                    if (k._dragHandle === "bull") {
                        const dx = pos.x - k._dragStartX;
                        const dy = pos.y - k._dragStartY;
                        k.kalibracja.punkty4.p20.x = k._dragOrigPunkty.p20.x + dx;
                        k.kalibracja.punkty4.p20.y = k._dragOrigPunkty.p20.y + dy;
                        k.kalibracja.punkty4.p6.x = k._dragOrigPunkty.p6.x + dx;
                        k.kalibracja.punkty4.p6.y = k._dragOrigPunkty.p6.y + dy;
                        k.kalibracja.punkty4.p3.x = k._dragOrigPunkty.p3.x + dx;
                        k.kalibracja.punkty4.p3.y = k._dragOrigPunkty.p3.y + dy;
                        k.kalibracja.punkty4.p11.x = k._dragOrigPunkty.p11.x + dx;
                        k.kalibracja.punkty4.p11.y = k._dragOrigPunkty.p11.y + dy;
                    } else if (k.kalibracja.punkty4[k._dragHandle]) {
                        k.kalibracja.punkty4[k._dragHandle].x = pos.x;
                        k.kalibracja.punkty4[k._dragHandle].y = pos.y;
                    }
                    k.kalibracja._basePunkty4 = null;
                    aktualizujMacierzeKalibracji(k.kalibracja);
                    rysujNakladkeKalibracji(k);
                    if (e.cancelable) e.preventDefault();
                } else if (!krokKalibracji4Pkt && !trybUstawianiaSrodka) {
                    const hid = znajdzUchwyt(pos, k.kalibracja);
                    if (hid !== k._hoverHandle) {
                        k._hoverHandle = hid;
                        k.canvasEl.style.cursor = hid ? "grab" : "default";
                        rysujNakladkeKalibracji(k);
                    }
                }
            };

            const onEnd = () => {
                if (k._dragHandle) {
                    if (k._czyPrzesunieto) {
                        zapiszKalibracjeKamery(k);
                        blokadaKliknieciaCzas = Date.now() + 250;
                        odswiezKlatkiTlaWszystkich();
                    }
                    k._dragHandle = null;
                    k.canvasEl.style.cursor = k._hoverHandle ? "grab" : "default";
                    rysujNakladkeKalibracji(k);
                }
            };

            k.canvasEl.addEventListener("mousedown", onStart);
            k.canvasEl.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onEnd);

            k.canvasEl.addEventListener("touchstart", onStart, { passive: false });
            k.canvasEl.addEventListener("touchmove", onMove, { passive: false });
            window.addEventListener("touchend", onEnd);

            // Zdarzenie click
            k.canvasEl.addEventListener("click", (e) => {
                if (Date.now() < blokadaKliknieciaCzas) return;
                const pos = pobierzWspolrzedne(e, k.canvasEl);
                const klikX = pos.x;
                const klikY = pos.y;

                // TRYB A: Kreator 4 punktów perspektywy
                if (krokKalibracji4Pkt > 0) {
                    if (krokKalibracji4Pkt === 1) {
                        tempPunkty4.p20 = { x: klikX, y: klikY };
                        krokKalibracji4Pkt = 2;
                        if (btnKreator4Pkt) btnKreator4Pkt.textContent = "Krok 2/4: D6 (prawo)";
                        wywolajAlert("Krok 2/4: Kliknij w zewnętrzny drut pola 6 (prawa strona tarczy).");
                        rysujNakladkeKalibracji(k);
                        return;
                    } else if (krokKalibracji4Pkt === 2) {
                        tempPunkty4.p6 = { x: klikX, y: klikY };
                        krokKalibracji4Pkt = 3;
                        if (btnKreator4Pkt) btnKreator4Pkt.textContent = "Krok 3/4: D3 (dół)";
                        wywolajAlert("Krok 3/4: Kliknij w zewnętrzny drut pola 3 (dół tarczy).");
                        rysujNakladkeKalibracji(k);
                        return;
                    } else if (krokKalibracji4Pkt === 3) {
                        tempPunkty4.p3 = { x: klikX, y: klikY };
                        krokKalibracji4Pkt = 4;
                        if (btnKreator4Pkt) btnKreator4Pkt.textContent = "Krok 4/4: D11 (lewo)";
                        wywolajAlert("Krok 4/4: Kliknij w zewnętrzny drut pola 11 (lewa strona tarczy).");
                        rysujNakladkeKalibracji(k);
                        return;
                    } else if (krokKalibracji4Pkt === 4) {
                        tempPunkty4.p11 = { x: klikX, y: klikY };
                        k.kalibracja.punkty4 = { ...tempPunkty4 };
                        k.kalibracja.skalibrowana = true;
                        k.kalibracja._basePunkty4 = null;
                        aktualizujMacierzeKalibracji(k.kalibracja);
                        zapiszKalibracjeKamery(k);

                        krokKalibracji4Pkt = 0;
                        if (btnKreator4Pkt) {
                            btnKreator4Pkt.style.background = "#1e293b";
                            btnKreator4Pkt.style.color = "#38bdf8";
                            btnKreator4Pkt.textContent = "📍 Kalibruj 4 punkty";
                        }
                        pokazPanelFineTune();
                        rysujNakladkiWszystkich();
                        aktualizujStanTarczyUI();
                        odswiezKlatkiTlaWszystkich();
                        wlaczAutoDetekcjeRzutow();
                        wywolajAlert("✓ Kalibracja 4 punktów zakończona sukcesem! Tarcza dopasowana do perspektywy kamery.");
                        return;
                    }
                }

                // TRYB B: Ustawianie środka tarczy (Bullseye)
                if (trybUstawianiaSrodka) {
                    if (!k.kalibracja.punkty4) {
                        const minDim = Math.min(k.canvasEl.width, k.canvasEl.height);
                        const domyslnyR = Math.floor(minDim * 0.36);
                        k.kalibracja.punkty4 = utworzPunktyZOkregu(klikX, klikY, domyslnyR);
                    } else {
                        const dx = klikX - k.kalibracja.srodekX;
                        const dy = klikY - k.kalibracja.srodekY;
                        k.kalibracja.punkty4.p20.x += dx;
                        k.kalibracja.punkty4.p20.y += dy;
                        k.kalibracja.punkty4.p6.x += dx;
                        k.kalibracja.punkty4.p6.y += dy;
                        k.kalibracja.punkty4.p3.x += dx;
                        k.kalibracja.punkty4.p3.y += dy;
                        k.kalibracja.punkty4.p11.x += dx;
                        k.kalibracja.punkty4.p11.y += dy;
                    }
                    k.kalibracja.skalibrowana = true;
                    k.kalibracja._basePunkty4 = null;
                    aktualizujMacierzeKalibracji(k.kalibracja);
                    zapiszKalibracjeKamery(k);

                    trybUstawianiaSrodka = false;
                    if (btnUstawSrodek) {
                        btnUstawSrodek.style.background = "#1e293b";
                        btnUstawSrodek.style.color = "#38bdf8";
                        btnUstawSrodek.textContent = "🎯 Kliknij w Bullseye";
                    }

                    pokazPanelFineTune();
                    rysujNakladkiWszystkich();
                    aktualizujStanTarczyUI();
                    odswiezKlatkiTlaWszystkich();
                    wlaczAutoDetekcjeRzutow();
                    wywolajAlert("Środek tarczy ustawiony! Możesz dopasować punkty D20, D6, D3, D11 przeciągając je myszką.");
                    return;
                }

                // TRYB C: Sprawdzenie czy kliknięto w uchwyt (nie rejestruj rzutu)
                const hid = znajdzUchwyt(pos, k.kalibracja);
                if (hid) {
                    aktywnyWybranyPunkt = hid;
                    aktualizujPrzyciskAktywnegoPunktu();
                    rysujNakladkeKalibracji(k);
                    return;
                }

                // TRYB D: Ręczne oznaczanie lotki na tarczy
                if (!k.kalibracja || !k.kalibracja.skalibrowana) {
                    wywolajAlert(`Kamera ${k.id}: tarcza nie została wykryta! Kliknij '🎯 Auto-Skanuj' lub '📍 Kalibruj 4 punkty'.`);
                    return;
                }

                const wynik = przeliczWspolrzedneNaPunkty(klikX, klikY, k.kalibracja);
                const kamCoords = {};
                kamCoords[k.id] = { x: klikX, y: klikY };

                zarejestrujPunktKamerki({
                    punkty: wynik.punkty,
                    opis: wynik.opis,
                    x: klikX,
                    y: klikY,
                    kamCoords,
                });
                odswiezKlatkiTlaWszystkich();
            });
        });

        // 4. MIKRO-PRZESUNIĘCIE (PRZYCISKI ▲ ▼ ◀ ▶ ORAZ KLAWIATURA)
        function przesunAktywnyPunkt(dx, dy) {
            kamery.forEach((k, idx) => {
                if (idx < liczbaUzywanychKamer && k.kalibracja && k.kalibracja.punkty4) {
                    if (aktywnyWybranyPunkt === "bull") {
                        for (const key of ["p20", "p6", "p3", "p11"]) {
                            k.kalibracja.punkty4[key].x += dx;
                            k.kalibracja.punkty4[key].y += dy;
                        }
                    } else if (k.kalibracja.punkty4[aktywnyWybranyPunkt]) {
                        k.kalibracja.punkty4[aktywnyWybranyPunkt].x += dx;
                        k.kalibracja.punkty4[aktywnyWybranyPunkt].y += dy;
                    }
                    k.kalibracja._basePunkty4 = null;
                    aktualizujMacierzeKalibracji(k.kalibracja);
                    zapiszKalibracjeKamery(k);
                }
            });
            rysujNakladkiWszystkich();
            odswiezKlatkiTlaWszystkich();
        }

        document.querySelectorAll(".fine-tune-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const dx = parseInt(btn.dataset.dx || 0);
                const dy = parseInt(btn.dataset.dy || 0);
                przesunAktywnyPunkt(dx, dy);
            });
        });

        window.addEventListener("keydown", (e) => {
            const klawisze = {
                ArrowUp: { dx: 0, dy: -2 },
                ArrowDown: { dx: 0, dy: 2 },
                ArrowLeft: { dx: -2, dy: 0 },
                ArrowRight: { dx: 2, dy: 0 },
            };
            if (klawisze[e.key] && panelFineTune && panelFineTune.style.display !== "none") {
                if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) return;
                e.preventDefault();
                przesunAktywnyPunkt(klawisze[e.key].dx, klawisze[e.key].dy);
            }
        });

        // 5. SUWAKI SKALI I ROTACJI
        if (sliderPromien) {
            sliderPromien.addEventListener("input", () => {
                const nowaSkala = parseInt(sliderPromien.value);
                if (sliderVal) sliderVal.textContent = nowaSkala;
                kamery.forEach((k, idx) => {
                    if (idx < liczbaUzywanychKamer && k.kalibracja && k.kalibracja.punkty4) {
                        if (!k.kalibracja._basePunkty4) {
                            k.kalibracja._basePunkty4 = JSON.parse(JSON.stringify(k.kalibracja.punkty4));
                        }
                        const ratio = nowaSkala / 100;
                        const sx = k.kalibracja.srodekX;
                        const sy = k.kalibracja.srodekY;
                        for (const key of ["p20", "p6", "p3", "p11"]) {
                            const bp = k.kalibracja._basePunkty4[key];
                            k.kalibracja.punkty4[key].x = sx + (bp.x - sx) * ratio;
                            k.kalibracja.punkty4[key].y = sy + (bp.y - sy) * ratio;
                        }
                        aktualizujMacierzeKalibracji(k.kalibracja);
                        zapiszKalibracjeKamery(k);
                    }
                });
                rysujNakladkiWszystkich();
            });
        }

        if (sliderRotacja) {
            sliderRotacja.addEventListener("input", () => {
                const nowaRot = parseInt(sliderRotacja.value);
                if (sliderRotacjaVal) sliderRotacjaVal.textContent = nowaRot;
                kamery.forEach((k, idx) => {
                    if (idx < liczbaUzywanychKamer && k.kalibracja && k.kalibracja.punkty4) {
                        if (!k.kalibracja._basePunkty4) {
                            k.kalibracja._basePunkty4 = JSON.parse(JSON.stringify(k.kalibracja.punkty4));
                        }
                        const rad = (nowaRot * Math.PI) / 180;
                        const cosA = Math.cos(rad);
                        const sinA = Math.sin(rad);
                        const sx = k.kalibracja.srodekX;
                        const sy = k.kalibracja.srodekY;
                        for (const key of ["p20", "p6", "p3", "p11"]) {
                            const bp = k.kalibracja._basePunkty4[key];
                            const dx = bp.x - sx;
                            const dy = bp.y - sy;
                            k.kalibracja.punkty4[key].x = sx + dx * cosA - dy * sinA;
                            k.kalibracja.punkty4[key].y = sy + dx * sinA + dy * cosA;
                        }
                        aktualizujMacierzeKalibracji(k.kalibracja);
                        zapiszKalibracjeKamery(k);
                    }
                });
                rysujNakladkiWszystkich();
            });
        }

        if (btnFineTuneReset) {
            btnFineTuneReset.addEventListener("click", () => {
                kamery.forEach((k) => {
                    if (k.canvasEl) {
                        const cx = Math.floor(k.canvasEl.width / 2);
                        const cy = Math.floor(k.canvasEl.height / 2);
                        const minDim = Math.min(k.canvasEl.width, k.canvasEl.height);
                        const domyslnyR = Math.floor(minDim * 0.36);
                        k.kalibracja.punkty4 = utworzPunktyZOkregu(cx, cy, domyslnyR);
                        k.kalibracja._basePunkty4 = null;
                        aktualizujMacierzeKalibracji(k.kalibracja);
                        zapiszKalibracjeKamery(k);
                    }
                });
                if (sliderPromien) sliderPromien.value = 100;
                if (sliderVal) sliderVal.textContent = 100;
                if (sliderRotacja) sliderRotacja.value = 0;
                if (sliderRotacjaVal) sliderRotacjaVal.textContent = 0;
                aktywnyWybranyPunkt = "bull";
                aktualizujPrzyciskAktywnegoPunktu();
                rysujNakladkiWszystkich();
                odswiezKlatkiTlaWszystkich();
                wywolajAlert("Zresetowano punkty kalibracji do ustawień domyślnych.");
            });
        }

        // Dodawanie/usuwanie kamer i sterowanie kamerami
        if (btnDodajKamere) {
            btnDodajKamere.addEventListener("click", () => {
                if (liczbaUzywanychKamer < 3) {
                    liczbaUzywanychKamer++;
                    localStorage.setItem("sd_liczba_kamer", liczbaUzywanychKamer);
                    aktualizujWidokLiczbyKamer();
                    wypelnijListeKamer();

                    const czyDziala = kamery.some((k) => k.strumien !== null);
                    if (czyDziala) {
                        uruchomKamere();
                    }
                    wywolajAlert(`Dodano kamerę ${liczbaUzywanychKamer}! Wybierz urządzenie USB i kliknij Auto-Skan.`);
                }
            });
        }

        document.querySelectorAll(".btn-usun-kamere").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (liczbaUzywanychKamer > 1) {
                    liczbaUzywanychKamer = Math.max(1, liczbaUzywanychKamer - 1);
                    localStorage.setItem("sd_liczba_kamer", liczbaUzywanychKamer);
                    aktualizujWidokLiczbyKamer();

                    const czyDziala = kamery.some((k) => k.strumien !== null);
                    if (czyDziala) {
                        uruchomKamere();
                    }
                    wywolajAlert(`Usunięto kamerę. Liczba aktywnych kamer: ${liczbaUzywanychKamer}.`);
                }
            });
        });

        kamery.forEach((k) => {
            if (k.selectEl) {
                k.selectEl.addEventListener("change", () => {
                    if (k.strumien) {
                        uruchomKamere();
                    }
                });
            }
        });

        if (btnStartKam) {
            btnStartKam.addEventListener("click", () => {
                const czyDziala = kamery.some((k) => k.strumien !== null);
                if (czyDziala) {
                    wylaczKamere();
                    wywolajAlert(liczbaUzywanychKamer > 1 ? "Kamery zostały wyłączone." : "Kamera została wyłączona.");
                } else {
                    zaladujOpenCvNaZadanie();
                    uruchomKamere();
                }
            });
        }

        if (btnAutoSkan) btnAutoSkan.addEventListener("click", automatycznySkanTarczy);
        if (btnResetTla) {
            btnResetTla.addEventListener("click", () => {
                kolejkaLotekKamery = [];
                aktualizujPodgladKolejkiKamery();
                odswiezKlatkiTlaWszystkich();
                rysujNakladkiWszystkich();
                wywolajAlert("Zaktualizowano tło tarczy. Gotowe do kolejnych rzutów!");
            });
        }

        const cofnijOstatniaLotke = () => {
            if (kolejkaLotekKamery.length > 0) {
                kolejkaLotekKamery.pop();
                rysujNakladkiWszystkich();
                aktualizujPodgladKolejkiKamery();
                odswiezKlatkiTlaWszystkich();
            } else {
                const btnCofnijGlowny = document.getElementById("btn-cofnij-rzut");
                if (btnCofnijGlowny) btnCofnijGlowny.click();
            }
        };

        const btnCofnijLotke = document.getElementById("kam-cofnij-lotke");
        if (btnCofnijLotke) {
            btnCofnijLotke.addEventListener("click", cofnijOstatniaLotke);
        }

        const btnKamCofnijRzut = document.getElementById("btn-kam-cofnij-rzut");
        if (btnKamCofnijRzut) {
            btnKamCofnijRzut.addEventListener("click", cofnijOstatniaLotke);
        }

        if (btnZatwierdzKam) {
            btnZatwierdzKam.addEventListener("click", () => {
                if (!czyJakakolwiekTarczaWykryta()) {
                    wywolajAlert("Tarcza nie została wykryta - brak możliwości zatwierdzenia punktów!");
                    return;
                }
                if (kolejkaLotekKamery.length === 0) return;

                const suma = kolejkaLotekKamery.reduce((sum, l) => sum + l.punkty, 0);

                if (typeof window.przetwarzajRzutMeczu === "function") {
                    window.przetwarzajRzutMeczu(suma, suma.toString(), kolejkaLotekKamery.length, [...kolejkaLotekKamery]);
                }

                kolejkaLotekKamery = [];
                aktualizujPodgladKolejkiKamery();
                rysujNakladkiWszystkich();
                odswiezKlatkiTlaWszystkich();
            });
        }

        function pokazPanelFineTune() {
            if (panelFineTune) panelFineTune.style.display = "flex";
            aktualizujPrzyciskAktywnegoPunktu();
        }

        // Pokaż panel jeśli tarcza jest już skalibrowana
        if (kamery[0].kalibracja && kamery[0].kalibracja.skalibrowana) {
            pokazPanelFineTune();
        }

        aktualizujWidokLiczbyKamer();

        window._pokazPanelFineTune = pokazPanelFineTune;
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", podepnijZdarzeniaKamery);
    } else {
        podepnijZdarzeniaKamery();
    }

    // Bezpieczne wyłączanie kamer przy opuszczaniu widoku
    window.addEventListener("beforeunload", wylaczKamere);
    window.addEventListener("pagehide", wylaczKamere);

    // =========================================================================
    // EXPORT DO WINDOW DLA GŁÓWNEGO PLIKU GRY
    // =========================================================================
    window.wylaczKamere = wylaczKamere;
    window.wypelnijListeKamer = wypelnijListeKamer;
    window.zaladujOpenCvNaZadanie = zaladujOpenCvNaZadanie;
    window.aktualizujWidokLiczbyKamer = aktualizujWidokLiczbyKamer;
    window.automatycznySkanTarczy = automatycznySkanTarczy;
    window.odswiezKlatkiTlaWszystkich = odswiezKlatkiTlaWszystkich;
})();
// =========================================================================
// STACJA DARTA - ZAAWANSOWANY MODUŁ KAMER & AUTOSCORE MULTI-KAMERA (1-3 KAMERY)
// Lazy-loaded OpenCV.js WebAssembly Engine
// =========================================================================

(function () {
    "use strict";

    const btnDodajKamere = document.getElementById("btn-dodaj-kamere");
    const btnStartKam = document.getElementById("btn-start-kamera");
    const btnAutoSkan = document.getElementById("btn-auto-skan");
    const btnResetTla = document.getElementById("btn-reset-tla");
    const btnZatwierdzKam = document.getElementById("btn-zatwierdz-kamera");
    const opencvStatusEl = document.getElementById("kamera-opencv-status");
    const tarczaStanEl = document.getElementById("kamera-stan-tarczy");
    const strefaKamera = document.querySelector(".strefa-kamera");

    let liczbaUzywanychKamer = parseInt(localStorage.getItem("sd_liczba_kamer") || "1") || 1;
    let kolejkaLotekKamery = [];
    let czyOpenCvGotowe = false;
    let czyLadujeOpenCv = false;
    let autoDetekcjaAktywna = false;
    let petlaDetekcjiId = null;

    const SEKTORY_DARTA = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

    // =========================================================================
    // MATEMATYKA TRANSFORMACJI PERSPEKTYWICZNEJ (HOMOGRAFIA 3x3 DLA DARTA)
    // =========================================================================
    const CANONICAL_R = 170; // promień zewnętrznego drutu Double w mm
    const CANONICAL_SRC = [
        { x: 0, y: -CANONICAL_R }, // D20 (góra, 0°)
        { x: CANONICAL_R, y: 0 },  // D6 (prawo, 90°)
        { x: 0, y: CANONICAL_R },  // D3 (dół, 180°)
        { x: -CANONICAL_R, y: 0 }, // D11 (lewo, 270°)
    ];

    function solveLinearSystem(A, b) {
        const n = b.length;
        for (let i = 0; i < n; i++) {
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
            }
            [A[i], A[maxRow]] = [A[maxRow], A[i]];
            [b[i], b[maxRow]] = [b[maxRow], b[i]];
            if (Math.abs(A[i][i]) < 1e-12) return null;
            for (let k = i + 1; k < n; k++) {
                const factor = A[k][i] / A[i][i];
                for (let j = i; j < n; j++) A[k][j] -= factor * A[i][j];
                b[k] -= factor * b[i];
            }
        }
        const x = new Array(n);
        for (let i = n - 1; i >= 0; i--) {
            let sum = b[i];
            for (let j = i + 1; j < n; j++) sum -= A[i][j] * x[j];
            x[i] = sum / A[i][i];
        }
        return x;
    }

    function getHomography(srcPts, dstPts) {
        const A = [];
        const b = [];
        for (let i = 0; i < 4; i++) {
            const u = srcPts[i].x, v = srcPts[i].y;
            const x = dstPts[i].x, y = dstPts[i].y;
            A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
            b.push(x);
            A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
            b.push(y);
        }
        const h = solveLinearSystem(A, b);
        if (!h) return null;
        return [
            [h[0], h[1], h[2]],
            [h[3], h[4], h[5]],
            [h[6], h[7], 1.0]
        ];
    }

    function invert3x3(m) {
        if (!m) return null;
        const a = m[0][0], b = m[0][1], c = m[0][2];
        const d = m[1][0], e = m[1][1], f = m[1][2];
        const g = m[2][0], h = m[2][1], k = m[2][2];
        const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
        if (Math.abs(det) < 1e-12) return null;
        const invdet = 1.0 / det;
        return [
            [(e * k - f * h) * invdet, (c * h - b * k) * invdet, (b * f - c * e) * invdet],
            [(f * g - d * k) * invdet, (a * k - c * g) * invdet, (c * d - a * f) * invdet],
            [(d * h - e * g) * invdet, (g * b - a * h) * invdet, (a * e - b * d) * invdet]
        ];
    }

    function transformPoint(m, pt) {
        if (!m || !pt) return { x: 0, y: 0 };
        const w = m[2][0] * pt.x + m[2][1] * pt.y + m[2][2];
        if (Math.abs(w) < 1e-12) return { x: 0, y: 0 };
        return {
            x: (m[0][0] * pt.x + m[0][1] * pt.y + m[0][2]) / w,
            y: (m[1][0] * pt.x + m[1][1] * pt.y + m[1][2]) / w
        };
    }

    function utworzPunktyZOkregu(cx, cy, r, katRotacji = 0, aspekt = 1.0) {
        const rot = katRotacji || 0;
        const asp = aspekt || 1.0;
        const getP = (deg) => {
            const rad = (deg - 90) * Math.PI / 180 + rot;
            return {
                x: cx + r * Math.cos(rad) * asp,
                y: cy + r * Math.sin(rad)
            };
        };
        return {
            p20: getP(0),
            p6:  getP(90),
            p3:  getP(180),
            p11: getP(270)
        };
    }

    function aktualizujMacierzeKalibracji(kal) {
        if (!kal || !kal.punkty4) return false;
        const dst = [
            kal.punkty4.p20,
            kal.punkty4.p6,
            kal.punkty4.p3,
            kal.punkty4.p11
        ];
        const H = getHomography(CANONICAL_SRC, dst);
        if (!H) return false;
        const Hinv = invert3x3(H);
        if (!Hinv) return false;
        kal.homografia = H;
        kal.homografiaInv = Hinv;

        const bull = transformPoint(H, { x: 0, y: 0 });
        kal.srodekX = bull.x;
        kal.srodekY = bull.y;

        const d0 = Math.hypot(dst[0].x - bull.x, dst[0].y - bull.y);
        const d1 = Math.hypot(dst[1].x - bull.x, dst[1].y - bull.y);
        const d2 = Math.hypot(dst[2].x - bull.x, dst[2].y - bull.y);
        const d3 = Math.hypot(dst[3].x - bull.x, dst[3].y - bull.y);
        kal.promienD20 = (d0 + d1 + d2 + d3) / 4;
        kal.skalibrowana = true;
        return true;
    }

    function zapiszKalibracjeKamery(k) {
        if (!k || !k.kalibracja) return;
        localStorage.setItem(`sd_dart_kalibracja_${k.id}`, JSON.stringify(k.kalibracja));
        if (k.id === 1) {
            localStorage.setItem("sd_dart_kalibracja", JSON.stringify(k.kalibracja));
        }
    }

    function wczytajKalibracje(klucz) {
        const raw = JSON.parse(localStorage.getItem(klucz) || "null");
        if (!raw) return null;
        if (raw.punkty4) {
            aktualizujMacierzeKalibracji(raw);
        } else if (raw.srodekX && raw.promienD20) {
            raw.punkty4 = utworzPunktyZOkregu(raw.srodekX, raw.srodekY, raw.promienD20, raw.katRotacji || 0, raw.aspekt || 1.0);
            aktualizujMacierzeKalibracji(raw);
        }
        return raw;
    }

    const domyslnaKalibracja = () => ({
        srodekX: 0,
        srodekY: 0,
        promienD20: 0,
        katRotacji: 0,
        aspekt: 1.0,
        punkty4: null,
        homografia: null,
        homografiaInv: null,
        skalibrowana: false,
    });

    const kamery = [
        {
            id: 1,
            selectEl: document.getElementById("kamera-select"),
            videoEl: document.getElementById("kamera-podglad"),
            canvasEl: document.getElementById("kamera-canvas"),
            radarEl: document.getElementById("radar-skanera"),
            boxEl: document.getElementById("box-kamera-1"),
            slotSelectEl: document.getElementById("slot-select-kamera-1"),
            strumien: null,
            klatkaTlaMat: null,
            kalibracja: wczytajKalibracje("sd_dart_kalibracja_1") || wczytajKalibracje("sd_dart_kalibracja") || domyslnaKalibracja(),
        },
        {
            id: 2,
            selectEl: document.getElementById("kamera-select-2"),
            videoEl: document.getElementById("kamera-podglad-2"),
            canvasEl: document.getElementById("kamera-canvas-2"),
            radarEl: document.getElementById("radar-skanera-2"),
            boxEl: document.getElementById("box-kamera-2"),
            slotSelectEl: document.getElementById("slot-select-kamera-2"),
            strumien: null,
            klatkaTlaMat: null,
            kalibracja: wczytajKalibracje("sd_dart_kalibracja_2") || domyslnaKalibracja(),
        },
        {
            id: 3,
            selectEl: document.getElementById("kamera-select-3"),
            videoEl: document.getElementById("kamera-podglad-3"),
            canvasEl: document.getElementById("kamera-canvas-3"),
            radarEl: document.getElementById("radar-skanera-3"),
            boxEl: document.getElementById("box-kamera-3"),
            slotSelectEl: document.getElementById("slot-select-kamera-3"),
            strumien: null,
            klatkaTlaMat: null,
            kalibracja: wczytajKalibracje("sd_dart_kalibracja_3") || domyslnaKalibracja(),
        },
    ];

    // Pomocniczy alert
    function wywolajAlert(wiadomosc) {
        if (typeof window.pokazCustomowyAlert === "function") {
            window.pokazCustomowyAlert(wiadomosc);
        } else {
            alert(wiadomosc);
        }
    }

    // =========================================================================
    // 1. LAZY-LOADING OPENCV.JS (Pobieranie tylko na żądanie po wejściu w kamerę)
    // =========================================================================
    function zaladujOpenCvNaZadanie() {
        if (typeof cv !== "undefined" && cv.Mat) {
            czyOpenCvGotowe = true;
            if (opencvStatusEl) {
                opencvStatusEl.textContent = "Silnik wizyjny AI aktywny ✓";
                opencvStatusEl.style.color = "#4ade80";
            }
            return Promise.resolve();
        }

        if (czyLadujeOpenCv) return;
        czyLadujeOpenCv = true;

        if (opencvStatusEl) {
            opencvStatusEl.textContent = "Pobieranie silnika AI (OpenCV)...";
            opencvStatusEl.style.color = "#facc15";
        }

        return new Promise((resolve, reject) => {
            const istniejacy = document.getElementById("opencv-script");
            if (istniejacy) istniejacy.remove();

            const script = document.createElement("script");
            script.id = "opencv-script";
            script.async = true;
            script.src = "https://docs.opencv.org/4.x/opencv.js";

            const sprawdzGotowosc = () => {
                let proby = 0;
                const timer = setInterval(() => {
                    proby++;
                    if (typeof cv !== "undefined" && cv.Mat) {
                        clearInterval(timer);
                        czyOpenCvGotowe = true;
                        if (opencvStatusEl) {
                            opencvStatusEl.textContent = "Silnik wizyjny AI aktywny ✓";
                            opencvStatusEl.style.color = "#4ade80";
                        }
                        resolve();
                    } else if (proby > 50) {
                        if (opencvStatusEl && !czyOpenCvGotowe) {
                            opencvStatusEl.textContent = "Ładowanie OpenCV trwa dłużej niż zwykle...";
                            opencvStatusEl.style.color = "#facc15";
                        }
                    }
                }, 300);
            };

            script.onload = () => {
                if (typeof cv !== "undefined") {
                    if (cv.onRuntimeInitialized) {
                        cv.onRuntimeInitialized = () => {
                            czyOpenCvGotowe = true;
                            if (opencvStatusEl) {
                                opencvStatusEl.textContent = "Silnik wizyjny AI aktywny ✓";
                                opencvStatusEl.style.color = "#4ade80";
                            }
                            resolve();
                        };
                    } else {
                        sprawdzGotowosc();
                    }
                } else {
                    sprawdzGotowosc();
                }
            };

            script.onerror = () => {
                czyLadujeOpenCv = false;
                if (opencvStatusEl) {
                    opencvStatusEl.textContent = "Błąd pobierania silnika AI (sprawdź sieć)";
                    opencvStatusEl.style.color = "#f87171";
                }
                reject(new Error("Błąd sieci podczas pobierania OpenCV"));
            };

            document.head.appendChild(script);
        });
    }

    // =========================================================================
    // 2. ZARZĄDZANIE WIDOKIEM I UKŁADEM KAMER (1-3)
    // =========================================================================
    function aktualizujWidokLiczbyKamer() {
        const siatka = document.getElementById("siatka-kamer");

        if (btnDodajKamere) {
            if (liczbaUzywanychKamer >= 3) {
                btnDodajKamere.style.display = "none";
            } else {
                btnDodajKamere.style.display = "inline-flex";
                btnDodajKamere.innerHTML = `<span>Dodaj kamerę (${liczbaUzywanychKamer}/3)</span>`;
            }
        }

        if (strefaKamera) {
            strefaKamera.style.maxWidth = liczbaUzywanychKamer === 1 ? "600px" : liczbaUzywanychKamer === 2 ? "760px" : "840px";
        }

        if (siatka) {
            if (liczbaUzywanychKamer === 1) {
                siatka.style.gridTemplateColumns = "1fr";
                siatka.style.maxWidth = "480px";
            } else if (liczbaUzywanychKamer === 2) {
                siatka.style.gridTemplateColumns = "repeat(2, 1fr)";
                siatka.style.maxWidth = "680px";
            } else {
                siatka.style.gridTemplateColumns = "repeat(3, 1fr)";
                siatka.style.maxWidth = "780px";
            }
        }

        kamery.forEach((k, idx) => {
            const czyAktywna = idx < liczbaUzywanychKamer;
            if (k.slotSelectEl) k.slotSelectEl.style.display = czyAktywna ? "flex" : "none";
            if (k.boxEl) k.boxEl.style.display = czyAktywna ? "block" : "none";
            if (!czyAktywna && k.strumien) {
                k.strumien.getTracks().forEach((t) => t.stop());
                k.strumien = null;
                if (k.videoEl) k.videoEl.srcObject = null;
                if (k.klatkaTlaMat) {
                    try {
                        k.klatkaTlaMat.delete();
                    } catch (e) {}
                    k.klatkaTlaMat = null;
                }
            }
        });

        aktualizujStanTarczyUI();
    }

    function czyJakakolwiekTarczaWykryta() {
        const aktywne = kamery.slice(0, liczbaUzywanychKamer);
        return aktywne.some((k) => k.kalibracja && k.kalibracja.skalibrowana);
    }

    function aktualizujStanTarczyUI() {
        if (!tarczaStanEl) return;
        const aktywne = kamery.slice(0, liczbaUzywanychKamer);
        const skalibrowane = aktywne.filter((k) => k.kalibracja && k.kalibracja.skalibrowana).length;

        if (skalibrowane === aktywne.length && aktywne.length > 0) {
            tarczaStanEl.textContent = liczbaUzywanychKamer > 1 ? `Tarcze: Wykryte (${skalibrowane}/${aktywne.length}) ✓ (punktacja aktywna)` : "Tarcza: Wykryta ✓ (punktacja aktywna)";
            tarczaStanEl.style.color = "#4ade80";
        } else if (skalibrowane > 0) {
            tarczaStanEl.textContent = `Tarcze: Wykryte częściowo (${skalibrowane}/${aktywne.length}) - punktacja z ${skalibrowane} kamer`;
            tarczaStanEl.style.color = "#facc15";
        } else {
            tarczaStanEl.textContent = "Tarcza: Niewykryta ❌ (punktacja wyłączona)";
            tarczaStanEl.style.color = "#ef4444";
        }
    }

    // =========================================================================
    // 3. ENUMERACJA I LISTOWANIE KAMER USB
    // =========================================================================
    async function wypelnijListeKamer() {
        try {
            const urzadzenia = await navigator.mediaDevices.enumerateDevices();
            const kameryUrzadzenia = urzadzenia.filter((d) => d.kind === "videoinput");

            kamery.forEach((k, camIdx) => {
                if (!k.selectEl) return;
                const poprzWartosc = k.selectEl.value;
                k.selectEl.innerHTML = "";
                kameryUrzadzenia.forEach((dev, idx) => {
                    const opt = document.createElement("option");
                    opt.value = dev.deviceId;
                    opt.textContent = dev.label || `Kamera USB ${idx + 1}`;
                    k.selectEl.appendChild(opt);
                });

                if (poprzWartosc && Array.from(k.selectEl.options).some((o) => o.value === poprzWartosc)) {
                    k.selectEl.value = poprzWartosc;
                } else if (kameryUrzadzenia[camIdx]) {
                    k.selectEl.value = kameryUrzadzenia[camIdx].deviceId;
                }
            });
        } catch (e) {
            console.warn("Dostęp do urządzeń wideo:", e);
        }
    }

    // =========================================================================
    // 4. URUCHAMIANIE I WYŁĄCZANIE KAMER
    // =========================================================================
    async function uruchomKamere() {
        let uruchomionoCokolwiek = false;

        for (let i = 0; i < liczbaUzywanychKamer; i++) {
            const k = kamery[i];
            if (k.strumien) {
                k.strumien.getTracks().forEach((t) => t.stop());
                k.strumien = null;
            }

            const deviceId = k.selectEl ? k.selectEl.value : null;
            const constraints = {
                video: deviceId ? { deviceId: { exact: deviceId } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
            };

            try {
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                k.strumien = stream;
                if (k.videoEl) {
                    k.videoEl.srcObject = stream;
                    k.videoEl.onloadedmetadata = () => {
                        const vw = k.videoEl.videoWidth || 640;
                        const vh = k.videoEl.videoHeight || 480;
                        if (k.canvasEl) {
                            k.canvasEl.width = vw;
                            k.canvasEl.height = vh;
                        }
                        if (k.boxEl) {
                            k.boxEl.style.aspectRatio = `${vw} / ${vh}`;
                        }
                        rysujNakladkeKalibracji(k);
                    };
                }
                uruchomionoCokolwiek = true;
            } catch (err) {
                console.warn(`Błąd kamery ${i + 1}:`, err);
                wywolajAlert(`Kamera ${i + 1}: błąd dostępu (${err.message})`);
            }
        }

        if (uruchomionoCokolwiek) {
            if (btnStartKam) {
                btnStartKam.textContent = liczbaUzywanychKamer > 1 ? "Kamery działają" : "Kamera działa";
                btnStartKam.style.background = "#40da40";
            }

            setTimeout(() => {
                odswiezKlatkiTlaWszystkich();
                aktualizujStanTarczyUI();
                if (!czyJakakolwiekTarczaWykryta()) {
                    automatycznySkanTarczy();
                } else {
                    wlaczAutoDetekcjeRzutow();
                }
            }, 800);
        }
    }

    function wylaczKamere() {
        autoDetekcjaAktywna = false;
        if (petlaDetekcjiId) {
            clearInterval(petlaDetekcjiId);
            petlaDetekcjiId = null;
        }

        kamery.forEach((k) => {
            if (k.strumien) {
                k.strumien.getTracks().forEach((track) => track.stop());
                k.strumien = null;
            }
            if (k.videoEl) {
                k.videoEl.srcObject = null;
            }
            if (k.klatkaTlaMat) {
                try {
                    k.klatkaTlaMat.delete();
                } catch (e) {}
                k.klatkaTlaMat = null;
            }
            if (k.canvasEl) {
                const cctx = k.canvasEl.getContext("2d");
                if (cctx) cctx.clearRect(0, 0, k.canvasEl.width, k.canvasEl.height);
            }
            if (k.radarEl) {
                k.radarEl.style.display = "none";
            }
        });

        if (btnStartKam) {
            btnStartKam.textContent = liczbaUzywanychKamer > 1 ? "Włącz kamery" : "Włącz kamerę";
            btnStartKam.style.background = "#40da40";
        }
    }

    // =========================================================================
    // 5. KALIBRACJA I SKANOWANIE TARCZY
    // =========================================================================
    function skanujPojedynczaKamere(k) {
        if (!czyOpenCvGotowe || typeof cv === "undefined") return false;
        let src = null, gray = null, blurred = null, circles = null;
        try {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = k.canvasEl.width || 640;
            tempCanvas.height = k.canvasEl.height || 480;
            tempCanvas.getContext("2d").drawImage(k.videoEl, 0, 0, tempCanvas.width, tempCanvas.height);

            src = cv.imread(tempCanvas);
            gray = new cv.Mat();
            blurred = new cv.Mat();

            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            cv.GaussianBlur(gray, blurred, new cv.Size(9, 9), 2, 2);

            const minDim = Math.min(src.rows, src.cols);
            const minPromien = Math.floor(minDim * 0.18);
            const maxPromien = Math.floor(minDim * 0.52);

            // Kilka prób z różną czułością dla pewniejszego wykrycia tarczy
            const proby = [
                { dp: 1.2, minDist: blurred.rows / 6, p1: 100, p2: 40 },
                { dp: 1.4, minDist: blurred.rows / 5, p1: 80,  p2: 32 },
                { dp: 1.0, minDist: blurred.rows / 6, p1: 120, p2: 50 },
            ];

            let znaleziony = false;
            for (const proba of proby) {
                circles = new cv.Mat();
                cv.HoughCircles(blurred, circles, cv.HOUGH_GRADIENT, proba.dp, proba.minDist, proba.p1, proba.p2, minPromien, maxPromien);
                if (circles.cols > 0) { znaleziony = true; break; }
                circles.delete(); circles = null;
            }

            if (znaleziony && circles && circles.cols > 0) {
                let bestIdx = 0, maxR = 0;
                for (let i = 0; i < circles.cols; ++i) {
                    const r = circles.data32F[i * 3 + 2];
                    if (r > maxR) { maxR = r; bestIdx = i; }
                }

                const rawR = circles.data32F[bestIdx * 3 + 2];
                // Jeśli wykryty okrąg to zewnętrzna obudowa/surround (>33% wymiaru kadru),
                // promień pola gry (drut double) to ~81% obudowy
                const promienD20 = rawR > minDim * 0.33 ? rawR * 0.81 : rawR;
                const cx = circles.data32F[bestIdx * 3];
                const cy = circles.data32F[bestIdx * 3 + 1];

                k.kalibracja = {
                    punkty4: utworzPunktyZOkregu(cx, cy, promienD20),
                    skalibrowana: true,
                };
                aktualizujMacierzeKalibracji(k.kalibracja);
                k.kalibracja._rawPunkty4 = JSON.parse(JSON.stringify(k.kalibracja.punkty4));

                zapiszKalibracjeKamery(k);
                rysujNakladkeKalibracji(k);
                return true;
            }

            // Fallback: jeśli algorytm nie znalazł okręgu, ustaw bezpieczny środek kadru
            const cx = Math.floor(tempCanvas.width / 2);
            const cy = Math.floor(tempCanvas.height / 2);
            const domyslnyR = Math.floor(minDim * 0.36);
            k.kalibracja = {
                punkty4: utworzPunktyZOkregu(cx, cy, domyslnyR),
                skalibrowana: true,
            };
            aktualizujMacierzeKalibracji(k.kalibracja);
            k.kalibracja._rawPunkty4 = JSON.parse(JSON.stringify(k.kalibracja.punkty4));

            zapiszKalibracjeKamery(k);
            rysujNakladkeKalibracji(k);
            return true;
        } catch (e) {
            console.warn(`Błąd skanowania dla kamery ${k.id}:`, e);
            return false;
        } finally {
            if (src) src.delete();
            if (gray) gray.delete();
            if (blurred) blurred.delete();
            if (circles) { try { circles.delete(); } catch(e){} }
        }
    }

    function automatycznySkanTarczy() {
        if (!czyOpenCvGotowe) {
            wywolajAlert("Silnik OpenCV jeszcze się ładuje, poczekaj chwilę...");
            return;
        }
        const aktywneKamery = kamery.slice(0, liczbaUzywanychKamer).filter((k) => k.videoEl && k.videoEl.videoWidth);
        if (aktywneKamery.length === 0) {
            wywolajAlert("Najpierw włącz kamery!");
            return;
        }

        aktywneKamery.forEach((k) => {
            if (k.radarEl) k.radarEl.style.display = "block";
        });
        if (tarczaStanEl) {
            tarczaStanEl.textContent = "Tarcza: Skanowanie...";
            tarczaStanEl.style.color = "#38bdf8";
        }

        setTimeout(() => {
            let skalibrowanoIle = 0;
            aktywneKamery.forEach((k) => {
                const sukces = skanujPojedynczaKamere(k);
                if (sukces) skalibrowanoIle++;
            });

            aktywneKamery.forEach((k) => {
                if (k.radarEl) k.radarEl.style.display = "none";
            });

            if (skalibrowanoIle > 0) {
                wywolajAlert(liczbaUzywanychKamer > 1 ? `Skalibrowano ${skalibrowanoIle}/${liczbaUzywanychKamer} kamer!` : "Tarcza została zlokalizowana! W razie potrzeby dopasuj ją panelem precyzyjnej kalibracji.");
                odswiezKlatkiTlaWszystkich();
                wlaczAutoDetekcjeRzutow();
                if (typeof window._pokazPanelFineTune === "function") window._pokazPanelFineTune();
                rysujNakladkiWszystkich();
            } else {
                wywolajAlert("Nie znaleziono tarczy. Możesz kliknąć '🎯 Kliknij w Bullseye' w panelu kalibracji.");
            }
            aktualizujStanTarczyUI();
        }, 300);
    }

    // =========================================================================
    // 6. RYSOWANIE NAKŁADEK KALIBRACJI I LOTEK (PERSPEKTYWA + INTERAKTYWNE UCHWYTY)
    // =========================================================================
    let krokKalibracji4Pkt = 0; // 0=wyłączony, 1=D20, 2=D6, 3=D3, 4=D11
    let aktywnyWybranyPunkt = "bull"; // "bull", "p20", "p6", "p3", "p11"

    function rysujNakladkeKalibracji(k) {
        if (!k || !k.canvasEl) return;
        const ctxK = k.canvasEl.getContext("2d");
        if (!ctxK) return;

        ctxK.clearRect(0, 0, k.canvasEl.width, k.canvasEl.height);
        if (!k.kalibracja || !k.kalibracja.skalibrowana || !k.kalibracja.punkty4 || !k.kalibracja.homografia) {
            const w = k.canvasEl.width || 640;
            const h = k.canvasEl.height || 480;
            ctxK.fillStyle = "rgba(15, 23, 42, 0.72)";
            ctxK.fillRect(0, h - 50, w, 50);
            ctxK.fillStyle = "#f87171";
            ctxK.font = "bold 13px Inter, sans-serif";
            ctxK.textAlign = "center";
            ctxK.fillText("⚠️ Tarcza niewykryta - punktacja zablokowana", w / 2, h - 28);
            ctxK.fillStyle = "#94a3b8";
            ctxK.font = "11px Inter, sans-serif";
            ctxK.fillText("Skieruj kamerę na tarczę i kliknij '🎯 Auto-Skanuj' lub '📍 Kalibruj 4 punkty'", w / 2, h - 12);
            return;
        }

        const kal = k.kalibracja;
        const H = kal.homografia;

        // 1. Druty radialne (20 linii pajęczyny sizalu od Bulla do podwójnego pierścienia)
        const rBull = CANONICAL_R * 0.0935;
        const rDouble = CANONICAL_R;
        ctxK.lineWidth = 1;
        ctxK.strokeStyle = "rgba(148, 163, 184, 0.35)";
        for (let i = 0; i < 20; i++) {
            const katRad = (-81 + i * 18) * Math.PI / 180;
            const pIn = transformPoint(H, { x: rBull * Math.cos(katRad), y: rBull * Math.sin(katRad) });
            const pOut = transformPoint(H, { x: rDouble * Math.cos(katRad), y: rDouble * Math.sin(katRad) });
            ctxK.beginPath();
            ctxK.moveTo(pIn.x, pIn.y);
            ctxK.lineTo(pOut.x, pOut.y);
            ctxK.stroke();
        }

        // 2. Wypukłe pierścienie perspektywiczne tarczy
        const pierscienie = [
            { r: CANONICAL_R * 0.0374, kolor: "rgba(239, 68, 68, 0.95)", w: 3 },  // D-Bull
            { r: CANONICAL_R * 0.0935, kolor: "rgba(34, 197, 94, 0.9)",  w: 2 },  // Bull
            { r: CANONICAL_R * 0.5706, kolor: "rgba(56, 189, 248, 0.7)", w: 1.5 },// Treble in
            { r: CANONICAL_R * 0.6294, kolor: "rgba(239, 68, 68, 0.9)",  w: 2.5 },// Treble out
            { r: CANONICAL_R * 0.9529, kolor: "rgba(56, 189, 248, 0.7)", w: 1.5 },// Double in
            { r: CANONICAL_R * 1.0,    kolor: "rgba(239, 68, 68, 0.95)", w: 3 },  // Double out
        ];

        const KROKI = 72;
        pierscienie.forEach((p) => {
            ctxK.beginPath();
            for (let i = 0; i <= KROKI; i++) {
                const th = (i * 2 * Math.PI) / KROKI;
                const pt = transformPoint(H, { x: p.r * Math.cos(th), y: p.r * Math.sin(th) });
                if (i === 0) ctxK.moveTo(pt.x, pt.y);
                else ctxK.lineTo(pt.x, pt.y);
            }
            ctxK.closePath();
            ctxK.strokeStyle = p.kolor;
            ctxK.lineWidth = p.w;
            ctxK.stroke();
        });

        // 3. Celownik na środku (Bullseye)
        const bullPt = transformPoint(H, { x: 0, y: 0 });
        const czyBullHover = k._hoverHandle === "bull" || k._dragHandle === "bull" || aktywnyWybranyPunkt === "bull";
        if (czyBullHover) {
            ctxK.beginPath();
            ctxK.arc(bullPt.x, bullPt.y, 14, 0, Math.PI * 2);
            ctxK.fillStyle = "rgba(34, 197, 94, 0.3)";
            ctxK.fill();
            ctxK.strokeStyle = "#22c55e";
            ctxK.lineWidth = 1.5;
            ctxK.stroke();
        }
        ctxK.beginPath();
        ctxK.arc(bullPt.x, bullPt.y, czyBullHover ? 5 : 4, 0, Math.PI * 2);
        ctxK.fillStyle = "#22c55e";
        ctxK.fill();
        ctxK.strokeStyle = "#ffffff";
        ctxK.lineWidth = 1.5;
        ctxK.stroke();

        // 4. 4 interaktywne punkty kontrolne na podwójnym pierścieniu (D20, D6, D3, D11)
        const punktyOrient = [
            { id: "p20", pt: kal.punkty4.p20, kolor: "#ef4444", etykieta: "D20" },
            { id: "p6",  pt: kal.punkty4.p6,  kolor: "#06b6d4", etykieta: "D6"  },
            { id: "p3",  pt: kal.punkty4.p3,  kolor: "#f59e0b", etykieta: "D3"  },
            { id: "p11", pt: kal.punkty4.p11, kolor: "#a855f7", etykieta: "D11" },
        ];

        punktyOrient.forEach(({ id, pt, kolor, etykieta }) => {
            const czyHover = k._hoverHandle === id || k._dragHandle === id || aktywnyWybranyPunkt === id;

            if (czyHover) {
                ctxK.beginPath();
                ctxK.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
                ctxK.fillStyle = `${kolor}44`;
                ctxK.fill();
                ctxK.strokeStyle = kolor;
                ctxK.lineWidth = 1.5;
                ctxK.stroke();
            }

            ctxK.beginPath();
            ctxK.arc(pt.x, pt.y, czyHover ? 8 : 6, 0, Math.PI * 2);
            ctxK.fillStyle = kolor;
            ctxK.fill();
            ctxK.strokeStyle = "#ffffff";
            ctxK.lineWidth = 2;
            ctxK.stroke();

            const badgeOffsetY = id === "p20" ? -16 : id === "p3" ? 16 : 0;
            const badgeOffsetX = id === "p6" ? 22 : id === "p11" ? -22 : 0;
            const bx = pt.x + badgeOffsetX;
            const by = pt.y + badgeOffsetY;

            ctxK.font = "bold 10px Inter, sans-serif";
            ctxK.textAlign = "center";
            ctxK.textBaseline = "middle";
            ctxK.fillStyle = "rgba(15, 23, 42, 0.85)";
            ctxK.fillRect(bx - 13, by - 8, 26, 16);
            ctxK.strokeStyle = kolor;
            ctxK.lineWidth = 1;
            ctxK.strokeRect(bx - 13, by - 8, 26, 16);
            ctxK.fillStyle = "#ffffff";
            ctxK.fillText(etykieta, bx, by);
        });

        // 5. Pasek kroków szybkiej kalibracji 4 punktów
        if (krokKalibracji4Pkt > 0) {
            const tekstyKrokow = [
                "",
                "1/4: Kliknij na zewnętrzny drut DOUBLE 20 (góra)",
                "2/4: Kliknij na zewnętrzny drut DOUBLE 6 (prawo)",
                "3/4: Kliknij na zewnętrzny drut DOUBLE 3 (dół)",
                "4/4: Kliknij na zewnętrzny drut DOUBLE 11 (lewo)"
            ];
            const w = k.canvasEl.width || 640;
            ctxK.fillStyle = "rgba(15, 23, 42, 0.9)";
            ctxK.fillRect(0, 0, w, 36);
            ctxK.fillStyle = "#38bdf8";
            ctxK.font = "bold 13px Inter, sans-serif";
            ctxK.textAlign = "center";
            ctxK.textBaseline = "middle";
            ctxK.fillText(`📍 ${tekstyKrokow[krokKalibracji4Pkt]}`, w / 2, 18);
        }

        // 6. Rysowanie zarejestrowanych lotek z precyzyjnym grotem i wektorem trzonka
        kolejkaLotekKamery.forEach((lotka, lIdx) => {
            let lx = lotka.x, ly = lotka.y;
            let cx = lotka.centroidX, cy = lotka.centroidY;
            if (lotka.kamCoords && lotka.kamCoords[k.id]) {
                lx = lotka.kamCoords[k.id].x;
                ly = lotka.kamCoords[k.id].y;
                if (typeof lotka.kamCoords[k.id].centroidX === "number") {
                    cx = lotka.kamCoords[k.id].centroidX;
                    cy = lotka.kamCoords[k.id].centroidY;
                }
            }
            if (typeof lx === "number" && typeof ly === "number") {
                // Jeśli mamy współrzędne trzonka/piórka, rysujemy wektor orientacji korpusu lotki
                if (typeof cx === "number" && typeof cy === "number" && Math.hypot(lx - cx, ly - cy) > 5) {
                    ctxK.beginPath();
                    ctxK.moveTo(lx, ly);
                    ctxK.lineTo(cx, cy);
                    ctxK.strokeStyle = "rgba(56, 189, 248, 0.75)"; // błękitna linia shaftu/lotki
                    ctxK.lineWidth = 2.5;
                    ctxK.stroke();

                    // Znacznik piórka/środka ciężkości
                    ctxK.beginPath();
                    ctxK.arc(cx, cy, 3, 0, Math.PI * 2);
                    ctxK.fillStyle = "#38bdf8";
                    ctxK.fill();
                }

                // Precyzyjny celownik w miejscu wbicia grota
                ctxK.beginPath();
                ctxK.arc(lx, ly, 6, 0, Math.PI * 2);
                ctxK.fillStyle = "#facc15";
                ctxK.fill();
                ctxK.strokeStyle = "#0f172a";
                ctxK.lineWidth = 2;
                ctxK.stroke();

                ctxK.beginPath();
                ctxK.arc(lx, ly, 2.5, 0, Math.PI * 2);
                ctxK.fillStyle = "#ef4444"; // czerwony punkt kontaktu z sizalem
                ctxK.fill();

                // Krzyżyk na grocie
                ctxK.beginPath();
                ctxK.moveTo(lx - 9, ly);
                ctxK.lineTo(lx + 9, ly);
                ctxK.moveTo(lx, ly - 9);
                ctxK.lineTo(lx, ly + 9);
                ctxK.strokeStyle = "rgba(239, 68, 68, 0.85)";
                ctxK.lineWidth = 1.2;
                ctxK.stroke();

                ctxK.font = "bold 11px Inter, sans-serif";
                const etykieta = `${lIdx + 1}: ${lotka.opis}`;
                const textWidth = ctxK.measureText(etykieta).width;
                ctxK.fillStyle = "rgba(15, 23, 42, 0.85)";
                ctxK.fillRect(lx + 9, ly - 9, textWidth + 8, 18);
                ctxK.strokeStyle = "#facc15";
                ctxK.lineWidth = 1;
                ctxK.strokeRect(lx + 9, ly - 9, textWidth + 8, 18);
                ctxK.fillStyle = "#ffffff";
                ctxK.textAlign = "left";
                ctxK.textBaseline = "middle";
                ctxK.fillText(etykieta, lx + 13, ly);
            }
        });
    }

    function rysujNakladkiWszystkich() {
        kamery.forEach((k, idx) => {
            if (idx < liczbaUzywanychKamer) {
                rysujNakladkeKalibracji(k);
            }
        });
    }

    // =========================================================================
    // 7. PRZELICZANIE POZYCJI NA PUNKTY DARTA (Z TRANSFORMCJĄ HOMOGRAFII)
    // =========================================================================
    function przeliczWspolrzedneNaPunkty(x, y, kal) {
        if (!kal || !kal.skalibrowana) return { punkty: 0, opis: "0" };

        let u, v;
        if (kal.homografiaInv) {
            const canPt = transformPoint(kal.homografiaInv, { x, y });
            u = canPt.x;
            v = canPt.y;
        } else {
            const aspektRatio = kal.aspekt || 1.0;
            u = (x - kal.srodekX) / aspektRatio;
            v = y - kal.srodekY;
        }

        const odleglosc = Math.hypot(u, v);
        const R = CANONICAL_R;

        if (odleglosc > R * 1.04) return { punkty: 0, opis: "0" };
        if (odleglosc <= R * 0.0374) return { punkty: 50, opis: "D-BULL" };
        if (odleglosc <= R * 0.0935) return { punkty: 25, opis: "BULL" };

        let kat = Math.atan2(v, u);
        let katStopnie = (kat * 180) / Math.PI + 90;
        if (katStopnie < 0) katStopnie += 360;
        katStopnie %= 360;

        let index = Math.floor(((katStopnie + 9) % 360) / 18);
        const wartosc = SEKTORY_DARTA[index];

        if (odleglosc >= R * 0.5706 && odleglosc <= R * 0.6294) return { punkty: wartosc * 3, opis: `T${wartosc}` };
        if (odleglosc >= R * 0.9529 && odleglosc <= R * 1.0)   return { punkty: wartosc * 2, opis: `D${wartosc}` };

        return { punkty: wartosc, opis: `${wartosc}` };
    }

    // =========================================================================
    // 8. OBSŁUGA TŁA I KONSENSUSU WIELU KAMER
    // =========================================================================
    function odswiezKlatkiTlaWszystkich() {
        if (!czyOpenCvGotowe || typeof cv === "undefined") return;
        kamery.forEach((k, idx) => {
            if (idx >= liczbaUzywanychKamer || !k.videoEl || !k.videoEl.videoWidth) return;
            let src = null, gray = null;
            try {
                const tempCanvas = document.createElement("canvas");
                tempCanvas.width = k.canvasEl.width || 640;
                tempCanvas.height = k.canvasEl.height || 480;
                tempCanvas.getContext("2d").drawImage(k.videoEl, 0, 0, tempCanvas.width, tempCanvas.height);

                if (k.klatkaTlaMat) {
                    try {
                        k.klatkaTlaMat.delete();
                    } catch (e) {}
                    k.klatkaTlaMat = null;
                }
                src = cv.imread(tempCanvas);
                gray = new cv.Mat();
                cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
                k.klatkaTlaMat = new cv.Mat();
                cv.GaussianBlur(gray, k.klatkaTlaMat, new cv.Size(5, 5), 1.5, 1.5);
            } catch (e) {
                console.warn(`Błąd odświeżania tła dla kamery ${k.id}:`, e);
            } finally {
                if (gray) gray.delete();
                if (src) src.delete();
            }
        });
    }

    function ustalKonsensusRzutu(kandydaci) {
        if (!kandydaci || kandydaci.length === 0) return null;

        const kamCoords = {};
        kandydaci.forEach((k) => {
            kamCoords[k.kameraId] = {
                x: k.x,
                y: k.y,
                centroidX: k.centroidX,
                centroidY: k.centroidY,
                flightX: k.flightX,
                flightY: k.flightY,
            };
        });

        if (kandydaci.length === 1) {
            return {
                punkty: kandydaci[0].punkty,
                opis: kandydaci[0].opis,
                x: kandydaci[0].x,
                y: kandydaci[0].y,
                centroidX: kandydaci[0].centroidX,
                centroidY: kandydaci[0].centroidY,
                flightX: kandydaci[0].flightX,
                flightY: kandydaci[0].flightY,
                kamCoords,
            };
        }

        const glosy = {};
        kandydaci.forEach((k) => {
            glosy[k.opis] = (glosy[k.opis] || 0) + 1;
        });

        let najlepszyOpis = kandydaci[0].opis;
        let maxGlosow = 0;
        for (const opis in glosy) {
            if (glosy[opis] > maxGlosow) {
                maxGlosow = glosy[opis];
                najlepszyOpis = opis;
            }
        }

        const pasujacy = kandydaci.filter((k) => k.opis === najlepszyOpis);
        pasujacy.sort((a, b) => b.pole - a.pole);
        const glowny = pasujacy[0] || kandydaci[0];

        return {
            punkty: glowny.punkty,
            opis: glowny.opis,
            x: glowny.x,
            y: glowny.y,
            centroidX: glowny.centroidX,
            centroidY: glowny.centroidY,
            flightX: glowny.flightX,
            flightY: glowny.flightY,
            kamCoords,
        };
    }

    // -------------------------------------------------------------------------
    // Pomocnik ekstrakcji punktów z konturu OpenCV.js
    // -------------------------------------------------------------------------
    function wyciagnijPunktyKonturu(cnt) {
        const pts = [];
        if (!cnt) return pts;
        const count = cnt.rows || 0;
        if (cnt.data32S && cnt.data32S.length >= count * 2) {
            const d = cnt.data32S;
            for (let i = 0; i < count; i++) {
                pts.push({ x: d[i * 2], y: d[i * 2 + 1] });
            }
        } else if (typeof cnt.intPtr === "function") {
            for (let i = 0; i < count; i++) {
                const ptr = cnt.intPtr(i, 0);
                pts.push({ x: ptr[0], y: ptr[1] });
            }
        }
        return pts;
    }

    // -------------------------------------------------------------------------
    // Algorytm detekcji grota lotki wbitego w tarczę (eliminacja błędu piórka/korpusu)
    // -------------------------------------------------------------------------
    function wykryjGrotLotki(pts, kal) {
        if (!pts || pts.length < 3) {
            if (pts && pts.length > 0) {
                return { x: pts[0].x, y: pts[0].y, centroidX: pts[0].x, centroidY: pts[0].y, flightX: pts[0].x, flightY: pts[0].y, grot: false };
            }
            return null;
        }

        const N = pts.length;
        let sumX = 0, sumY = 0;
        for (let i = 0; i < N; i++) {
            sumX += pts[i].x;
            sumY += pts[i].y;
        }
        const cx = sumX / N;
        const cy = sumY / N;

        // Momenty centralne do wyznaczenia osi wzdłużnej lotki (PCA)
        let sxx = 0, syy = 0, sxy = 0;
        for (let i = 0; i < N; i++) {
            const dx = pts[i].x - cx;
            const dy = pts[i].y - cy;
            sxx += dx * dx;
            syy += dy * dy;
            sxy += dx * dy;
        }

        const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        let vx = Math.cos(theta);
        let vy = Math.sin(theta);

        // Niezmiennik perspektywiczny kamery zamontowanej z lewej strony tarczy:
        // Piórko i korpus wystają przed płaszczyznę sizalu w przestrzeń (Z > 0),
        // przez co z perspektywy lewej kamery piórko ZAWSZE rzutuje się bardziej w lewo (mniejsze x).
        // Grot jest wbity bezpośrednio w sizal (Z = 0) i ZAWSZE znajduje się bardziej po prawej (większe x).
        // Ujednolicamy wektor osi vx tak, aby był skierowany w prawo (w stronę wbitego grota):
        if (vx < 0) {
            vx = -vx;
            vy = -vy;
        }

        let tMin = Infinity, tMax = -Infinity;
        for (let i = 0; i < N; i++) {
            const t = (pts[i].x - cx) * vx + (pts[i].y - cy) * vy;
            if (t < tMin) tMin = t;
            if (t > tMax) tMax = t;
        }

        const L = tMax - tMin;
        if (L < 10) {
            return { x: cx, y: cy, centroidX: cx, centroidY: cy, flightX: cx, flightY: cy, grot: false };
        }

        // Wierzchołek grota (tMax - po prawej stronie osi, styk z sizalem)
        const progGrot = tMax - Math.min(3.5, 0.08 * L);
        let sumGrotX = 0, sumGrotY = 0, numGrot = 0;

        // Piórko lotki (tMin - po lewej stronie osi, w powietrzu)
        const progPiorko = tMin + Math.min(3.5, 0.08 * L);
        let sumPiorkoX = 0, sumPiorkoY = 0, numPiorko = 0;

        for (let i = 0; i < N; i++) {
            const t = (pts[i].x - cx) * vx + (pts[i].y - cy) * vy;
            if (t >= progGrot) {
                sumGrotX += pts[i].x;
                sumGrotY += pts[i].y;
                numGrot++;
            }
            if (t <= progPiorko) {
                sumPiorkoX += pts[i].x;
                sumPiorkoY += pts[i].y;
                numPiorko++;
            }
        }

        let tip = {
            x: numGrot > 0 ? sumGrotX / numGrot : cx + vx * tMax,
            y: numGrot > 0 ? sumGrotY / numGrot : cy + vy * tMax,
        };
        let flight = {
            x: numPiorko > 0 ? sumPiorkoX / numPiorko : cx + vx * tMin,
            y: numPiorko > 0 ? sumPiorkoY / numPiorko : cy + vy * tMin,
        };

        // Walidacja kanoniczna geometrii tarczy
        if (kal && kal.homografiaInv) {
            const canTip = transformPoint(kal.homografiaInv, tip);
            const canFlight = transformPoint(kal.homografiaInv, flight);
            const distTip = Math.hypot(canTip.x, canTip.y);
            const distFlight = Math.hypot(canFlight.x, canFlight.y);

            // Jeśli koniec o większym x wystawałby poza tarczę (> 175mm), a koniec o mniejszym x byłby w tarczy:
            if (distTip > CANONICAL_R * 1.05 && distFlight <= CANONICAL_R * 1.02) {
                const tmp = tip;
                tip = flight;
                flight = tmp;
            }
        }

        return {
            x: tip.x,
            y: tip.y,
            centroidX: cx,
            centroidY: cy,
            flightX: flight.x,
            flightY: flight.y,
            length: L,
            angle: theta,
            grot: true,
        };
    }

    // =========================================================================
    // 9. AUTOMATYCZNA PĘTLA DETEKCJI RZUTÓW
    // =========================================================================
    function wlaczAutoDetekcjeRzutow() {
        if (petlaDetekcjiId) clearInterval(petlaDetekcjiId);
        autoDetekcjaAktywna = true;

        let ostatniRzutCzas = 0;
        let kandydatStabilny = null;
        let liczbaStabilnychRamek = 0;
        const COOLDOWN_PO_RZUCIE_MS = 1200;

        petlaDetekcjiId = setInterval(() => {
            if (!autoDetekcjaAktywna || !czyOpenCvGotowe || typeof cv === "undefined" || kolejkaLotekKamery.length >= 3 || !czyJakakolwiekTarczaWykryta()) return;

            if (Date.now() - ostatniRzutCzas < COOLDOWN_PO_RZUCIE_MS) return;

            const aktywneKamery = kamery.slice(0, liczbaUzywanychKamer).filter((k) => k.klatkaTlaMat && k.videoEl && k.videoEl.videoWidth && k.kalibracja && k.kalibracja.skalibrowana);
            if (aktywneKamery.length === 0) return;

            const kandydaci = [];

            for (const k of aktywneKamery) {
                let obecnaMat = null,
                    obecnaGray = null,
                    obecnaBlurred = null,
                    diff = null,
                    thresh = null,
                    contours = null,
                    hierarchy = null;
                try {
                    const tempCanvas = document.createElement("canvas");
                    tempCanvas.width = k.canvasEl.width || 640;
                    tempCanvas.height = k.canvasEl.height || 480;
                    tempCanvas.getContext("2d").drawImage(k.videoEl, 0, 0, tempCanvas.width, tempCanvas.height);

                    obecnaMat = cv.imread(tempCanvas);
                    obecnaGray = new cv.Mat();
                    obecnaBlurred = new cv.Mat();
                    cv.cvtColor(obecnaMat, obecnaGray, cv.COLOR_RGBA2GRAY);
                    cv.GaussianBlur(obecnaGray, obecnaBlurred, new cv.Size(5, 5), 1.5, 1.5);

                    diff = new cv.Mat();
                    thresh = new cv.Mat();
                    cv.absdiff(k.klatkaTlaMat, obecnaBlurred, diff);
                    // Próg odrzucający drobny szum sensora (35 jest optymalne dla kontrastu lotki na sizalu)
                    cv.threshold(diff, thresh, 35, 255, cv.THRESH_BINARY);

                    contours = new cv.MatVector();
                    hierarchy = new cv.Mat();
                    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);

                    const kal = k.kalibracja;
                    const R = kal.promienD20;
                    const asp = kal.aspekt || 1.0;
                    const srodekX = kal.srodekX;
                    const srodekY = kal.srodekY;

                    const validneKontury = [];
                    let lacznePoleWTarczy = 0;

                    for (let i = 0; i < contours.size(); ++i) {
                        let cnt = contours.get(i);
                        try {
                            let area = cv.contourArea(cnt);
                            // Filtrujemy szum pojedynczych pikseli (< 40 px)
                            if (area >= 40) {
                                let rect = cv.boundingRect(cnt);
                                let pts = wyciagnijPunktyKonturu(cnt);
                                let tipInfo = wykryjGrotLotki(pts, kal);

                                let hitX = rect.x + rect.width / 2;
                                let hitY = rect.y + rect.height / 2;
                                let centroidX = hitX;
                                let centroidY = hitY;
                                let flightX = hitX;
                                let flightY = hitY;

                                if (tipInfo) {
                                    hitX = tipInfo.x;
                                    hitY = tipInfo.y;
                                    centroidX = tipInfo.centroidX;
                                    centroidY = tipInfo.centroidY;
                                    flightX = tipInfo.flightX;
                                    flightY = tipInfo.flightY;
                                }

                                // Sprawdzamy odległość samego grota od środka tarczy
                                let distGrot;
                                if (kal.homografiaInv) {
                                    const can = transformPoint(kal.homografiaInv, { x: hitX, y: hitY });
                                    distGrot = Math.hypot(can.x, can.y);
                                } else {
                                    distGrot = Math.hypot((hitX - srodekX) / asp, hitY - srodekY);
                                }
                                const maxD = kal.homografiaInv ? CANONICAL_R * 1.05 : R * 1.04;
                                // Sprawdzamy czy grot wbił się w tarczę (+ margines na zewnętrzny drut Double)
                                if (distGrot <= maxD) {
                                    lacznePoleWTarczy += area;
                                    validneKontury.push({
                                        area,
                                        rect,
                                        hitX,
                                        hitY,
                                        centroidX,
                                        centroidY,
                                        flightX,
                                        flightY,
                                        dist: distGrot,
                                    });
                                }
                            }
                        } finally {
                            cnt.delete();
                        }
                    }

                    // 1. Zabezpieczenie przed ręką / ciałem wyjmującym lotki (> 8500 px w tarczy)
                    if (lacznePoleWTarczy > 8500) {
                        kandydatStabilny = null;
                        liczbaStabilnychRamek = 0;
                        continue;
                    }

                    if (validneKontury.length > 0) {
                        validneKontury.sort((a, b) => b.area - a.area);
                        const glownyKontur = validneKontury[0];

                        // 2. Zabezpieczenie przed drżeniem kamery / wstrząsem konstrukcji:
                        // Gdy kamera zadrży, linie pajęczyny w różnych ćwiartkach dają kontury oddalone od siebie o >120px
                        const odlegleKontury = validneKontury.filter((c) => {
                            if (c === glownyKontur) return false;
                            let distOdGlownego;
                            if (kal.homografiaInv) {
                                const cCan = transformPoint(kal.homografiaInv, { x: c.hitX, y: c.hitY });
                                const gCan = transformPoint(kal.homografiaInv, { x: glownyKontur.hitX, y: glownyKontur.hitY });
                                distOdGlownego = Math.hypot(cCan.x - gCan.x, cCan.y - gCan.y);
                            } else {
                                distOdGlownego = Math.hypot((c.hitX - glownyKontur.hitX) / asp, c.hitY - glownyKontur.hitY);
                            }
                            return distOdGlownego > 120 && c.area > 70;
                        });

                        // Pojedyncza lotka tworzy 1 skupiony obszar (korpus + cienie). Jeśli są rozrzucone kontury > 2, to wstrząs
                        if (odlegleKontury.length <= 2 && glownyKontur.area >= 45 && glownyKontur.area <= 5000) {
                            const wynik = przeliczWspolrzedneNaPunkty(glownyKontur.hitX, glownyKontur.hitY, k.kalibracja);
                            kandydaci.push({
                                kameraId: k.id,
                                x: glownyKontur.hitX,
                                y: glownyKontur.hitY,
                                centroidX: glownyKontur.centroidX,
                                centroidY: glownyKontur.centroidY,
                                flightX: glownyKontur.flightX,
                                flightY: glownyKontur.flightY,
                                punkty: wynik.punkty,
                                opis: wynik.opis,
                                pole: glownyKontur.area,
                            });
                        }
                    }
                } catch (err) {
                    // Cichy fallback klatki
                } finally {
                    if (obecnaMat) obecnaMat.delete();
                    if (obecnaGray) obecnaGray.delete();
                    if (obecnaBlurred) obecnaBlurred.delete();
                    if (diff) diff.delete();
                    if (thresh) thresh.delete();
                    if (contours) contours.delete();
                    if (hierarchy) hierarchy.delete();
                }
            }

            if (kandydaci.length > 0) {
                const obecny = kandydaci[0];
                // Weryfikacja stabilności przestrzennej: lotka musi pozostać w tym samym punkcie (+- 24px) przez 2 kolejne klatki (~360ms)
                if (kandydatStabilny && Math.hypot(obecny.x - kandydatStabilny.x, obecny.y - kandydatStabilny.y) < 25) {
                    liczbaStabilnychRamek++;
                    if (liczbaStabilnychRamek >= 2) {
                        const wygrany = ustalKonsensusRzutu(kandydaci);
                        if (wygrany) {
                            zarejestrujPunktKamerki(wygrany);
                            ostatniRzutCzas = Date.now();
                            odswiezKlatkiTlaWszystkich();
                        }
                        kandydatStabilny = null;
                        liczbaStabilnychRamek = 0;
                    }
                } else {
                    kandydatStabilny = obecny;
                    liczbaStabilnychRamek = 1;
                }
            } else {
                kandydatStabilny = null;
                liczbaStabilnychRamek = 0;
            }
        }, 180);
    }

    // =========================================================================
    // 10. REJESTRACJA I PODGLĄD PUNKTÓW
    // =========================================================================
    function zarejestrujPunktKamerki(lotka) {
        if (!czyJakakolwiekTarczaWykryta()) {
            wywolajAlert("Tarcza nie została wykryta! Punkty nie są liczone dopóki tarcza nie zostanie znaleziona.");
            return;
        }
        if (kolejkaLotekKamery.length >= 3) return;

        kolejkaLotekKamery.push(lotka);
        rysujNakladkiWszystkich();
        aktualizujPodgladKolejkiKamery();
        wywolajAlert(`Trafienie: ${lotka.opis} (${lotka.punkty} pkt)`);

        if (kolejkaLotekKamery.length === 3) {
            setTimeout(() => {
                if (kolejkaLotekKamery.length === 3 && btnZatwierdzKam) {
                    btnZatwierdzKam.click();
                }
            }, 1200);
        }
    }

    function aktualizujPodgladKolejkiKamery() {
        for (let i = 1; i <= 3; i++) {
            const el = document.getElementById(`kam-lotka-${i}`);
            if (el) el.textContent = kolejkaLotekKamery[i - 1] ? kolejkaLotekKamery[i - 1].opis : "-";
        }
        const suma = kolejkaLotekKamery.reduce((sum, l) => sum + l.punkty, 0);
        const sumEl = document.getElementById("kam-suma-wartosc");
        if (sumEl) sumEl.textContent = suma;
    }

    // =========================================================================
    // 11. PODPIĘCIE ZDARZEŃ DOM
    // =========================================================================
    function podepnijZdarzeniaKamery() {
        let trybUstawianiaSrodka = false;
        let tempPunkty4 = {};
        let blokadaKliknieciaCzas = 0;

        const btnUstawSrodek = document.getElementById("btn-ustaw-srodek-klik");
        const btnKreator4Pkt = document.getElementById("btn-kreator-4pkt");
        const panelFineTune = document.getElementById("panel-fine-tune");
        const sliderPromien = document.getElementById("fine-tune-promien");
        const sliderVal = document.getElementById("fine-tune-promien-val");
        const sliderRotacja = document.getElementById("fine-tune-rotacja");
        const sliderRotacjaVal = document.getElementById("fine-tune-rotacja-val");
        const btnFineTuneReset = document.getElementById("fine-tune-reset");

        function aktualizujPrzyciskAktywnegoPunktu() {
            document.querySelectorAll(".btn-wybierz-punkt").forEach((btn) => {
                const czyTen = btn.dataset.punkt === aktywnyWybranyPunkt;
                if (czyTen) {
                    btn.classList.add("fine-punkt-aktywny");
                    btn.style.background = "#0284c7";
                    btn.style.color = "#ffffff";
                    btn.style.borderColor = "#38bdf8";
                } else {
                    btn.classList.remove("fine-punkt-aktywny");
                    btn.style.background = "#1e293b";
                    btn.style.borderColor = "#334155";
                    const kolorMap = { p20: "#ef4444", p6: "#06b6d4", p3: "#f59e0b", p11: "#a855f7", bull: "#38bdf8" };
                    btn.style.color = kolorMap[btn.dataset.punkt] || "#cbd5e1";
                }
            });
        }

        // 1. KREATOR 4 PUNKTÓW
        if (btnKreator4Pkt) {
            btnKreator4Pkt.addEventListener("click", () => {
                if (krokKalibracji4Pkt > 0) {
                    krokKalibracji4Pkt = 0;
                    btnKreator4Pkt.style.background = "#1e293b";
                    btnKreator4Pkt.style.color = "#38bdf8";
                    btnKreator4Pkt.textContent = "📍 Kalibruj 4 punkty";
                    rysujNakladkiWszystkich();
                } else {
                    krokKalibracji4Pkt = 1;
                    tempPunkty4 = {};
                    trybUstawianiaSrodka = false;
                    if (btnUstawSrodek) {
                        btnUstawSrodek.style.background = "#1e293b";
                        btnUstawSrodek.style.color = "#38bdf8";
                        btnUstawSrodek.textContent = "🎯 Kliknij w Bullseye";
                    }
                    btnKreator4Pkt.style.background = "#059669";
                    btnKreator4Pkt.style.color = "#ffffff";
                    btnKreator4Pkt.textContent = "Krok 1/4: D20 (góra)";
                    wywolajAlert("Kliknij teraz w zewnętrzny drut pola 20 na samej górze tarczy.");
                    rysujNakladkiWszystkich();
                }
            });
        }

        // 2. USTAWIANIE ŚRODKA (BULLSEYE)
        if (btnUstawSrodek) {
            btnUstawSrodek.addEventListener("click", () => {
                trybUstawianiaSrodka = !trybUstawianiaSrodka;
                krokKalibracji4Pkt = 0;
                if (btnKreator4Pkt) {
                    btnKreator4Pkt.style.background = "#1e293b";
                    btnKreator4Pkt.style.color = "#38bdf8";
                    btnKreator4Pkt.textContent = "📍 Kalibruj 4 punkty";
                }
                if (trybUstawianiaSrodka) {
                    btnUstawSrodek.style.background = "#0284c7";
                    btnUstawSrodek.style.color = "#ffffff";
                    btnUstawSrodek.textContent = "👆 Kliknij w Bullseye!";
                    wywolajAlert("Kliknij teraz dokładnie w czerwony środek (Bullseye) na podglądzie kamery.");
                } else {
                    btnUstawSrodek.style.background = "#1e293b";
                    btnUstawSrodek.style.color = "#38bdf8";
                    btnUstawSrodek.textContent = "🎯 Kliknij w Bullseye";
                }
                rysujNakladkiWszystkich();
            });
        }

        // 3. WYBÓR PUNKTU DO MIKRO-KOREKTY
        document.querySelectorAll(".btn-wybierz-punkt").forEach((btn) => {
            btn.addEventListener("click", () => {
                aktywnyWybranyPunkt = btn.dataset.punkt || "bull";
                aktualizujPrzyciskAktywnegoPunktu();
                rysujNakladkiWszystkich();
            });
        });

        // Pomocnik pobierania współrzędnych canvas (mysz i dotyk)
        function pobierzWspolrzedne(e, canvasEl) {
            const rect = canvasEl.getBoundingClientRect();
            const skalaX = canvasEl.width / rect.width;
            const skalaY = canvasEl.height / rect.height;
            let cx = e.clientX, cy = e.clientY;
            if (e.touches && e.touches.length > 0) {
                cx = e.touches[0].clientX;
                cy = e.touches[0].clientY;
            } else if (e.changedTouches && e.changedTouches.length > 0) {
                cx = e.changedTouches[0].clientX;
                cy = e.changedTouches[0].clientY;
            }
            return {
                x: (cx - rect.left) * skalaX,
                y: (cy - rect.top) * skalaY,
            };
        }

        function znajdzUchwyt(pos, kal) {
            if (!kal || !kal.punkty4) return null;
            const PROG = 26;
            const uchwyty = [
                { id: "p20", pt: kal.punkty4.p20 },
                { id: "p6",  pt: kal.punkty4.p6 },
                { id: "p3",  pt: kal.punkty4.p3 },
                { id: "p11", pt: kal.punkty4.p11 },
                { id: "bull", pt: { x: kal.srodekX, y: kal.srodekY } },
            ];
            for (const u of uchwyty) {
                if (Math.hypot(pos.x - u.pt.x, pos.y - u.pt.y) <= PROG) {
                    return u.id;
                }
            }
            return null;
        }

        // Obsługa interakcji na canvas (Przeciąganie 5 uchwytów, Kreator 4 pkt, Klikanie lotek)
        kamery.forEach((k) => {
            if (!k.canvasEl) return;

            const onStart = (e) => {
                if (krokKalibracji4Pkt > 0 || trybUstawianiaSrodka) return;
                const pos = pobierzWspolrzedne(e, k.canvasEl);
                const hid = znajdzUchwyt(pos, k.kalibracja);
                if (hid && k.kalibracja && k.kalibracja.punkty4) {
                    k._dragHandle = hid;
                    k._dragStartX = pos.x;
                    k._dragStartY = pos.y;
                    k._dragOrigPunkty = JSON.parse(JSON.stringify(k.kalibracja.punkty4));
                    k._czyPrzesunieto = false;
                    aktywnyWybranyPunkt = hid;
                    aktualizujPrzyciskAktywnegoPunktu();
                    k.canvasEl.style.cursor = "grabbing";
                    rysujNakladkeKalibracji(k);
                    if (e.cancelable) e.preventDefault();
                }
            };

            const onMove = (e) => {
                const pos = pobierzWspolrzedne(e, k.canvasEl);
                if (k._dragHandle && k.kalibracja && k.kalibracja.punkty4) {
                    const distMoved = Math.hypot(pos.x - k._dragStartX, pos.y - k._dragStartY);
                    if (distMoved > 2) k._czyPrzesunieto = true;

                    if (k._dragHandle === "bull") {
                        const dx = pos.x - k._dragStartX;
                        const dy = pos.y - k._dragStartY;
                        k.kalibracja.punkty4.p20.x = k._dragOrigPunkty.p20.x + dx;
                        k.kalibracja.punkty4.p20.y = k._dragOrigPunkty.p20.y + dy;
                        k.kalibracja.punkty4.p6.x = k._dragOrigPunkty.p6.x + dx;
                        k.kalibracja.punkty4.p6.y = k._dragOrigPunkty.p6.y + dy;
                        k.kalibracja.punkty4.p3.x = k._dragOrigPunkty.p3.x + dx;
                        k.kalibracja.punkty4.p3.y = k._dragOrigPunkty.p3.y + dy;
                        k.kalibracja.punkty4.p11.x = k._dragOrigPunkty.p11.x + dx;
                        k.kalibracja.punkty4.p11.y = k._dragOrigPunkty.p11.y + dy;
                    } else if (k.kalibracja.punkty4[k._dragHandle]) {
                        k.kalibracja.punkty4[k._dragHandle].x = pos.x;
                        k.kalibracja.punkty4[k._dragHandle].y = pos.y;
                    }
                    k.kalibracja._basePunkty4 = null;
                    aktualizujMacierzeKalibracji(k.kalibracja);
                    rysujNakladkeKalibracji(k);
                    if (e.cancelable) e.preventDefault();
                } else if (!krokKalibracji4Pkt && !trybUstawianiaSrodka) {
                    const hid = znajdzUchwyt(pos, k.kalibracja);
                    if (hid !== k._hoverHandle) {
                        k._hoverHandle = hid;
                        k.canvasEl.style.cursor = hid ? "grab" : "default";
                        rysujNakladkeKalibracji(k);
                    }
                }
            };

            const onEnd = () => {
                if (k._dragHandle) {
                    if (k._czyPrzesunieto) {
                        zapiszKalibracjeKamery(k);
                        blokadaKliknieciaCzas = Date.now() + 250;
                        odswiezKlatkiTlaWszystkich();
                    }
                    k._dragHandle = null;
                    k.canvasEl.style.cursor = k._hoverHandle ? "grab" : "default";
                    rysujNakladkeKalibracji(k);
                }
            };

            k.canvasEl.addEventListener("mousedown", onStart);
            k.canvasEl.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onEnd);

            k.canvasEl.addEventListener("touchstart", onStart, { passive: false });
            k.canvasEl.addEventListener("touchmove", onMove, { passive: false });
            window.addEventListener("touchend", onEnd);

            // Zdarzenie click
            k.canvasEl.addEventListener("click", (e) => {
                if (Date.now() < blokadaKliknieciaCzas) return;
                const pos = pobierzWspolrzedne(e, k.canvasEl);
                const klikX = pos.x;
                const klikY = pos.y;

                // TRYB A: Kreator 4 punktów perspektywy
                if (krokKalibracji4Pkt > 0) {
                    if (krokKalibracji4Pkt === 1) {
                        tempPunkty4.p20 = { x: klikX, y: klikY };
                        krokKalibracji4Pkt = 2;
                        if (btnKreator4Pkt) btnKreator4Pkt.textContent = "Krok 2/4: D6 (prawo)";
                        wywolajAlert("Krok 2/4: Kliknij w zewnętrzny drut pola 6 (prawa strona tarczy).");
                        rysujNakladkeKalibracji(k);
                        return;
                    } else if (krokKalibracji4Pkt === 2) {
                        tempPunkty4.p6 = { x: klikX, y: klikY };
                        krokKalibracji4Pkt = 3;
                        if (btnKreator4Pkt) btnKreator4Pkt.textContent = "Krok 3/4: D3 (dół)";
                        wywolajAlert("Krok 3/4: Kliknij w zewnętrzny drut pola 3 (dół tarczy).");
                        rysujNakladkeKalibracji(k);
                        return;
                    } else if (krokKalibracji4Pkt === 3) {
                        tempPunkty4.p3 = { x: klikX, y: klikY };
                        krokKalibracji4Pkt = 4;
                        if (btnKreator4Pkt) btnKreator4Pkt.textContent = "Krok 4/4: D11 (lewo)";
                        wywolajAlert("Krok 4/4: Kliknij w zewnętrzny drut pola 11 (lewa strona tarczy).");
                        rysujNakladkeKalibracji(k);
                        return;
                    } else if (krokKalibracji4Pkt === 4) {
                        tempPunkty4.p11 = { x: klikX, y: klikY };
                        k.kalibracja.punkty4 = { ...tempPunkty4 };
                        k.kalibracja.skalibrowana = true;
                        k.kalibracja._basePunkty4 = null;
                        aktualizujMacierzeKalibracji(k.kalibracja);
                        zapiszKalibracjeKamery(k);

                        krokKalibracji4Pkt = 0;
                        if (btnKreator4Pkt) {
                            btnKreator4Pkt.style.background = "#1e293b";
                            btnKreator4Pkt.style.color = "#38bdf8";
                            btnKreator4Pkt.textContent = "📍 Kalibruj 4 punkty";
                        }
                        pokazPanelFineTune();
                        rysujNakladkiWszystkich();
                        aktualizujStanTarczyUI();
                        odswiezKlatkiTlaWszystkich();
                        wlaczAutoDetekcjeRzutow();
                        wywolajAlert("✓ Kalibracja 4 punktów zakończona sukcesem! Tarcza dopasowana do perspektywy kamery.");
                        return;
                    }
                }

                // TRYB B: Ustawianie środka tarczy (Bullseye)
                if (trybUstawianiaSrodka) {
                    if (!k.kalibracja.punkty4) {
                        const minDim = Math.min(k.canvasEl.width, k.canvasEl.height);
                        const domyslnyR = Math.floor(minDim * 0.36);
                        k.kalibracja.punkty4 = utworzPunktyZOkregu(klikX, klikY, domyslnyR);
                    } else {
                        const dx = klikX - k.kalibracja.srodekX;
                        const dy = klikY - k.kalibracja.srodekY;
                        k.kalibracja.punkty4.p20.x += dx;
                        k.kalibracja.punkty4.p20.y += dy;
                        k.kalibracja.punkty4.p6.x += dx;
                        k.kalibracja.punkty4.p6.y += dy;
                        k.kalibracja.punkty4.p3.x += dx;
                        k.kalibracja.punkty4.p3.y += dy;
                        k.kalibracja.punkty4.p11.x += dx;
                        k.kalibracja.punkty4.p11.y += dy;
                    }
                    k.kalibracja.skalibrowana = true;
                    k.kalibracja._basePunkty4 = null;
                    aktualizujMacierzeKalibracji(k.kalibracja);
                    zapiszKalibracjeKamery(k);

                    trybUstawianiaSrodka = false;
                    if (btnUstawSrodek) {
                        btnUstawSrodek.style.background = "#1e293b";
                        btnUstawSrodek.style.color = "#38bdf8";
                        btnUstawSrodek.textContent = "🎯 Kliknij w Bullseye";
                    }

                    pokazPanelFineTune();
                    rysujNakladkiWszystkich();
                    aktualizujStanTarczyUI();
                    odswiezKlatkiTlaWszystkich();
                    wlaczAutoDetekcjeRzutow();
                    wywolajAlert("Środek tarczy ustawiony! Możesz dopasować punkty D20, D6, D3, D11 przeciągając je myszką.");
                    return;
                }

                // TRYB C: Sprawdzenie czy kliknięto w uchwyt (nie rejestruj rzutu)
                const hid = znajdzUchwyt(pos, k.kalibracja);
                if (hid) {
                    aktywnyWybranyPunkt = hid;
                    aktualizujPrzyciskAktywnegoPunktu();
                    rysujNakladkeKalibracji(k);
                    return;
                }

                // TRYB D: Ręczne oznaczanie lotki na tarczy
                if (!k.kalibracja || !k.kalibracja.skalibrowana) {
                    wywolajAlert(`Kamera ${k.id}: tarcza nie została wykryta! Kliknij '🎯 Auto-Skanuj' lub '📍 Kalibruj 4 punkty'.`);
                    return;
                }

                const wynik = przeliczWspolrzedneNaPunkty(klikX, klikY, k.kalibracja);
                const kamCoords = {};
                kamCoords[k.id] = { x: klikX, y: klikY };

                zarejestrujPunktKamerki({
                    punkty: wynik.punkty,
                    opis: wynik.opis,
                    x: klikX,
                    y: klikY,
                    kamCoords,
                });
                odswiezKlatkiTlaWszystkich();
            });
        });

        // 4. MIKRO-PRZESUNIĘCIE (PRZYCISKI ▲ ▼ ◀ ▶ ORAZ KLAWIATURA)
        function przesunAktywnyPunkt(dx, dy) {
            kamery.forEach((k, idx) => {
                if (idx < liczbaUzywanychKamer && k.kalibracja && k.kalibracja.punkty4) {
                    if (aktywnyWybranyPunkt === "bull") {
                        for (const key of ["p20", "p6", "p3", "p11"]) {
                            k.kalibracja.punkty4[key].x += dx;
                            k.kalibracja.punkty4[key].y += dy;
                        }
                    } else if (k.kalibracja.punkty4[aktywnyWybranyPunkt]) {
                        k.kalibracja.punkty4[aktywnyWybranyPunkt].x += dx;
                        k.kalibracja.punkty4[aktywnyWybranyPunkt].y += dy;
                    }
                    k.kalibracja._basePunkty4 = null;
                    aktualizujMacierzeKalibracji(k.kalibracja);
                    zapiszKalibracjeKamery(k);
                }
            });
            rysujNakladkiWszystkich();
            odswiezKlatkiTlaWszystkich();
        }

        document.querySelectorAll(".fine-tune-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const dx = parseInt(btn.dataset.dx || 0);
                const dy = parseInt(btn.dataset.dy || 0);
                przesunAktywnyPunkt(dx, dy);
            });
        });

        window.addEventListener("keydown", (e) => {
            const klawisze = {
                ArrowUp: { dx: 0, dy: -2 },
                ArrowDown: { dx: 0, dy: 2 },
                ArrowLeft: { dx: -2, dy: 0 },
                ArrowRight: { dx: 2, dy: 0 },
            };
            if (klawisze[e.key] && panelFineTune && panelFineTune.style.display !== "none") {
                if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) return;
                e.preventDefault();
                przesunAktywnyPunkt(klawisze[e.key].dx, klawisze[e.key].dy);
            }
        });

        // 5. SUWAKI SKALI I ROTACJI
        if (sliderPromien) {
            sliderPromien.addEventListener("input", () => {
                const nowaSkala = parseInt(sliderPromien.value);
                if (sliderVal) sliderVal.textContent = nowaSkala;
                kamery.forEach((k, idx) => {
                    if (idx < liczbaUzywanychKamer && k.kalibracja && k.kalibracja.punkty4) {
                        if (!k.kalibracja._basePunkty4) {
                            k.kalibracja._basePunkty4 = JSON.parse(JSON.stringify(k.kalibracja.punkty4));
                        }
                        const ratio = nowaSkala / 100;
                        const sx = k.kalibracja.srodekX;
                        const sy = k.kalibracja.srodekY;
                        for (const key of ["p20", "p6", "p3", "p11"]) {
                            const bp = k.kalibracja._basePunkty4[key];
                            k.kalibracja.punkty4[key].x = sx + (bp.x - sx) * ratio;
                            k.kalibracja.punkty4[key].y = sy + (bp.y - sy) * ratio;
                        }
                        aktualizujMacierzeKalibracji(k.kalibracja);
                        zapiszKalibracjeKamery(k);
                    }
                });
                rysujNakladkiWszystkich();
            });
        }

        if (sliderRotacja) {
            sliderRotacja.addEventListener("input", () => {
                const nowaRot = parseInt(sliderRotacja.value);
                if (sliderRotacjaVal) sliderRotacjaVal.textContent = nowaRot;
                kamery.forEach((k, idx) => {
                    if (idx < liczbaUzywanychKamer && k.kalibracja && k.kalibracja.punkty4) {
                        if (!k.kalibracja._basePunkty4) {
                            k.kalibracja._basePunkty4 = JSON.parse(JSON.stringify(k.kalibracja.punkty4));
                        }
                        const rad = (nowaRot * Math.PI) / 180;
                        const cosA = Math.cos(rad);
                        const sinA = Math.sin(rad);
                        const sx = k.kalibracja.srodekX;
                        const sy = k.kalibracja.srodekY;
                        for (const key of ["p20", "p6", "p3", "p11"]) {
                            const bp = k.kalibracja._basePunkty4[key];
                            const dx = bp.x - sx;
                            const dy = bp.y - sy;
                            k.kalibracja.punkty4[key].x = sx + dx * cosA - dy * sinA;
                            k.kalibracja.punkty4[key].y = sy + dx * sinA + dy * cosA;
                        }
                        aktualizujMacierzeKalibracji(k.kalibracja);
                        zapiszKalibracjeKamery(k);
                    }
                });
                rysujNakladkiWszystkich();
            });
        }

        if (btnFineTuneReset) {
            btnFineTuneReset.addEventListener("click", () => {
                kamery.forEach((k) => {
                    if (k.canvasEl) {
                        const cx = Math.floor(k.canvasEl.width / 2);
                        const cy = Math.floor(k.canvasEl.height / 2);
                        const minDim = Math.min(k.canvasEl.width, k.canvasEl.height);
                        const domyslnyR = Math.floor(minDim * 0.36);
                        k.kalibracja.punkty4 = utworzPunktyZOkregu(cx, cy, domyslnyR);
                        k.kalibracja._basePunkty4 = null;
                        aktualizujMacierzeKalibracji(k.kalibracja);
                        zapiszKalibracjeKamery(k);
                    }
                });
                if (sliderPromien) sliderPromien.value = 100;
                if (sliderVal) sliderVal.textContent = 100;
                if (sliderRotacja) sliderRotacja.value = 0;
                if (sliderRotacjaVal) sliderRotacjaVal.textContent = 0;
                aktywnyWybranyPunkt = "bull";
                aktualizujPrzyciskAktywnegoPunktu();
                rysujNakladkiWszystkich();
                odswiezKlatkiTlaWszystkich();
                wywolajAlert("Zresetowano punkty kalibracji do ustawień domyślnych.");
            });
        }

        // Dodawanie/usuwanie kamer i sterowanie kamerami
        if (btnDodajKamere) {
            btnDodajKamere.addEventListener("click", () => {
                if (liczbaUzywanychKamer < 3) {
                    liczbaUzywanychKamer++;
                    localStorage.setItem("sd_liczba_kamer", liczbaUzywanychKamer);
                    aktualizujWidokLiczbyKamer();
                    wypelnijListeKamer();

                    const czyDziala = kamery.some((k) => k.strumien !== null);
                    if (czyDziala) {
                        uruchomKamere();
                    }
                    wywolajAlert(`Dodano kamerę ${liczbaUzywanychKamer}! Wybierz urządzenie USB i kliknij Auto-Skan.`);
                }
            });
        }

        document.querySelectorAll(".btn-usun-kamere").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (liczbaUzywanychKamer > 1) {
                    liczbaUzywanychKamer = Math.max(1, liczbaUzywanychKamer - 1);
                    localStorage.setItem("sd_liczba_kamer", liczbaUzywanychKamer);
                    aktualizujWidokLiczbyKamer();

                    const czyDziala = kamery.some((k) => k.strumien !== null);
                    if (czyDziala) {
                        uruchomKamere();
                    }
                    wywolajAlert(`Usunięto kamerę. Liczba aktywnych kamer: ${liczbaUzywanychKamer}.`);
                }
            });
        });

        kamery.forEach((k) => {
            if (k.selectEl) {
                k.selectEl.addEventListener("change", () => {
                    if (k.strumien) {
                        uruchomKamere();
                    }
                });
            }
        });

        if (btnStartKam) {
            btnStartKam.addEventListener("click", () => {
                const czyDziala = kamery.some((k) => k.strumien !== null);
                if (czyDziala) {
                    wylaczKamere();
                    wywolajAlert(liczbaUzywanychKamer > 1 ? "Kamery zostały wyłączone." : "Kamera została wyłączona.");
                } else {
                    zaladujOpenCvNaZadanie();
                    uruchomKamere();
                }
            });
        }

        if (btnAutoSkan) btnAutoSkan.addEventListener("click", automatycznySkanTarczy);
        if (btnResetTla) {
            btnResetTla.addEventListener("click", () => {
                kolejkaLotekKamery = [];
                aktualizujPodgladKolejkiKamery();
                odswiezKlatkiTlaWszystkich();
                rysujNakladkiWszystkich();
                wywolajAlert("Zaktualizowano tło tarczy. Gotowe do kolejnych rzutów!");
            });
        }

        const cofnijOstatniaLotke = () => {
            if (kolejkaLotekKamery.length > 0) {
                kolejkaLotekKamery.pop();
                rysujNakladkiWszystkich();
                aktualizujPodgladKolejkiKamery();
                odswiezKlatkiTlaWszystkich();
            } else {
                const btnCofnijGlowny = document.getElementById("btn-cofnij-rzut");
                if (btnCofnijGlowny) btnCofnijGlowny.click();
            }
        };

        const btnCofnijLotke = document.getElementById("kam-cofnij-lotke");
        if (btnCofnijLotke) {
            btnCofnijLotke.addEventListener("click", cofnijOstatniaLotke);
        }

        const btnKamCofnijRzut = document.getElementById("btn-kam-cofnij-rzut");
        if (btnKamCofnijRzut) {
            btnKamCofnijRzut.addEventListener("click", cofnijOstatniaLotke);
        }

        if (btnZatwierdzKam) {
            btnZatwierdzKam.addEventListener("click", () => {
                if (!czyJakakolwiekTarczaWykryta()) {
                    wywolajAlert("Tarcza nie została wykryta - brak możliwości zatwierdzenia punktów!");
                    return;
                }
                if (kolejkaLotekKamery.length === 0) return;

                const suma = kolejkaLotekKamery.reduce((sum, l) => sum + l.punkty, 0);

                if (typeof window.przetwarzajRzutMeczu === "function") {
                    window.przetwarzajRzutMeczu(suma, suma.toString(), kolejkaLotekKamery.length, [...kolejkaLotekKamery]);
                }

                kolejkaLotekKamery = [];
                aktualizujPodgladKolejkiKamery();
                rysujNakladkiWszystkich();
                odswiezKlatkiTlaWszystkich();
            });
        }

        function pokazPanelFineTune() {
            if (panelFineTune) panelFineTune.style.display = "flex";
            aktualizujPrzyciskAktywnegoPunktu();
        }

        // Pokaż panel jeśli tarcza jest już skalibrowana
        if (kamery[0].kalibracja && kamery[0].kalibracja.skalibrowana) {
            pokazPanelFineTune();
        }

        aktualizujWidokLiczbyKamer();

        window._pokazPanelFineTune = pokazPanelFineTune;
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", podepnijZdarzeniaKamery);
    } else {
        podepnijZdarzeniaKamery();
    }

    // Bezpieczne wyłączanie kamer przy opuszczaniu widoku
    window.addEventListener("beforeunload", wylaczKamere);
    window.addEventListener("pagehide", wylaczKamere);

    // =========================================================================
    // EXPORT DO WINDOW DLA GŁÓWNEGO PLIKU GRY
    // =========================================================================
    window.wylaczKamere = wylaczKamere;
    window.wypelnijListeKamer = wypelnijListeKamer;
    window.zaladujOpenCvNaZadanie = zaladujOpenCvNaZadanie;
    window.aktualizujWidokLiczbyKamer = aktualizujWidokLiczbyKamer;
    window.automatycznySkanTarczy = automatycznySkanTarczy;
    window.odswiezKlatkiTlaWszystkich = odswiezKlatkiTlaWszystkich;
})();

