/* ============================================================
   BITHOUSE — PRODUCTION BOARD
   Versão interativa
   ============================================================ */

(function () {

  const $ = (selector) => document.querySelector(selector);

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));

  const STATUS = {
    NOT_STARTED: "Não iniciado",
    IN_PROGRESS: "Em andamento",
    DONE: "Concluído"
  };

  let steps = [];
  let profiles = [];
  let currentStep = null;


  /* ==========================================================
     UTILITÁRIOS
     ========================================================== */

  function isDone(status) {
    return String(status || "") === STATUS.DONE;
  }

  function isInProgress(status) {
    return String(status || "") === STATUS.IN_PROGRESS;
  }

  function isNotStarted(status) {
    return (
      !status ||
      String(status) === STATUS.NOT_STARTED
    );
  }

  function formatDate(date) {

    if (!date) return "—";

    try {
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }).format(
        new Date(date + "T12:00:00")
      );
    } catch {
      return date;
    }
  }

  function formatDateTime(date, start, end) {

    if (!date) {
      return "Sem horário";
    }

    const d = formatDate(date);

    if (!start && !end) {
      return d;
    }

    return `${d} • ${start || "—"} – ${end || "—"}`;
  }


  /* ==========================================================
     DEPENDÊNCIAS
     ========================================================== */

  function getDependency(step) {

    if (!step?.depends_on_step_id) {
      return null;
    }

    return steps.find(
      (item) =>
        String(item.id) ===
        String(step.depends_on_step_id)
    ) || null;
  }


  function isReleased(step) {

    const dependency = getDependency(step);

    /*
      Sem dependência = liberada.
    */

    if (!dependency) {
      return true;
    }

    /*
      Dependência concluída = liberada.
    */

    return isDone(dependency.status);
  }


  function getState(step) {

    if (isDone(step.status)) {
      return {
        label: "CONCLUÍDA",
        className: "done"
      };
    }

    if (isReleased(step)) {
      if (isInProgress(step.status)) {
        return {
          label: "EM ANDAMENTO",
          className: "progress"
        };
      }

      return {
        label: "LIBERADA",
        className: "released"
      };
    }

    return {
      label: "BLOQUEADA",
      className: "blocked"
    };
  }


  /* ==========================================================
     INFORMAÇÕES DO ASSET
     ========================================================== */

  function getAssetDescription(asset) {

    if (!asset) {
      return "Sem informações adicionais.";
    }

    const possibleFields = [
      "description",
      "descricao",
      "briefing",
      "instructions",
      "instruction",
      "notes",
      "note",
      "observations",
      "observacao",
      "details",
      "detalhes"
    ];

    for (const field of possibleFields) {

      if (
        asset[field] !== undefined &&
        asset[field] !== null &&
        String(asset[field]).trim() !== ""
      ) {
        return String(asset[field]);
      }
    }

    return "Produzir este asset conforme o briefing e o padrão visual definido para o projeto.";
  }


  /* ==========================================================
     CRIAÇÃO DO MODAL
     ========================================================== */

  function createModal() {

    if ($("#productionModal")) {
      return;
    }

    const modal = document.createElement("div");

    modal.id = "productionModal";

    modal.className = "production-modal-backdrop hidden";

    modal.innerHTML = `
      <div class="production-modal">

        <button
          type="button"
          class="production-modal-close"
          id="productionModalClose"
        >
          ×
        </button>

        <div class="production-modal-header">

          <span class="eyebrow">
            DETALHES DO ASSET
          </span>

          <h2 id="productionModalTitle">
            Asset
          </h2>

          <div id="productionModalSubtitle"
               class="muted">
          </div>

        </div>


        <div
          id="productionModalState"
          class="production-modal-state">
        </div>


        <div class="production-detail-grid">

          <div class="production-detail-box">
            <small>MAPA / LOTE</small>
            <strong id="detailMap">—</strong>
          </div>

          <div class="production-detail-box">
            <small>TIPO DA ETAPA</small>
            <strong id="detailType">—</strong>
          </div>

          <div class="production-detail-box">
            <small>RESPONSÁVEL</small>
            <strong id="detailPerson">—</strong>
          </div>

          <div class="production-detail-box">
            <small>DATA</small>
            <strong id="detailDate">—</strong>
          </div>

        </div>


        <div
          id="dependencyBox"
          class="production-dependency-box hidden">
        </div>


        <div class="production-description">

          <span class="eyebrow">
            O QUE PRECISA SER FEITO
          </span>

          <div id="detailDescription">
            —
          </div>

        </div>


        <div class="production-edit-section">

          <span class="eyebrow">
            ATUALIZAR PRODUÇÃO
          </span>


          <label>
            Status

            <select id="productionStatus">

              <option value="Não iniciado">
                Não iniciado
              </option>

              <option value="Em andamento">
                Em andamento
              </option>

              <option value="Concluído">
                Concluído
              </option>

            </select>

          </label>


          <label>
            Responsável

            <select id="productionResponsible">
              <option value="">
                Sem responsável
              </option>
            </select>

          </label>


          <div class="production-date-grid">

            <label>
              Data

              <input
                id="productionDate"
                type="date"
              >
            </label>


            <label>
              Início

              <input
                id="productionStart"
                type="time"
              >
            </label>


            <label>
              Fim

              <input
                id="productionEnd"
                type="time"
              >
            </label>

          </div>

        </div>


        <div
          id="productionModalMessage"
          class="production-modal-message">
        </div>


        <div class="production-modal-actions">

          <button
            type="button"
            class="ghost-btn"
            id="productionCancel"
          >
            Cancelar
          </button>

          <button
            type="button"
            class="primary-btn"
            id="productionSave"
          >
            Salvar alterações
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(modal);


    $("#productionModalClose").onclick =
      closeProductionModal;

    $("#productionCancel").onclick =
      closeProductionModal;

    $("#productionSave").onclick =
      saveProductionChanges;


    modal.addEventListener(
      "click",
      (event) => {

        if (event.target === modal) {
          closeProductionModal();
        }

      }
    );
  }


  /* ==========================================================
     ABRIR MODAL
     ========================================================== */

  function openProductionModal(step) {

    if (!step) return;

    createModal();

    currentStep = step;

    const state = getState(step);
    const dependency = getDependency(step);

    const asset = step.assets || {};

    const person =
      step._profile?.name ||
      "Sem responsável";

    const mapName =
      asset.map_name ||
      asset.project_name ||
      asset.map_id ||
      "Sem mapa";

    const assetName =
      asset.name ||
      "Asset";

    $("#productionModalTitle").textContent =
      assetName;

    $("#productionModalSubtitle").textContent =
      `${mapName} • ${step.step_type || "Produção"}`;

    $("#detailMap").textContent =
      mapName;

    $("#detailType").textContent =
      step.step_type || "—";

    $("#detailPerson").textContent =
      person;

    $("#detailDate").textContent =
      formatDateTime(
        step.planned_date,
        step.planned_start,
        step.planned_end
      );

    $("#detailDescription").textContent =
      getAssetDescription(asset);


    /* Estado */

    $("#productionModalState").innerHTML = `
      <span class="production-pill ${state.className}">
        ${state.label}
      </span>
    `;


    /* Dependência */

    const dependencyBox =
      $("#dependencyBox");

    if (dependency) {

      if (isDone(dependency.status)) {

        dependencyBox.classList.remove("hidden");

        dependencyBox.innerHTML = `
          <strong>✓ Dependência concluída</strong>
          <span>
            ${esc(dependency.assets?.name || "Etapa anterior")}
            — ${esc(dependency.step_type || "")}
          </span>
        `;

      } else {

        dependencyBox.classList.remove("hidden");

        dependencyBox.innerHTML = `
          <strong>⏳ Esta etapa está bloqueada</strong>
          <span>
            Aguarda:
            ${esc(dependency.assets?.name || "etapa anterior")}
            — ${esc(dependency.step_type || "")}
          </span>
        `;
      }

    } else {

      dependencyBox.classList.add("hidden");
      dependencyBox.innerHTML = "";
    }


    /* Status */

    const statusSelect =
      $("#productionStatus");

    statusSelect.value =
      step.status || STATUS.NOT_STARTED;


    /*
      Se estiver bloqueada, não permitimos
      iniciar antes da dependência.
    */

    const blocked =
      !isReleased(step) &&
      !isDone(step.status);

    statusSelect.disabled =
      blocked;


    if (blocked) {

      $("#productionModalMessage").textContent =
        "Esta etapa está bloqueada até a etapa anterior ser concluída.";

    } else {

      $("#productionModalMessage").textContent =
        "";
    }


    /* Responsáveis */

    const responsible =
      $("#productionResponsible");

    responsible.innerHTML = `
      <option value="">
        Sem responsável
      </option>
    `;

    profiles.forEach((profile) => {

      const option =
        document.createElement("option");

      option.value =
        profile.id;

      option.textContent =
        profile.name;

      responsible.appendChild(option);

    });

    responsible.value =
      step.assigned_to || "";


    /* Agenda */

    $("#productionDate").value =
      step.planned_date || "";

    $("#productionStart").value =
      step.planned_start || "";

    $("#productionEnd").value =
      step.planned_end || "";


    $("#productionModal")
      .classList
      .remove("hidden");
  }


  /* ==========================================================
     FECHAR MODAL
     ========================================================== */

  function closeProductionModal() {

    const modal =
      $("#productionModal");

    if (!modal) return;

    modal.classList.add("hidden");

    currentStep = null;
  }


  /* ==========================================================
     SALVAR ALTERAÇÕES
     ========================================================== */

  async function saveProductionChanges() {

    if (!currentStep) {
      return;
    }

    if (!window.sb || !window.user) {
      alert("Usuário não autenticado.");
      return;
    }

    const step =
      currentStep;

    const newStatus =
      $("#productionStatus").value;

    const newResponsible =
      $("#productionResponsible").value || null;

    const newDate =
      $("#productionDate").value || null;

    const newStart =
      $("#productionStart").value || null;

    const newEnd =
      $("#productionEnd").value || null;


    /* Impede iniciar etapa bloqueada */

    if (
      !isReleased(step) &&
      newStatus !== STATUS.DONE
    ) {

      alert(
        "Esta etapa está bloqueada.\n\n" +
        "Conclua primeiro a etapa da qual ela depende."
      );

      return;
    }


    const button =
      $("#productionSave");

    button.disabled = true;
    button.textContent =
      "Salvando...";


    const oldStatus =
      step.status;

    const oldResponsible =
      step.assigned_to;

    const oldDate =
      step.planned_date;

    const oldStart =
      step.planned_start;

    const oldEnd =
      step.planned_end;


    const updateData = {
      status: newStatus,
      assigned_to: newResponsible,
      planned_date: newDate,
      planned_start: newStart,
      planned_end: newEnd
    };


    /* ========================================================
       ATUALIZA ASSET STEP
       ======================================================== */

    const result =
      await sb
        .from("asset_steps")
        .update(updateData)
        .eq("id", step.id)
        .select(`
          id,
          asset_id,
          step_type,
          status,
          assigned_to,
          depends_on_step_id,
          planned_date,
          planned_start,
          planned_end
        `)
        .single();


    if (result.error) {

      console.error(
        "Erro ao atualizar etapa:",
        result.error
      );

      alert(
        "Não foi possível salvar.\n\n" +
        result.error.message
      );

      button.disabled = false;
      button.textContent =
        "Salvar alterações";

      return;
    }


    /* ========================================================
       HISTÓRICO
       ======================================================== */

    const changes = {};

    if (oldStatus !== newStatus) {

      changes.status = {
        from: oldStatus,
        to: newStatus
      };

    }

    if (oldResponsible !== newResponsible) {

      changes.responsible = {
        from: oldResponsible,
        to: newResponsible
      };

    }

    if (oldDate !== newDate) {

      changes.planned_date = {
        from: oldDate,
        to: newDate
      };

    }

    if (oldStart !== newStart) {

      changes.planned_start = {
        from: oldStart,
        to: newStart
      };

    }

    if (oldEnd !== newEnd) {

      changes.planned_end = {
        from: oldEnd,
        to: newEnd
      };

    }


    if (Object.keys(changes).length) {

      const logResult =
        await sb
          .from("activity_log")
          .insert({

            actor: window.user.id,

            action:
              "updated_asset_step",

            entity_type:
              "asset_step",

            entity_id:
              step.id,

            metadata: {
              asset_id:
                step.asset_id || null,

              asset_name:
                step.assets?.name || null,

              step_type:
                step.step_type || null,

              changes
            }

          });


      if (logResult.error) {

        console.warn(
          "Etapa atualizada, mas histórico não foi salvo:",
          logResult.error
        );

      }
    }


    /* ========================================================
       FECHA E ATUALIZA
       ======================================================== */

    closeProductionModal();

    await loadProduction();
  }


  /* ==========================================================
     CARREGAR PRODUÇÃO
     ========================================================== */

  async function loadProduction() {

    if (!window.sb || !window.user) {
      return;
    }


    const result =
      await sb
        .from("asset_steps")
        .select(`
          id,
          asset_id,
          step_type,
          status,
          assigned_to,
          depends_on_step_id,
          planned_date,
          planned_start,
          planned_end,
          assets!inner(*)
        `)
        .order(
          "planned_date",
          {
            ascending: true,
            nullsFirst: false
          }
        )
        .order(
          "planned_start",
          {
            ascending: true,
            nullsFirst: false
          }
        );


    if (result.error) {

      console.error(
        "Erro ao carregar produção:",
        result.error
      );

      const grid =
        $("#productionGrid");

      if (grid) {

        grid.innerHTML =
          `
          <div class="production-empty">
            Erro ao carregar a fila de produção.
          </div>
          `;
      }

      return;
    }


    steps =
      result.data || [];


    /* ========================================================
       CARREGAR RESPONSÁVEIS
       ======================================================== */

    const profileIds = [
      ...new Set(
        steps
          .map(
            step =>
              step.assigned_to
          )
          .filter(Boolean)
      )
    ];


    profiles = [];


    /*
      Carregamos todos os perfis ativos.
      Assim podemos trocar o responsável diretamente
      pelo modal.
    */

    const profileResult =
      await sb
        .from("profiles")
        .select(
          "id,name,specialty,role,active"
        )
        .eq(
          "active",
          true
        )
        .order(
          "name",
          {
            ascending: true
          }
        );


    if (!profileResult.error) {

      profiles =
        profileResult.data || [];

    }


    const profileMap =
      new Map(
        profiles.map(
          profile => [
            profile.id,
            profile
          ]
        )
      );


    steps.forEach(
      step => {

        step._profile =
          profileMap.get(
            step.assigned_to
          );

      }
    );


    buildMapFilter();

    renderProduction();
  }


  /* ==========================================================
     FILTRO DE MAPAS
     ========================================================== */

  function buildMapFilter() {

    const select =
      $("#productionFilter");

    if (!select) {
      return;
    }


    const currentValue =
      select.value || "TODAS";


    const mapIds = [
      ...new Set(
        steps
          .map(
            step =>
              step.assets?.map_id
          )
          .filter(Boolean)
      )
    ];


    select.innerHTML =
      `
      <option value="TODAS">
        Todos os mapas
      </option>
      `;


    mapIds.forEach(
      mapId => {

        const mapSteps =
          steps.filter(
            step =>
              step.assets?.map_id ===
              mapId
          );


        const mapName =
          mapSteps
            .map(
              step =>
                step.assets?.map_name
            )
            .find(Boolean)
          ||
          mapId;


        select.innerHTML += `
          <option value="${esc(mapId)}">
            ${esc(mapName)}
          </option>
        `;
      }
    );


    if (
      [
        ...select.options
      ].some(
        option =>
          option.value ===
          currentValue
      )
    ) {

      select.value =
        currentValue;

    }
  }


  /* ==========================================================
     RENDER PRODUÇÃO
     ========================================================== */

  function renderProduction() {

    const filter =
      $("#productionFilter")?.value ||
      "TODAS";


    const visibleSteps =
      steps.filter(
        step =>
          filter === "TODAS" ||
          step.assets?.map_id ===
          filter
      );


    const activeSteps =
      visibleSteps.filter(
        step =>
          !isDone(step.status)
      );


    /* CONTADORES */

    $("#productionTotal").textContent =
      visibleSteps.length;


    $("#productionReleased").textContent =
      activeSteps.filter(
        step =>
          isReleased(step)
      ).length;


    $("#productionBlocked").textContent =
      activeSteps.filter(
        step =>
          !isReleased(step)
      ).length;


    $("#productionCompleted").textContent =
      visibleSteps.filter(
        step =>
          isDone(step.status)
      ).length;


    $("#myProductionCount").textContent =
      activeSteps.filter(
        step =>
          step.assigned_to ===
          window.user?.id
      ).length;


    const grid =
      $("#productionGrid");

    if (!grid) {
      return;
    }


    grid.innerHTML = "";


    if (!visibleSteps.length) {

      grid.innerHTML =
        `
        <div class="production-empty">
          Nenhuma etapa encontrada.
        </div>
        `;

      return;
    }


    /* ========================================================
       AGRUPAR POR MAPA
       ======================================================== */

    const groups =
      new Map();


    visibleSteps.forEach(
      step => {

        const key =
          step.assets?.map_id ||
          "SEM_MAPA";


        if (!groups.has(key)) {

          groups.set(
            key,
            []
          );

        }


        groups
          .get(key)
          .push(step);

      }
    );


    /* ========================================================
       DESENHAR MAPAS
       ======================================================== */

    groups.forEach(
      mapSteps => {

        const first =
          mapSteps[0];


        const mapName =
          first.assets?.map_name ||
          first.assets?.project_name ||
          "Sem mapa";


        const mapElement =
          document.createElement(
            "div"
          );


        mapElement.className =
          "production-map";


        mapElement.innerHTML = `
          <div class="production-map-head">

            <div>

              <span class="eyebrow">
                MAPA / LOTE
              </span>

              <h3>
                ${esc(mapName)}
              </h3>

            </div>

            <span class="production-count">
              ${mapSteps.length} etapas
            </span>

          </div>

          <div class="production-cards"></div>
        `;


        const cards =
          mapElement.querySelector(
            ".production-cards"
          );


        /* ====================================================
           CARDS
           ==================================================== */

        mapSteps.forEach(
          step => {

            const state =
              getState(step);


            const person =
              step._profile?.name ||
              "Sem responsável";


            const dependency =
              getDependency(step);


            const card =
              document.createElement(
                "article"
              );


            card.className =
              `
              production-card
              production-card-clickable
              ${state.className}
              `;


            card.innerHTML = `

              <div class="production-card-top">

                <span
                  class="production-pill ${state.className}"
                >
                  ${state.label}
                </span>

                <span class="production-type">
                  ${esc(
                    step.step_type ||
                    "PRODUÇÃO"
                  )}
                </span>

              </div>


              <h4>
                ${esc(
                  step.assets?.name ||
                  "Asset"
                )}
              </h4>


              <div class="production-person">
                👤 ${esc(person)}
              </div>


              <div class="production-time">
                ${
                  step.planned_date
                    ? `
                      📅
                      ${formatDate(step.planned_date)}
                      ${
                        step.planned_start
                          ? ` • ${esc(step.planned_start)}`
                          : ""
                      }
                      ${
                        step.planned_end
                          ? ` – ${esc(step.planned_end)}`
                          : ""
                      }
                    `
                    : "Sem horário"
                }
              </div>


              ${
                dependency &&
                !isDone(
                  dependency.status
                )
                  ? `
                    <div class="production-dependency">
                      ⏳ Aguardando
                      ${esc(
                        dependency.assets?.name ||
                        "etapa anterior"
                      )}
                    </div>
                  `
                  : ""
              }


              <div class="production-card-action">
                Clique para abrir →
              </div>

            `;


            card.addEventListener(
              "click",
              () =>
                openProductionModal(
                  step
                )
            );


            cards.appendChild(
              card
            );

          }
        );


        grid.appendChild(
          mapElement
        );

      }
    );
  }


  /* ==========================================================
     CSS DO MODAL
     ========================================================== */

  function injectProductionStyles() {

    if (
      document.getElementById(
        "production-interactive-styles"
      )
    ) {
      return;
    }


    const style =
      document.createElement(
        "style"
      );


    style.id =
      "production-interactive-styles";


    style.textContent = `

      .production-card-clickable {
        cursor: pointer;
        transition:
          transform .18s ease,
          box-shadow .18s ease;
      }

      .production-card-clickable:hover {
        transform: translateY(-3px);
        box-shadow:
          0 10px 25px rgba(30, 50, 90, .12);
      }

      .production-card-action {
        margin-top: 12px;
        font-size: 12px;
        font-weight: 800;
        opacity: .65;
      }


      .production-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(20, 30, 55, .45);
        backdrop-filter: blur(5px);
      }

      .production-modal-backdrop.hidden {
        display: none;
      }


      .production-modal {
        position: relative;
        width: min(720px, 100%);
        max-height: 90vh;
        overflow-y: auto;
        background: #fff;
        border-radius: 24px;
        padding: 30px;
        box-shadow:
          0 30px 80px rgba(20, 30, 55, .25);
      }


      .production-modal-close {
        position: absolute;
        top: 18px;
        right: 18px;
        width: 38px;
        height: 38px;
        border: 2px solid #182b50;
        border-radius: 50%;
        background: #fff;
        color: #182b50;
        font-size: 24px;
        font-weight: 800;
        cursor: pointer;
      }


      .production-modal-header {
        padding-right: 50px;
        margin-bottom: 20px;
      }


      .production-modal-header h2 {
        margin:
          6px 0 5px;
      }


      .production-modal-state {
        margin-bottom: 22px;
      }


      .production-detail-grid {
        display: grid;
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
        gap: 10px;
      }


      .production-detail-box {
        padding: 14px;
        border-radius: 14px;
        background: #f5f7fb;
      }


      .production-detail-box small {
        display: block;
        margin-bottom: 5px;
        font-size: 10px;
        font-weight: 800;
        opacity: .6;
        letter-spacing: .06em;
      }


      .production-detail-box strong {
        font-size: 14px;
      }


      .production-description {
        margin-top: 22px;
        padding: 18px;
        border: 1px solid #e1e6f0;
        border-radius: 16px;
        line-height: 1.6;
      }


      .production-description > div {
        margin-top: 8px;
        color: #53627d;
      }


      .production-edit-section {
        display: flex;
        flex-direction: column;
        gap: 15px;
        margin-top: 24px;
        padding-top: 22px;
        border-top: 1px solid #e1e6f0;
      }


      .production-edit-section label {
        display: flex;
        flex-direction: column;
        gap: 7px;
        font-size: 12px;
        font-weight: 800;
      }


      .production-edit-section select,
      .production-edit-section input {
        width: 100%;
        min-height: 44px;
        padding: 10px 12px;
        border:
          1px solid #d7deeb;
        border-radius: 10px;
        background: #fff;
        font: inherit;
        color: #182b50;
      }


      .production-date-grid {
        display: grid;
        grid-template-columns:
          1.3fr 1fr 1fr;
        gap: 10px;
      }


      .production-dependency-box {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 18px;
        padding: 14px 16px;
        border-radius: 14px;
        background: #fff4d5;
      }


      .production-dependency-box.hidden {
        display: none;
      }


      .production-dependency-box strong {
        font-size: 13px;
      }


      .production-dependency-box span {
        font-size: 12px;
      }


      .production-modal-message {
        margin-top: 12px;
        font-size: 12px;
        font-weight: 700;
      }


      .production-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 24px;
      }


      .production-pill.progress {
        background: #dce8ff;
        color: #315fc7;
      }


      .production-pill.released {
        background: #e3f7eb;
        color: #197544;
      }


      .production-pill.blocked {
        background: #fff0d8;
        color: #a96500;
      }


      .production-pill.done {
        background: #dff5e7;
        color: #197544;
      }


      @media (max-width: 650px) {

        .production-modal {
          padding: 22px;
        }

        .production-detail-grid {
          grid-template-columns: 1fr;
        }

        .production-date-grid {
          grid-template-columns: 1fr;
        }

        .production-modal-actions {
          flex-direction: column;
        }

      }

    `;


    document.head.appendChild(
      style
    );
  }


  /* ==========================================================
     INICIALIZAÇÃO
     ========================================================== */

  function initProduction() {

    injectProductionStyles();

    createModal();


    $("#productionFilter")
      ?.addEventListener(
        "change",
        renderProduction
      );


    $("#productionRefresh")
      ?.addEventListener(
        "click",
        loadProduction
      );


    loadProduction();


    /* ========================================================
       TEMPO REAL
       ======================================================== */

    if (window.sb) {

      sb.channel(
        "bithouse-production-live"
      )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "asset_steps"
          },
          async () => {

            await loadProduction();

          }
        )

        .subscribe();

    }
  }


  window.loadProduction =
    loadProduction;


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      initProduction
    );

  } else {

    initProduction();

  }

})();
