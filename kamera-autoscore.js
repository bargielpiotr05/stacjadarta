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
            kalibracja: JSON.parse(localStorage.getItem("sd_dart_kalibracja_1") || "null") || JSON.parse(localStorage.getItem("sd_dart_kalibracja") || "null") || {
                srodekX: 0,
                srodekY: 0,
                promienD20: 0,
                katRotacji: 0,
                skalibrowana: false,
            },
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
            kalibracja: JSON.parse(localStorage.getItem("sd_dart_kalibracja_2") || "null") || {
                srodekX: 0,
                srodekY: 0,
                promienD20: 0,
                katRotacji: 0,
                skalibrowana: false,
            },
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
            kalibracja: JSON.parse(localStorage.getItem("sd_dart_kalibracja_3") || "null") || {
                srodekX: 0,
                srodekY: 0,
                promienD20: 0,
                katRotacji: 0,
                skalibrowana: false,
            },
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
                        if (k.canvasEl) {
                            k.canvasEl.width = k.videoEl.videoWidth || 640;
                            k.canvasEl.height = k.videoEl.videoHeight || 480;
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
        let src = null,
            gray = null,
            circles = null;
        try {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = k.canvasEl.width || 640;
            tempCanvas.height = k.canvasEl.height || 480;
            tempCanvas.getContext("2d").drawImage(k.videoEl, 0, 0);

            src = cv.imread(tempCanvas);
            gray = new cv.Mat();
            circles = new cv.Mat();

            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            cv.GaussianBlur(gray, gray, new cv.Size(9, 9), 2, 2);

            const minPromien = Math.floor(Math.min(src.rows, src.cols) * 0.18);
            const maxPromien = Math.floor(Math.min(src.rows, src.cols) * 0.52);
            cv.HoughCircles(gray, circles, cv.HOUGH_GRADIENT, 1.2, gray.rows / 4, 90, 42, minPromien, maxPromien);

            if (circles.cols > 0) {
                let bestIdx = 0;
                let minDistToCenter = Infinity;
                const centerX = src.cols / 2;
                const centerY = src.rows / 2;

                for (let i = 0; i < circles.cols; ++i) {
                    const cx = circles.data32F[i * 3];
                    const cy = circles.data32F[i * 3 + 1];
                    const dist = Math.hypot(cx - centerX, cy - centerY);
                    if (dist < minDistToCenter) {
                        minDistToCenter = dist;
                        bestIdx = i;
                    }
                }

                k.kalibracja = {
                    srodekX: circles.data32F[bestIdx * 3],
                    srodekY: circles.data32F[bestIdx * 3 + 1],
                    promienD20: circles.data32F[bestIdx * 3 + 2],
                    katRotacji: 0,
                    skalibrowana: true,
                };

                localStorage.setItem(`sd_dart_kalibracja_${k.id}`, JSON.stringify(k.kalibracja));
                if (k.id === 1) localStorage.setItem("sd_dart_kalibracja", JSON.stringify(k.kalibracja));
                rysujNakladkeKalibracji(k);
                return true;
            }

            k.kalibracja = {
                srodekX: 0,
                srodekY: 0,
                promienD20: 0,
                katRotacji: 0,
                skalibrowana: false,
            };
            localStorage.removeItem(`sd_dart_kalibracja_${k.id}`);
            if (k.id === 1) localStorage.removeItem("sd_dart_kalibracja");
            rysujNakladkeKalibracji(k);
            return false;
        } catch (e) {
            console.warn(`Błąd HoughCircles dla kamery ${k.id}:`, e);
            k.kalibracja = { srodekX: 0, srodekY: 0, promienD20: 0, katRotacji: 0, skalibrowana: false };
            rysujNakladkeKalibracji(k);
            return false;
        } finally {
            if (src) src.delete();
            if (gray) gray.delete();
            if (circles) circles.delete();
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
                wywolajAlert(liczbaUzywanychKamer > 1 ? `Skalibrowano ${skalibrowanoIle}/${liczbaUzywanychKamer} kamer!` : "Tarcza została automatycznie zlokalizowana!");
                odswiezKlatkiTlaWszystkich();
                wlaczAutoDetekcjeRzutow();
            } else {
                wywolajAlert("Nie znaleziono tarczy. Punktacja jest zablokowana do czasu wykrycia tarczy.");
            }
            aktualizujStanTarczyUI();
        }, 300);
    }

    // =========================================================================
    // 6. RYSOWANIE NAKŁADEK KALIBRACJI I LOTEK
    // =========================================================================
    function rysujNakladkeKalibracji(k) {
        if (!k || !k.canvasEl) return;
        const ctxK = k.canvasEl.getContext("2d");
        if (!ctxK) return;

        ctxK.clearRect(0, 0, k.canvasEl.width, k.canvasEl.height);
        if (!k.kalibracja || !k.kalibracja.skalibrowana) {
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
            ctxK.fillText("Skieruj kamerę na tarczę i kliknij '🎯 Auto-Skanuj'", w / 2, h - 12);
            return;
        }

        const { srodekX, srodekY, promienD20 } = k.kalibracja;

        const pierscienie = [
            { r: promienD20 * 0.037, kolor: "rgba(239, 68, 68, 0.8)", w: 3 }, // D-Bull
            { r: promienD20 * 0.093, kolor: "rgba(34, 197, 94, 0.7)", w: 2 }, // Bull
            { r: promienD20 * 0.57, kolor: "rgba(56, 189, 248, 0.5)", w: 2 }, // Triple in
            { r: promienD20 * 0.629, kolor: "rgba(239, 68, 68, 0.7)", w: 2 }, // Triple out
            { r: promienD20 * 0.952, kolor: "rgba(56, 189, 248, 0.5)", w: 2 }, // Double in
            { r: promienD20 * 1.0, kolor: "rgba(239, 68, 68, 0.8)", w: 3 }, // Double out
        ];

        pierscienie.forEach((p) => {
            ctxK.beginPath();
            ctxK.arc(srodekX, srodekY, p.r, 0, Math.PI * 2);
            ctxK.strokeStyle = p.kolor;
            ctxK.lineWidth = p.w;
            ctxK.stroke();
        });

        // Celownik na środku
        ctxK.fillStyle = "#ef4444";
        ctxK.beginPath();
        ctxK.arc(srodekX, srodekY, 3, 0, Math.PI * 2);
        ctxK.fill();

        // Rysowanie zarejestrowanych lotek
        kolejkaLotekKamery.forEach((lotka) => {
            let lx = lotka.x,
                ly = lotka.y;
            if (lotka.kamCoords && lotka.kamCoords[k.id]) {
                lx = lotka.kamCoords[k.id].x;
                ly = lotka.kamCoords[k.id].y;
            }
            if (typeof lx === "number" && typeof ly === "number") {
                ctxK.beginPath();
                ctxK.arc(lx, ly, 7, 0, Math.PI * 2);
                ctxK.fillStyle = "#facc15";
                ctxK.fill();
                ctxK.strokeStyle = "#000";
                ctxK.lineWidth = 2;
                ctxK.stroke();
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
    // 7. PRZELICZANIE POZYCJI NA PUNKTY DARTA
    // =========================================================================
    function przeliczWspolrzedneNaPunkty(x, y, kal) {
        if (!kal || !kal.skalibrowana) return { punkty: 0, opis: "0" };

        const dx = x - kal.srodekX;
        const dy = y - kal.srodekY;
        const odleglosc = Math.hypot(dx, dy);
        const R = kal.promienD20;

        if (odleglosc > R * 1.03) return { punkty: 0, opis: "0" };
        if (odleglosc <= R * 0.037) return { punkty: 50, opis: "D-BULL" };
        if (odleglosc <= R * 0.093) return { punkty: 25, opis: "BULL" };

        let kat = Math.atan2(dy, dx) - (kal.katRotacji || 0);
        let katStopnie = (kat * 180) / Math.PI + 90;
        if (katStopnie < 0) katStopnie += 360;
        katStopnie %= 360;

        let index = Math.floor(((katStopnie + 9) % 360) / 18);
        const wartosc = SEKTORY_DARTA[index];

        if (odleglosc >= R * 0.57 && odleglosc <= R * 0.629) {
            return { punkty: wartosc * 3, opis: `T${wartosc}` };
        }
        if (odleglosc >= R * 0.952 && odleglosc <= R * 1.0) {
            return { punkty: wartosc * 2, opis: `D${wartosc}` };
        }

        return { punkty: wartosc, opis: `${wartosc}` };
    }

    // =========================================================================
    // 8. OBSŁUGA TŁA I KONSENSUSU WIELU KAMER
    // =========================================================================
    function odswiezKlatkiTlaWszystkich() {
        if (!czyOpenCvGotowe || typeof cv === "undefined") return;
        kamery.forEach((k, idx) => {
            if (idx >= liczbaUzywanychKamer || !k.videoEl || !k.videoEl.videoWidth) return;
            let src = null;
            try {
                const tempCanvas = document.createElement("canvas");
                tempCanvas.width = k.canvasEl.width || 640;
                tempCanvas.height = k.canvasEl.height || 480;
                tempCanvas.getContext("2d").drawImage(k.videoEl, 0, 0);

                if (k.klatkaTlaMat) {
                    try {
                        k.klatkaTlaMat.delete();
                    } catch (e) {}
                    k.klatkaTlaMat = null;
                }
                src = cv.imread(tempCanvas);
                k.klatkaTlaMat = new cv.Mat();
                cv.cvtColor(src, k.klatkaTlaMat, cv.COLOR_RGBA2GRAY);
            } catch (e) {
                console.warn(`Błąd odświeżania tła dla kamery ${k.id}:`, e);
            } finally {
                if (src) src.delete();
            }
        });
    }

    function ustalKonsensusRzutu(kandydaci) {
        if (!kandydaci || kandydaci.length === 0) return null;

        const kamCoords = {};
        kandydaci.forEach((k) => {
            kamCoords[k.kameraId] = { x: k.x, y: k.y };
        });

        if (kandydaci.length === 1) {
            return {
                punkty: kandydaci[0].punkty,
                opis: kandydaci[0].opis,
                x: kandydaci[0].x,
                y: kandydaci[0].y,
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
            kamCoords,
        };
    }

    // =========================================================================
    // 9. AUTOMATYCZNA PĘTLA DETEKCJI RZUTÓW
    // =========================================================================
    function wlaczAutoDetekcjeRzutow() {
        if (petlaDetekcjiId) clearInterval(petlaDetekcjiId);
        autoDetekcjaAktywna = true;

        let czyWykrytoRuchGlobal = false;
        let czasRuchuGlobal = 0;

        petlaDetekcjiId = setInterval(() => {
            if (!autoDetekcjaAktywna || !czyOpenCvGotowe || typeof cv === "undefined" || kolejkaLotekKamery.length >= 3 || !czyJakakolwiekTarczaWykryta()) return;

            const aktywneKamery = kamery.slice(0, liczbaUzywanychKamer).filter((k) => k.klatkaTlaMat && k.videoEl && k.videoEl.videoWidth && k.kalibracja && k.kalibracja.skalibrowana);
            if (aktywneKamery.length === 0) return;

            const kandydaci = [];

            for (const k of aktywneKamery) {
                let obecnaMat = null,
                    obecnaGray = null,
                    diff = null,
                    thresh = null,
                    contours = null,
                    hierarchy = null;
                try {
                    const tempCanvas = document.createElement("canvas");
                    tempCanvas.width = k.canvasEl.width || 640;
                    tempCanvas.height = k.canvasEl.height || 480;
                    tempCanvas.getContext("2d").drawImage(k.videoEl, 0, 0);

                    obecnaMat = cv.imread(tempCanvas);
                    obecnaGray = new cv.Mat();
                    cv.cvtColor(obecnaMat, obecnaGray, cv.COLOR_RGBA2GRAY);

                    diff = new cv.Mat();
                    thresh = new cv.Mat();
                    cv.absdiff(k.klatkaTlaMat, obecnaGray, diff);
                    cv.threshold(diff, thresh, 38, 255, cv.THRESH_BINARY);

                    contours = new cv.MatVector();
                    hierarchy = new cv.Mat();
                    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

                    let maxContourArea = 0;
                    let bestRect = null;

                    for (let i = 0; i < contours.size(); ++i) {
                        let cnt = contours.get(i);
                        try {
                            let area = cv.contourArea(cnt);
                            if (area > maxContourArea && area > 60 && area < 4000) {
                                let rect = cv.boundingRect(cnt);
                                let dist = Math.hypot(rect.x + rect.width / 2 - k.kalibracja.srodekX, rect.y + rect.height / 2 - k.kalibracja.srodekY);
                                if (dist < k.kalibracja.promienD20 * 1.05) {
                                    maxContourArea = area;
                                    bestRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                                }
                            }
                        } finally {
                            cnt.delete();
                        }
                    }

                    if (bestRect) {
                        const hitX = bestRect.x + bestRect.width / 2;
                        const hitY = bestRect.y + bestRect.height / 2;
                        const wynik = przeliczWspolrzedneNaPunkty(hitX, hitY, k.kalibracja);
                        kandydaci.push({
                            kameraId: k.id,
                            x: hitX,
                            y: hitY,
                            punkty: wynik.punkty,
                            opis: wynik.opis,
                            pole: maxContourArea,
                        });
                    }
                } catch (err) {
                    // Cichy fallback klatki
                } finally {
                    if (obecnaMat) obecnaMat.delete();
                    if (obecnaGray) obecnaGray.delete();
                    if (diff) diff.delete();
                    if (thresh) thresh.delete();
                    if (contours) contours.delete();
                    if (hierarchy) hierarchy.delete();
                }
            }

            if (kandydaci.length > 0) {
                const now = Date.now();
                if (!czyWykrytoRuchGlobal) {
                    czyWykrytoRuchGlobal = true;
                    czasRuchuGlobal = now;
                } else if (now - czasRuchuGlobal > 450) {
                    const wygrany = ustalKonsensusRzutu(kandydaci);
                    if (wygrany) {
                        zarejestrujPunktKamerki(wygrany);
                        odswiezKlatkiTlaWszystkich();
                    }
                    czyWykrytoRuchGlobal = false;
                }
            } else {
                czyWykrytoRuchGlobal = false;
            }
        }, 200);
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
        // Manualne kliknięcie na canvas
        kamery.forEach((k) => {
            if (!k.canvasEl) return;
            k.canvasEl.addEventListener("click", (e) => {
                if (!k.kalibracja || !k.kalibracja.skalibrowana) {
                    wywolajAlert(`Kamera ${k.id}: tarcza nie została wykryta! Nakieruj kamerę i kliknij '🎯 Auto-Skanuj', aby włączyć punktację.`);
                    return;
                }
                const rect = k.canvasEl.getBoundingClientRect();
                const skalaX = k.canvasEl.width / rect.width;
                const skalaY = k.canvasEl.height / rect.height;
                const klikX = (e.clientX - rect.left) * skalaX;
                const klikY = (e.clientY - rect.top) * skalaY;

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
                odswiezKlatkiTlaWszystkich();
                wywolajAlert("Zaktualizowano tło tarczy.");
            });
        }

        const btnCofnijLotke = document.getElementById("kam-cofnij-lotke");
        if (btnCofnijLotke) {
            btnCofnijLotke.addEventListener("click", () => {
                kolejkaLotekKamery.pop();
                rysujNakladkiWszystkich();
                aktualizujPodgladKolejkiKamery();
                odswiezKlatkiTlaWszystkich();
            });
        }

        if (btnZatwierdzKam) {
            btnZatwierdzKam.addEventListener("click", () => {
                if (!czyJakakolwiekTarczaWykryta()) {
                    wywolajAlert("Tarcza nie została wykryta - brak możliwości zatwierdzenia punktów!");
                    return;
                }
                if (kolejkaLotekKamery.length === 0) return;

                const suma = kolejkaLotekKamery.reduce((sum, l) => sum + l.punkty, 0);

                // Integracja z głównym silnikiem gry w klasyczna.html
                if (typeof window.przetwarzajRzutMeczu === "function") {
                    window.przetwarzajRzutMeczu(suma, suma.toString(), kolejkaLotekKamery.length, [...kolejkaLotekKamery]);
                }

                kolejkaLotekKamery = [];
                aktualizujPodgladKolejkiKamery();
                rysujNakladkiWszystkich();
                odswiezKlatkiTlaWszystkich();
            });
        }

        // Inicjalizacja widoku
        aktualizujWidokLiczbyKamer();
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
})();

