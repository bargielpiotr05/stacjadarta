// menu.js
document.addEventListener("DOMContentLoaded", () => {
    const mobilnyMenuBtn = document.getElementById("mobilny-menu-btn");
    const mobilnyMenuOverlay = document.getElementById("mobilny-menu-overlay");
    const mobilnyMenuZamknij = document.getElementById("mobilny-menu-zamknij");

    if (mobilnyMenuBtn && mobilnyMenuOverlay && mobilnyMenuZamknij) {
        mobilnyMenuBtn.addEventListener("click", () => {
            mobilnyMenuOverlay.classList.add("otwarte");
            document.body.style.overflow = "hidden";
        });

        mobilnyMenuZamknij.addEventListener("click", () => {
            mobilnyMenuOverlay.classList.remove("otwarte");
            document.body.style.overflow = "";
        });

        mobilnyMenuOverlay.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", () => {
                mobilnyMenuOverlay.classList.remove("otwarte");
                document.body.style.overflow = "";
            });
        });

        mobilnyMenuOverlay.addEventListener("click", (e) => {
            if (e.target === mobilnyMenuOverlay) {
                mobilnyMenuOverlay.classList.remove("otwarte");
                document.body.style.overflow = "";
            }
        });
    }
});