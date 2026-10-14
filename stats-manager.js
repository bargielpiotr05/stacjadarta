// ==============================================================================
// STATS MANAGER - STACJA DART
// Zarządzanie i zapisywanie statystyk profilu dla wszystkich trybów gry
// ==============================================================================

(function(window) {
    const StatsManager = {
        // Wszystkie sektory podwójne od 1 do 20 oraz 25 (DBull)
        DOUBLES_SECTORS: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","25"],

        async getClient() {
            let supa = window.supabaseKlient || window.supabaseClient;
            if (supa) return supa;
            for (let i = 0; i < 25; i++) {
                await new Promise((r) => setTimeout(r, 100));
                supa = window.supabaseKlient || window.supabaseClient;
                if (supa) return supa;
            }
            if (typeof inicjalizujSupabaseGlobalnie === "function") {
                return await inicjalizujSupabaseGlobalnie();
            }
            return null;
        },

        // Pobiera dotychczasowe statystyki trybów gracza
        async pobierzStatystykiTrybow(graczId) {
            const supaClient = await this.getClient();
            if (!supaClient || !graczId) return null;

            try {
                const { data, error } = await supaClient
                    .from("profiles")
                    .select("stats_by_game")
                    .eq("id", graczId)
                    .maybeSingle();

                if (error) {
                    console.warn("Błąd pobierania stats_by_game:", error);
                    return null;
                }
                return data?.stats_by_game || {};
            } catch (err) {
                console.warn("Wyjątek podczas pobierania stats_by_game:", err);
                return null;
            }
        },

        // Bezpieczny zapis zaktualizowanego trybu przez funkcję RPC lub direct update
        async zapiszStatystykiTrybu(graczId, trybNazwa, daneTrybu) {
            const supaClient = await this.getClient();
            if (!supaClient || !graczId) return false;

            try {
                // 1. Próba przez dedykowaną funkcję RPC z uprawnieniami SECURITY DEFINER
                const { data, error } = await supaClient.rpc("zaktualizuj_statystyki_trybu", {
                    p_gracz_id: graczId,
                    p_tryb: trybNazwa,
                    p_dane_trybu: daneTrybu
                });

                if (!error) {
                    console.log(`Zapisano statystyki trybu ${trybNazwa} przez RPC dla ${graczId}`);
                    return true;
                }

                // 2. Fallback: Pobierz dotychczasowe i zrób bezpośredni update
                console.warn("RPC zaktualizuj_statystyki_trybu zwróciło błąd, próba bezpośredniego UPDATE:", error);
                const obecne = (await this.pobierzStatystykiTrybow(graczId)) || {};
                obecne[trybNazwa] = daneTrybu;

                const { error: updErr } = await supaClient
                    .from("profiles")
                    .update({ 
                        stats_by_game: obecne,
                        zaktualizowano: new Date().toISOString()
                    })
                    .eq("id", graczId);

                if (!updErr) {
                    console.log(`Zapisano statystyki trybu ${trybNazwa} przez bezpośredni update dla ${graczId}`);
                    return true;
                }
                console.error("Błąd zapisu bezpośredniego stats_by_game:", updErr);
                return false;
            } catch (e) {
                console.error("Wyjątek podczas zapisu statystyk trybu:", e);
                return false;
            }
        },

        // ======================================================================
        // AKTUALIZACJA: TRYB DOUBLES (z podziałem na każdy sektor D1-D20 i DBull)
        // ======================================================================
        // daneMeczu: {
        //   czyWygrana: boolean,
        //   rzutySuma: number,
        //   trafieniaSuma: number,
        //   rzutyNaLiczbe: { "1": { rzuty: 3, trafienia: 1 }, "20": ... }
        // }
        async zaktualizujDoubles(graczId, daneMeczu) {
            const stats = (await this.pobierzStatystykiTrybow(graczId)) || {};
            const d = stats.doubles || {
                mecze: 0,
                wygrane: 0,
                suma_rzutow: 0,
                suma_trafien: 0,
                skutecznosc: 0,
                sektory: {},
                historia_meczow: []
            };

            const mecze = (d.mecze || 0) + 1;
            const wygrane = daneMeczu.czyWygrana ? (d.wygrane || 0) + 1 : (d.wygrane || 0);
            const sumaRzutow = (d.suma_rzutow || 0) + (daneMeczu.rzutySuma || 0);
            const sumaTrafien = (d.suma_trafien || 0) + (daneMeczu.trafieniaSuma || 0);
            const ogolnaSkutecznosc = sumaRzutow > 0 ? parseFloat(((sumaTrafien / sumaRzutow) * 100).toFixed(1)) : 0;

            const sektory = { ...(d.sektory || {}) };

            // Zaktualizuj każdy sektor z meczu
            if (daneMeczu.rzutyNaLiczbe) {
                Object.keys(daneMeczu.rzutyNaLiczbe).forEach((cel) => {
                    const klucz = String(cel);
                    const dotychczas = sektory[klucz] || { rzuty: 0, trafienia: 0 };
                    const zGry = daneMeczu.rzutyNaLiczbe[cel] || { rzuty: 0, trafienia: 0 };

                    const noweRzuty = dotychczas.rzuty + (zGry.rzuty || 0);
                    const noweTrafienia = dotychczas.trafienia + (zGry.trafienia || 0);
                    const proc = noweRzuty > 0 ? parseFloat(((noweTrafienia / noweRzuty) * 100).toFixed(1)) : 0;

                    sektory[klucz] = {
                        rzuty: noweRzuty,
                        trafienia: noweTrafienia,
                        procent: proc
                    };
                });
            }

            // Dodaj wpis o rozegranym meczu do historii formy
            const dzis = new Date();
            const dataStr = `${String(dzis.getDate()).padStart(2, "0")}.${String(dzis.getMonth() + 1).padStart(2, "0")}`;
            const meczRzuty = Number(daneMeczu.rzutySuma) || 0;
            const meczTraf = Number(daneMeczu.trafieniaSuma) || 0;
            const meczProc = meczRzuty > 0 ? parseFloat(((meczTraf / meczRzuty) * 100).toFixed(1)) : 0;

            const historia = Array.isArray(d.historia_meczow) ? [...d.historia_meczow] : [];
            historia.push({
                data: daneMeczu.data || dataStr,
                skutecznosc: meczProc,
                trafienia: meczTraf,
                rzuty: meczRzuty,
                rywal: daneMeczu.rywal || "Trening D1-D20",
                wynik: daneMeczu.czyWygrana ? "W" : "P"
            });
            if (historia.length > 50) historia.shift();

            const nowyStan = {
                ...d,
                mecze,
                wygrane,
                suma_rzutow: sumaRzutow,
                suma_trafien: sumaTrafien,
                skutecznosc: ogolnaSkutecznosc,
                sektory,
                historia_meczow: historia
            };

            return await this.zapiszStatystykiTrybu(graczId, "doubles", nowyStan);
        },

        // ======================================================================
        // AKTUALIZACJA: TRYB SHANGHAI
        // ======================================================================
        async zaktualizujShanghai(graczId, daneMeczu) {
            const stats = (await this.pobierzStatystykiTrybow(graczId)) || {};
            const s = stats.shanghai || {
                mecze: 0,
                wygrane: 0,
                rekord_punktow: 0,
                suma_punktow: 0,
                srednia_na_gre: 0,
                liczba_shanghai: 0,
                skutecznosc: 0,
                suma_rzutow: 0,
                suma_trafien: 0,
                rundy: {},
                historia_meczow: []
            };

            const mecze = (s.mecze || 0) + 1;
            const wygrane = daneMeczu.czyWygrana ? (s.wygrane || 0) + 1 : (s.wygrane || 0);
            const zdobytePunkty = daneMeczu.punkty || 0;
            const rekord = Math.max(s.rekord_punktow || 0, zdobytePunkty);
            const sumaPunktow = (s.suma_punktow || 0) + zdobytePunkty;
            const shanghaiTrafienia = (s.liczba_shanghai || 0) + (daneMeczu.czyZrobilShanghai ? 1 : 0);
            const noweRzuty = (s.suma_rzutow || 0) + (daneMeczu.rzuty || 0);
            const noweTrafienia = (s.suma_trafien || 0) + (daneMeczu.trafienia || 0);
            const skutecznosc = noweRzuty > 0 ? parseFloat(((noweTrafienia / noweRzuty) * 100).toFixed(1)) : (s.skutecznosc || 0);

            // Dodaj wpis meczu do historii formy Shanghai
            const dzis = new Date();
            const dataStr = `${String(dzis.getDate()).padStart(2, "0")}.${String(dzis.getMonth() + 1).padStart(2, "0")}`;
            const liczbaRundMeczu = daneMeczu.liczbaRund || (daneMeczu.rundy && Object.keys(daneMeczu.rundy).length > 0 ? Object.keys(daneMeczu.rundy).length : 7);
            const sredniaGry = parseFloat((zdobytePunkty / Math.max(1, liczbaRundMeczu)).toFixed(1));
            const meczProc = (daneMeczu.rzuty || 0) > 0 ? parseFloat((((daneMeczu.trafienia || 0) / daneMeczu.rzuty) * 100).toFixed(1)) : (daneMeczu.czyZrobilShanghai ? 100 : 0);

            const historia = Array.isArray(s.historia_meczow) ? [...s.historia_meczow] : [];
            historia.push({
                data: daneMeczu.data || dataStr,
                srednia: sredniaGry,
                punkty: zdobytePunkty,
                skutecznosc: meczProc,
                rzuty: daneMeczu.rzuty || 0,
                trafienia: daneMeczu.trafienia || 0,
                rundyLiczba: liczbaRundMeczu,
                shanghai: daneMeczu.czyZrobilShanghai ? 1 : 0,
                rywal: daneMeczu.rywal || (liczbaRundMeczu > 7 ? `Trening 1-${liczbaRundMeczu}` : "Trening 1-7"),
                wynik: daneMeczu.czyWygrana ? "W" : "P"
            });
            if (historia.length > 50) historia.shift();

            // Zaktualizuj statystyki rund (1-7) Shanghai
            const rundy = { ...(s.rundy || {}) };
            if (daneMeczu.rundy) {
                Object.keys(daneMeczu.rundy).forEach((r) => {
                    const dot = rundy[r] || { rzuty: 0, trafienia: 0, punkty: 0, single: 0, double: 0, triple: 0, shanghai: false };
                    const zGry = daneMeczu.rundy[r] || {};
                    rundy[r] = {
                        rzuty: (dot.rzuty || 0) + (zGry.rzuty || 0),
                        trafienia: (dot.trafienia || 0) + (zGry.trafienia || 0),
                        punkty: (dot.punkty || 0) + (zGry.punkty || 0),
                        single: (dot.single || 0) + (zGry.single || 0),
                        double: (dot.double || 0) + (zGry.double || 0),
                        triple: (dot.triple || 0) + (zGry.triple || 0),
                        shanghai: Boolean(dot.shanghai || zGry.shanghai)
                    };
                });
            }

            const nowyStan = {
                ...s,
                mecze,
                wygrane,
                rekord_punktow: rekord,
                suma_punktow: sumaPunktow,
                srednia_na_gre: parseFloat((sumaPunktow / mecze).toFixed(1)),
                liczba_shanghai: shanghaiTrafienia,
                suma_rzutow: noweRzuty,
                suma_trafien: noweTrafienia,
                skutecznosc,
                rundy,
                historia_meczow: historia
            };

            return await this.zapiszStatystykiTrybu(graczId, "shanghai", nowyStan);
        },

        // ======================================================================
        // AKTUALIZACJA: TRYB AROUND THE WORLD
        // ======================================================================
        async zaktualizujAroundTheWorld(graczId, daneMeczu) {
            const stats = (await this.pobierzStatystykiTrybow(graczId)) || {};
            const a = stats.around_the_world || {
                mecze: 0,
                wygrane: 0,
                rekord_najmniej_lotek: null,
                skutecznosc: 0,
                suma_rzutow: 0,
                suma_trafien: 0,
                sektory: {},
                historia_meczow: []
            };

            const mecze = (a.mecze || 0) + 1;
            const wygrane = daneMeczu.czyWygrana ? (a.wygrane || 0) + 1 : (a.wygrane || 0);
            const rzuty = daneMeczu.rzuty || 0;
            
            let rekord = (a.rekord_najmniej_lotek !== null && a.rekord_najmniej_lotek !== undefined && Number(a.rekord_najmniej_lotek) > 0)
                ? Number(a.rekord_najmniej_lotek)
                : null;
            if (daneMeczu.czyUkonczyl && rzuty > 0) {
                rekord = rekord === null ? rzuty : Math.min(rekord, rzuty);
            }

            const sumaRzutow = (a.suma_rzutow || 0) + rzuty;
            const sumaTrafien = (a.suma_trafien || 0) + (daneMeczu.trafienia || 0);
            const skutecznosc = sumaRzutow > 0 ? parseFloat(((sumaTrafien / sumaRzutow) * 100).toFixed(1)) : 0;

            // Zaktualizuj statystyki poszczególnych celów (1-20 i innerbull)
            const sektory = { ...(a.sektory || {}) };
            if (daneMeczu.sektory) {
                Object.keys(daneMeczu.sektory).forEach((cel) => {
                    const dot = sektory[cel] || { rzuty: 0, trafienia: 0, single: 0, double: 0, triple: 0 };
                    const zGry = daneMeczu.sektory[cel] || {};
                    sektory[cel] = {
                        rzuty: (dot.rzuty || 0) + (zGry.rzuty || 0),
                        trafienia: (dot.trafienia || 0) + (zGry.trafienia || 0),
                        single: (dot.single || 0) + (zGry.single || 0),
                        double: (dot.double || 0) + (zGry.double || 0),
                        triple: (dot.triple || 0) + (zGry.triple || 0)
                    };
                });
            }

            // Dodaj wpis meczu do historii formy ATW
            const dzis = new Date();
            const dataStr = `${String(dzis.getDate()).padStart(2, "0")}.${String(dzis.getMonth() + 1).padStart(2, "0")}`;
            const meczProc = rzuty > 0 ? parseFloat(((daneMeczu.trafienia / rzuty) * 100).toFixed(1)) : 0;

            const historia = Array.isArray(a.historia_meczow) ? [...a.historia_meczow] : [];
            historia.push({
                data: daneMeczu.data || dataStr,
                skutecznosc: meczProc,
                lotki: rzuty,
                rzuty: rzuty,
                trafienia: daneMeczu.trafienia || 0,
                rywal: daneMeczu.rywal || "Trening 1-25",
                wynik: daneMeczu.czyWygrana ? "W" : "P"
            });
            if (historia.length > 50) historia.shift();

            const nowyStan = {
                ...a,
                mecze,
                wygrane,
                rekord_najmniej_lotek: rekord,
                suma_rzutow: sumaRzutow,
                suma_trafien: sumaTrafien,
                skutecznosc,
                sektory,
                historia_meczow: historia
            };

            return await this.zapiszStatystykiTrybu(graczId, "around_the_world", nowyStan);
        },

        // ======================================================================
        // AKTUALIZACJA: TRYB 121 CHECKOUT
        // ======================================================================
        async zaktualizuj121Checkout(graczId, daneMeczu) {
            const stats = (await this.pobierzStatystykiTrybow(graczId)) || {};
            const c = stats.checkout_121 || {
                podejscia: 0,
                sukcesy: 0,
                max_poziom: 121,
                najlepsza_seria: 0,
                skutecznosc: 0,
                historia_meczow: []
            };

            const podejscia = (c.podejscia || 0) + (daneMeczu.liczbaPodejsc || 1);
            const sukcesy = (c.sukcesy || 0) + (daneMeczu.sukcesy || 0);
            const maxPoziom = Math.max(c.max_poziom || 121, daneMeczu.osiagnietyPoziom || 121);
            const najlepszaSeria = Math.max(c.najlepsza_seria || 0, daneMeczu.najlepszaSeria || 0);

            // Dodaj wpis sesji do historii formy 121 Checkout
            const dzis = new Date();
            const dataStr = `${String(dzis.getDate()).padStart(2, "0")}.${String(dzis.getMonth() + 1).padStart(2, "0")}`;
            const meczPodejscia = daneMeczu.liczbaPodejsc || 1;
            const meczSukcesy = daneMeczu.sukcesy || 0;
            const meczProc = meczPodejscia > 0 ? parseFloat(((meczSukcesy / meczPodejscia) * 100).toFixed(1)) : 0;

            const historia = Array.isArray(c.historia_meczow) ? [...c.historia_meczow] : [];
            historia.push({
                data: daneMeczu.data || dataStr,
                skutecznosc: meczProc,
                max_poziom: daneMeczu.osiagnietyPoziom || 121,
                sukcesy: meczSukcesy,
                podejscia: meczPodejscia,
                seria: daneMeczu.najlepszaSeria || 0
            });
            if (historia.length > 50) historia.shift();

            const nowyStan = {
                ...c,
                podejscia,
                sukcesy,
                skutecznosc: podejscia > 0 ? parseFloat(((sukcesy / podejscia) * 100).toFixed(1)) : 0,
                max_poziom: maxPoziom,
                najlepsza_seria: najlepszaSeria,
                historia_meczow: historia
            };

            return await this.zapiszStatystykiTrybu(graczId, "checkout_121", nowyStan);
        },

        // ======================================================================
        // AKTUALIZACJA: TRYB CRICKET
        // ======================================================================
        async zaktualizujCricket(graczId, daneMeczu) {
            const stats = (await this.pobierzStatystykiTrybow(graczId)) || {};
            const cr = stats.cricket || {
                mecze: 0,
                wygrane: 0,
                mpr: 0,
                suma_marks: 0,
                suma_rund: 0
            };

            const mecze = (cr.mecze || 0) + 1;
            const wygrane = daneMeczu.czyWygrana ? (cr.wygrane || 0) + 1 : (cr.wygrane || 0);
            const sumaMarks = (cr.suma_marks || 0) + (daneMeczu.marks || 0);
            const sumaRund = (cr.suma_rund || 0) + (daneMeczu.rundy || 1);
            const mpr = sumaRund > 0 ? parseFloat((sumaMarks / sumaRund).toFixed(2)) : 0;

            const nowyStan = {
                ...cr,
                mecze,
                wygrane,
                suma_marks: sumaMarks,
                suma_rund: sumaRund,
                mpr
            };

            return await this.zapiszStatystykiTrybu(graczId, "cricket", nowyStan);
        }
    };

    window.StatsManager = StatsManager;
})(window);

