/* BITHOUSE — PHASE 1: STABILITY & RESILIENCE */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  let refreshTimer = null;
  let refreshBusy = false;
  let lastRefresh = 0;
  let healthChannel = null;

  function setSync(text) {
    const el = $("#syncState");
    if (el) el.textContent = text;
  }

  function showConnectionNotice(message, type) {
    let el = $("#bhConnectionNotice");
    if (!el) {
      el = document.createElement("div");
      el.id = "bhConnectionNotice";
      el.setAttribute("role", "status");
      el.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:10000;max-width:calc(100% - 28px);padding:11px 16px;border:2px solid #17294d;border-radius:14px;background:#fff;box-shadow:0 4px 0 #17294d;font:800 12px Nunito,sans-serif;text-align:center;transition:opacity .2s;";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.display = "block";
    el.style.opacity = "1";
    if (type === "error") el.style.background = "#fff0f0";
    else if (type === "success") el.style.background = "#eaf8f0";
    else el.style.background = "#fff";
    clearTimeout(el._hideTimer);
    if (type === "success") el._hideTimer = setTimeout(() => { el.style.opacity = "0"; setTimeout(() => { if (el) el.style.display = "none"; }, 220); }, 2200);
  }

  async function safeRefresh(force) {
    if (!window.user || typeof window.appRefresh !== "function") return;
    const now = Date.now();
    if (!force && now - lastRefresh < 700) return;
    if (refreshBusy) return;
    refreshBusy = true;
    lastRefresh = now;
    try {
      await window.appRefresh();
    } catch (e) {
      console.error("Bithouse refresh:", e);
      showConnectionNotice("Não foi possível atualizar agora. Tentando novamente…", "error");
    } finally {
      refreshBusy = false;
    }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => safeRefresh(false), 350);
  }

  async function healthCheck() {
    if (!window.sb || !window.user) return;
    try {
      const { error } = await window.sb.from("profiles").select("id").eq("id", window.user.id).maybeSingle();
      if (error) throw error;
      setSync("● sincronizado");
      return true;
    } catch (e) {
      console.warn("Bithouse health check:", e);
      setSync("● atenção");
      return false;
    }
  }

  function setupRealtimeGuard() {
    if (!window.sb || healthChannel) return;
    healthChannel = window.sb.channel("bithouse-health");
    healthChannel
      .on("postgres_changes", { event: "*", schema: "public", table: "commissions" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_items" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "asset_steps" }, scheduleRefresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setSync("● sincronizado");
          showConnectionNotice("✓ Agenda sincronizada", "success");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setSync("● reconectando...");
          showConnectionNotice("Conexão em recuperação…", "error");
        }
      });
  }

  function init() {
    window.bithouseSafeRefresh = safeRefresh;
    window.addEventListener("online", async () => {
      setSync("● reconectando...");
      showConnectionNotice("Conexão restaurada. Sincronizando…");
      await healthCheck();
      await safeRefresh(true);
    });
    window.addEventListener("offline", () => {
      setSync("● offline");
      showConnectionNotice("Sem internet. As alterações voltarão a sincronizar quando a conexão retornar.", "error");
    });
    window.addEventListener("unhandledrejection", (event) => {
      console.error("Bithouse unhandled rejection:", event.reason);
      showConnectionNotice("Ocorreu um erro inesperado. A agenda continua protegida; tente novamente.", "error");
    });
    window.addEventListener("error", (event) => {
      console.error("Bithouse runtime error:", event.error || event.message);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        healthCheck();
        safeRefresh(true);
      }
    });

    const start = () => {
      setupRealtimeGuard();
      healthCheck();
    };
    if (window.sb && window.user) start();
    else setTimeout(start, 1200);
    setInterval(() => { if (document.visibilityState === "visible") healthCheck(); }, 120000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
