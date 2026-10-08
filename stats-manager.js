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
                sektory: {}
            };

            const mecze = (d.mecze || 0) + 1;
            const wygrane = daneMeczu.czyWygrana ? (d.wygrane || 0) + 1 : (d.wygrane || 0);
            const sumaRzutow = (d.suma_rzutow || 0) + (daneMeczu.rzutySuma || 0);
            const sumaTrafien = (d.suma_trafien || 0) + (daneMeczu.trafieniaSuma || 0);
            const ogolnaSkutecznosc = sumaRzutow > 0 ? parseFloat(((sumaTrafien / sumaRzutow) * 100).toFixed(1)) : 0;

            const sektory = d.sektory || {};

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

            const nowyStan = {
                mecze,
                wygrane,
                suma_rzutow: sumaRzutow,
                suma_trafien: sumaTrafien,
                skutecznosc: ogolnaSkutecznosc,
                sektory
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
                liczba_shanghai: 0
            };

            const mecze = (s.mecze || 0) + 1;
            const wygrane = daneMeczu.czyWygrana ? (s.wygrane || 0) + 1 : (s.wygrane || 0);
            const zdobytePunkty = daneMeczu.punkty || 0;
            const rekord = Math.max(s.rekord_punktow || 0, zdobytePunkty);
            const sumaPunktow = (s.suma_punktow || 0) + zdobytePunkty;
            const shanghaiTrafienia = (s.liczba_shanghai || 0) + (daneMeczu.czyZrobilShanghai ? 1 : 0);

            const nowyStan = {
                mecze,
                wygrane,
                rekord_punktow: rekord,
                suma_punktow: sumaPunktow,
                srednia_na_gre: parseFloat((sumaPunktow / mecze).toFixed(1)),
                liczba_shanghai: shanghaiTrafienia
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
                suma_trafien: 0
            };

            const mecze = (a.mecze || 0) + 1;
            const wygrane = daneMeczu.czyWygrana ? (a.wygrane || 0) + 1 : (a.wygrane || 0);
            const rzuty = daneMeczu.rzuty || 0;
            
            let rekord = a.rekord_najmniej_lotek;
            if (daneMeczu.czyUkonczyl) {
                rekord = rekord === null ? rzuty : Math.min(rekord, rzuty);
            }

            const sumaRzutow = (a.suma_rzutow || 0) + rzuty;
            const sumaTrafien = (a.suma_trafien || 0) + (daneMeczu.trafienia || 0);
            const skutecznosc = sumaRzutow > 0 ? parseFloat(((sumaTrafien / sumaRzutow) * 100).toFixed(1)) : 0;

            const nowyStan = {
                mecze,
                wygrane,
                rekord_najmniej_lotek: rekord,
                suma_rzutow: sumaRzutow,
                suma_trafien: sumaTrafien,
                skutecznosc
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
                najlepsza_seria: 0
            };

            const podejscia = (c.podejscia || 0) + (daneMeczu.liczbaPodejsc || 1);
            const sukcesy = (c.sukcesy || 0) + (daneMeczu.sukcesy || 0);
            const maxPoziom = Math.max(c.max_poziom || 121, daneMeczu.osiagnietyPoziom || 121);
            const najlepszaSeria = Math.max(c.najlepsza_seria || 0, daneMeczu.najlepszaSeria || 0);

            const nowyStan = {
                podejscia,
                sukcesy,
                skutecznosc: podejscia > 0 ? parseFloat(((sukcesy / podejscia) * 100).toFixed(1)) : 0,
                max_poziom: maxPoziom,
                najlepsza_seria: najlepszaSeria
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

