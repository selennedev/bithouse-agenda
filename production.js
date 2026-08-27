/* Bithouse — Production Board */

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

  let steps = [];

  /* =========================================================
     STATUS
  ========================================================= */

  const normalizeStatus = (status) =>
    String(status || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const isDone = (status) =>
    normalizeStatus(status) === "concluido";

  const isInProgress = (status) =>
    normalizeStatus(status) === "em andamento";

  const isNotStarted = (status) =>
    !status ||
    normalizeStatus(status) === "nao inicializado" ||
    normalizeStatus(status) === "pendente";

  function statusLabel(status) {

    if (isDone(status)) {
      return "CONCLUÍDA";
    }

    if (isInProgress(status)) {
      return "EM ANDAMENTO";
    }

    return "NÃO INICIALIZADA";
  }

  function statusClass(status) {

    if (isDone(status)) {
      return "done";
    }

    if (isInProgress(status)) {
      return "progress";
    }

    return "not-started";
  }

  function isReleased(step) {

    if (!step.depends_on_step_id) {
      return true;
    }

    const dependency = steps.find(
      (item) => item.id === step.depends_on_step_id
    );

    return dependency && isDone(dependency.status);
  }

  function getState(step) {

    if (isDone(step.status)) {
      return ["CONCLUÍDA", "done"];
    }

    if (!isReleased(step)) {
      return ["BLOQUEADA", "blocked"];
    }

    if (isInProgress(step.status)) {
      return ["EM ANDAMENTO", "progress"];
    }

    return ["NÃO INICIALIZADA", "not-started"];
  }

  /* =========================================================
     DATA
  ========================================================= */

  const formatDate = (date) => {

    if (!date) {
      return "—";
    }

    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date(date + "T12:00:00"));

  };

  const formatHours = (value) => {

    const hours = Number(value || 0);

    return `${hours.toFixed(1)}h`;

  };

  /* =========================================================
     STATUS UPDATE
  ========================================================= */

  async function updateStepStatus(stepId, status) {

    if (!window.sb || !window.user) {
      return;
    }

    const step = steps.find(
      (item) => item.id === stepId
    );

    if (!step) {
      return;
    }

    const { error } = await sb
      .from("asset_steps")
      .update({
        status
      })
      .eq("id", stepId);

    if (error) {

      console.error(
        "Erro ao atualizar status:",
        error
      );

      alert(
        "Não foi possível atualizar o status.\n\n" +
        error.message
      );

      renderProduction();

      return;
    }

    await sb
      .from("activity_log")
      .insert({
        actor_id: window.user.id,
        action: "updated_asset_step_status",
        entity_type: "asset_step",
        entity_id: stepId,
        details: {
          previous_status: step.status,
          new_status: status
        }
      });

    step.status = status;

    renderProduction();

  }

  /* =========================================================
     MODAL DE DETALHES
  ========================================================= */

  function ensureDetailsModal() {

    if ($("#productionDetailsModal")) {
      return;
    }

    const modal = document.createElement("div");

    modal.id = "productionDetailsModal";

    modal.className =
      "production-details-backdrop hidden";

    modal.innerHTML = `
      <div class="production-details-modal">

        <button
          type="button"
          class="production-details-close"
          id="productionDetailsClose"
        >
          ×
        </button>

        <div id="productionDetailsContent"></div>

      </div>
    `;

    document.body.appendChild(modal);

    $("#productionDetailsClose").onclick =
      closeDetailsModal;

    modal.addEventListener(
      "click",
      (event) => {

        if (event.target === modal) {
          closeDetailsModal();
        }

      }
    );

  }

  function openDetailsModal(step) {

    ensureDetailsModal();

    const dependency =
      step.depends_on_step_id
        ? steps.find(
            (item) =>
              item.id === step.depends_on_step_id
          )
        : null;

    const released =
      isReleased(step);

    const content =
      $("#productionDetailsContent");

    content.innerHTML = `

      <span class="eyebrow">
        DETALHES DA PRODUÇÃO
      </span>

      <h2>
        ${esc(step.assets?.name || "Asset")}
      </h2>

      <div class="production-details-status-row">

        <span class="production-pill ${statusClass(step.status)}">
          ${statusLabel(step.status)}
        </span>

        ${
          !released && !isDone(step.status)
            ? `
              <span class="production-pill blocked">
                BLOQUEADA
              </span>
            `
            : ""
        }

      </div>

      <div class="production-details-section">

        <h3>O que precisa fazer</h3>

        <div class="production-detail-box">

          <strong>
            ${esc(step.step_type || "Produção")}
          </strong>

          <p>
            ${
              esc(
                step.assets?.notes ||
                "Nenhuma instrução adicional cadastrada."
              )
            }
          </p>

        </div>

      </div>

      <div class="production-details-grid">

        <div>
          <small>COMISSÃO</small>
          <strong>
            ${esc(
              step.assets?.project_name ||
              step.assets?.commission_name ||
              "—"
            )}
          </strong>
        </div>

        <div>
          <small>MAPA</small>
          <strong>
            ${esc(
              step.assets?.map_name ||
              "—"
            )}
          </strong>
        </div>

        <div>
          <small>RESPONSÁVEL</small>
          <strong>
            ${esc(
              step._profile?.name ||
              "Sem responsável"
            )}
          </strong>
        </div>

        <div>
          <small>TIPO</small>
          <strong>
            ${esc(step.step_type || "—")}
          </strong>
        </div>

        <div>
          <small>DATA</small>
          <strong>
            ${formatDate(step.planned_date)}
          </strong>
        </div>

        <div>
          <small>HORÁRIO</small>
          <strong>
            ${
              step.planned_start
                ? `${esc(step.planned_start)} – ${esc(step.planned_end || "")}`
                : "Sem horário"
            }
          </strong>
        </div>

        <div>
          <small>HORAS ESTIMADAS</small>
          <strong>
            ${formatHours(step.assets?.estimated_hours)}
          </strong>
        </div>

        <div>
          <small>CATEGORIA</small>
          <strong>
            ${esc(
              step.assets?.category ||
              "—"
            )}
          </strong>
        </div>

      </div>

      ${
        dependency
          ? `
            <div class="production-details-section">

              <h3>Dependência</h3>

              <div class="
                production-dependency
                ${isDone(dependency.status) ? "dependency-done" : ""}
              ">

                ${
                  isDone(dependency.status)
                    ? "✓ Dependência concluída"
                    : "⏳ Aguardando"
                }

                <strong>
                  ${esc(
                    dependency.assets?.name ||
                    "Etapa anterior"
                  )}
                </strong>

                <span>
                  ${esc(
                    dependency.step_type ||
                    ""
                  )}
                </span>

              </div>

            </div>
          `
          : ""
      }

      <div class="production-details-section">

        <h3>Alterar status</h3>

        <div class="production-status-buttons">

          <button
            type="button"
            class="status-btn ${
              isNotStarted(step.status)
                ? "active"
                : ""
            }"
            data-status="Não inicializado"
          >
            ⚪ Não inicializado
          </button>

          <button
            type="button"
            class="status-btn ${
              isInProgress(step.status)
                ? "active"
                : ""
            }"
            data-status="Em andamento"
          >
            🔵 Em andamento
          </button>

          <button
            type="button"
            class="status-btn ${
              isDone(step.status)
                ? "active"
                : ""
            }"
            data-status="Concluído"
          >
            ✅ Concluído
          </button>

        </div>

      </div>

    `;

    content
      .querySelectorAll("[data-status]")
      .forEach((button) => {

        button.addEventListener(
          "click",
          async () => {

            button.disabled = true;

            await updateStepStatus(
              step.id,
              button.dataset.status
            );

            openDetailsModal(
              steps.find(
                (item) => item.id === step.id
              )
            );

          }
        );

      });

    $("#productionDetailsModal")
      .classList.remove("hidden");

  }

  function closeDetailsModal() {

    $("#productionDetailsModal")
      ?.classList.add("hidden");

  }

  /* =========================================================
     LOAD
  ========================================================= */

  async function loadProduction() {

    if (!window.sb || !window.user) {
      return;
    }

    const result = await sb
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
          '<div class="production-empty">Erro ao carregar a fila de produção.</div>';

      }

      return;

    }

    steps = result.data || [];

    const profileIds = [
      ...new Set(
        steps
          .map(
            (step) =>
              step.assigned_to
          )
          .filter(Boolean)
      )
    ];

    let profiles = [];

    if (profileIds.length) {

      const profileResult =
        await sb
          .from("profiles")
          .select(
            "id,name,specialty,role"
          )
          .in(
            "id",
            profileIds
          );

      profiles =
        profileResult.data || [];

    }

    const profileMap =
      new Map(
        profiles.map(
          (profile) => [
            profile.id,
            profile
          ]
        )
      );

    steps.forEach((step) => {

      step._profile =
        profileMap.get(
          step.assigned_to
        );

    });

    buildMapFilter();

    renderProduction();

  }

  /* =========================================================
     MAP FILTER
  ========================================================= */

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
            (step) =>
              step.assets?.map_id
          )
          .filter(Boolean)
      )
    ];

    select.innerHTML =
      '<option value="TODAS">Todos os mapas</option>';

    mapIds.forEach(
      (mapId) => {

        const mapSteps =
          steps.filter(
            (step) =>
              step.assets?.map_id ===
              mapId
          );

        const mapName =
          mapSteps
            .map(
              (step) =>
                step.assets?.map_name
            )
            .find(Boolean) ||
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
        (option) =>
          option.value ===
          currentValue
      )
    ) {

      select.value =
        currentValue;

    }

  }

  /* =========================================================
     RENDER
  ========================================================= */

  function renderProduction() {

    const filter =
      $("#productionFilter")
        ?.value ||
      "TODAS";

    const visibleSteps =
      steps.filter(
        (step) =>
          filter === "TODAS" ||
          step.assets?.map_id ===
            filter
      );

    const activeSteps =
      visibleSteps.filter(
        (step) =>
          !isDone(step.status)
      );

    $("#productionTotal").textContent =
      visibleSteps.length;

    $("#productionReleased").textContent =
      activeSteps.filter(
        (step) =>
          isReleased(step)
      ).length;

    $("#productionBlocked").textContent =
      activeSteps.filter(
        (step) =>
          !isReleased(step)
      ).length;

    $("#productionCompleted").textContent =
      visibleSteps.filter(
        (step) =>
          isDone(step.status)
      ).length;

    $("#myProductionCount").textContent =
      activeSteps.filter(
        (step) =>
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
        '<div class="production-empty">Nenhuma etapa encontrada.</div>';

      return;

    }

    const groups =
      new Map();

    visibleSteps.forEach(
      (step) => {

        const key =
          step.assets?.map_id ||
          "SEM_MAPA";

        if (!groups.has(key)) {
          groups.set(key, []);
        }

        groups
          .get(key)
          .push(step);

      }
    );

    groups.forEach(
      (mapSteps) => {

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

        mapSteps.forEach(
          (step) => {

            const [
              stateLabel,
              stateClass
            ] = getState(step);

            const person =
              step._profile?.name ||
              "Sem responsável";

            const dependency =
              step.depends_on_step_id
                ? steps.find(
                    (item) =>
                      item.id ===
                      step.depends_on_step_id
                  )
                : null;

            const card =
              document.createElement(
                "article"
              );

            card.className =
              "production-card";

            card.innerHTML = `

              <div class="production-card-top">

                <span class="
                  production-pill
                  ${stateClass}
                ">
                  ${stateLabel}
                </span>

                <span class="production-type">
                  ${esc(
                    step.step_type ||
                    "Produção"
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
                      📅 ${formatDate(
                        step.planned_date
                      )}

                      ${
                        step.planned_start
                          ? `• ${esc(
                              step.planned_start
                            )} – ${esc(
                              step.planned_end ||
                              ""
                            )}`
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
                    <div class="
                      production-dependency
                    ">

                      ⏳ Aguardando

                      <strong>
                        ${esc(
                          dependency.assets?.name ||
                          "etapa anterior"
                        )}
                      </strong>

                    </div>
                  `
                  : ""
              }

              <div class="
                production-card-actions
              ">

                <button
                  type="button"
                  class="
                    production-view-btn
                  "
                >
                  Ver detalhes
                </button>

                <select
                  class="
                    production-status-select
                  "
                >

                  <option
                    value="Não inicializado"
                    ${
                      isNotStarted(
                        step.status
                      )
                        ? "selected"
                        : ""
                    }
                  >
                    ⚪ Não inicializado
                  </option>

                  <option
                    value="Em andamento"
                    ${
                      isInProgress(
                        step.status
                      )
                        ? "selected"
                        : ""
                    }
                  >
                    🔵 Em andamento
                  </option>

                  <option
                    value="Concluído"
                    ${
                      isDone(
                        step.status
                      )
                        ? "selected"
                        : ""
                    }
                  >
                    ✅ Concluído
                  </option>

                </select>

              </div>

            `;

            const detailsButton =
              card.querySelector(
                ".production-view-btn"
              );

            detailsButton.onclick =
              () =>
                openDetailsModal(
                  step
                );

            const statusSelect =
              card.querySelector(
                ".production-status-select"
              );

            statusSelect.addEventListener(
              "change",
              async () => {

                await updateStepStatus(
                  step.id,
                  statusSelect.value
                );

              }
            );

            card.addEventListener(
              "dblclick",
              () =>
                openDetailsModal(
                  step
                )
            );

            cards.appendChild(card);

          }
        );

        grid.appendChild(
          mapElement
        );

      }
    );

  }

  /* =========================================================
     INIT
  ========================================================= */

  function initProduction() {

    ensureDetailsModal();

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
          loadProduction
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
