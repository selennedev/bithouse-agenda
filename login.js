/* BITHOUSE — LOGIN */
(function () {
  "use strict";

  function initLogin() {
    const btn = document.getElementById("loginBtn");
    const email = document.getElementById("loginEmail");
    const msg = document.getElementById("loginMsg");
    if (!btn || !email || !msg || !window.sb) return;

    function message(text, type) {
      msg.textContent = text;
      msg.className = "login-message " + (type || "");
      msg.style.display = "block";
    }

    btn.addEventListener("click", async function () {
      const value = email.value.trim();
      if (!value) {
        message("Digite seu e-mail para continuar.", "error");
        email.focus();
        return;
      }

      if (!email.checkValidity()) {
        message("Digite um e-mail válido.", "error");
        email.focus();
        return;
      }

      btn.disabled = true;
      btn.textContent = "Enviando...";
      message("Enviando o link de acesso...", "loading");

      try {
        const { error } = await window.sb.auth.signInWithOtp({
          email: value,
          options: {
            emailRedirectTo: window.location.href.split("#")[0]
          }
        });

        if (error) {
          console.error("Bithouse login:", error);
          message("Não foi possível enviar o link: " + error.message, "error");
          return;
        }

        message("✓ Foi enviado o link de acesso para o seu e-mail. Verifique sua caixa de entrada e, se necessário, o spam.", "success");
        email.blur();
      } catch (error) {
        console.error("Bithouse login:", error);
        message("Ocorreu um erro ao enviar o link. Tente novamente.", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Enviar link de acesso";
      }
    });

    email.addEventListener("keydown", function (event) {
      if (event.key === "Enter") btn.click();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLogin);
  } else {
    initLogin();
  }
})();
