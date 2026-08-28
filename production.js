/* =========================================================
   BITHOUSE — PRODUCTION BOARD
   Fila de Assets / Etapas / Status / Dependências
========================================================= */

(function () {
  "use strict";

  const $ = (selector) =>
    document.querySelector(selector);

  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char])
    );

  const normalize = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const isDone = (status) =>
    normalize(status) === "concluido";

  const isProgress = (status) =>
    normalize(status) === "em andamento";

  const isNotStarted = (status) =>
    normalize(status) === "nao inicializado";

  const isBlocked = (status) =>
    normalize(status) === "bloqueado";

  const statusClass = (status) => {
    const value = normalize(status);

    if (value === "concluido") {
      return "done";
    }

    if (value === "em andamento") {
      return "progress";
    }

    if (value === "bloqueado") {
      return "blocked";
    }

    return "not-started";
  };

  const statusLabel = (status) => {
    if (isDone(status)) {
      return "CONCLUÍDA";
    }

    if (isProgress(status)) {
      return "EM ANDAMENTO";
    }

    if (isBlocked(status)) {
      return "BLOQUEADA";
    }

    return "NÃO INICIALIZADA";
  };

  const formatDate = (date) => {
    if (!date) {
      return "—";
    }

    return new Intl.DateTimeFormat(
      "pt-BR",
      {
        day: "2-digit",
        month: "2-digit"
      }
    ).format(
      new Date(
        date + "T12:00:00"
      )
    );
  };

  let steps = [];
  let profiles = [];

  /* =======================================================
     DEPENDÊNCIA
  ======================================================= */

  function getDependency(step) {
    if (!step?.depends_on_step_id) {
      return null;
    }

    return steps.find(
      (item) =>
        item.id ===
        step.depends_on_step_id
    );
  }

  function dependencyCompleted(step) {
    const dependency =
      getDependency(step);

    if (!dependency) {
      return true;
    }

    return isDone(
      dependency.status
    );
  }

  function isReleased(step) {
    if (!step?.depends_on_step_id) {
      return true;
    }

    return dependencyCompleted(
      step
    );
  }

  function getState(step) {
    const status =
      normalize(
        step.status
      );

    /*
     * Concluído sempre vence
     */
    if (
      status ===
      "concluido"
    ) {
      return [
        "CONCLUÍDA",
        "done"
      ];
    }

    /*
     * Se tiver dependência
     * não concluída, fica bloqueada.
     */
    if (
      step.depends_on_step_id &&
      !dependencyCompleted(step)
    ) {
      return [
        "BLOQUEADA",
        "blocked"
      ];
    }

    if (
      status ===
      "em andamento"
    ) {
      return [
        "EM ANDAMENTO",
        "progress"
      ];
    }

    return [
      "NÃO INICIALIZADA",
      "not-started"
    ];
  }

  /* =======================================================
     CARREGAR PRODUÇÃO
  ======================================================= */

  async function loadProduction() {
    if (
      !window.sb ||
      !window.user
    ) {
      return;
    }

    const { data, error } =
      await window.sb
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

    if (error) {
      console.error(
        "Erro ao carregar produção:",
        error
      );

      showProductionError(
        error
      );

      return;
    }

    steps =
      data || [];

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

    profiles = [];

    if (
      profileIds.length
    ) {
      const result =
        await window.sb
          .from("profiles")
          .select(
            "id,name,specialty,role"
          )
          .in(
            "id",
            profileIds
          );

      if (
        result.error
      ) {
        console.error(
          "Erro ao carregar responsáveis:",
          result.error
        );
      } else {
        profiles =
          result.data ||
          [];
      }
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

    steps.forEach(
      (step) => {
        step._profile =
          profileMap.get(
            step.assigned_to
          );
      }
    );

    buildMapFilter();
    renderProduction();
  }

  function showProductionError(
    error
  ) {
    const grid =
      $("#productionGrid");

    if (!grid) {
      return;
    }

    grid.innerHTML = `
      <div
        class="production-empty"
      >
        <strong>
          Erro ao carregar produção.
        </strong>

        <small>
          ${esc(
            error?.message ||
            "Erro desconhecido."
          )}
        </small>
      </div>
    `;
  }

  /* =======================================================
     FILTRO DE MAPAS
  ======================================================= */

  function buildMapFilter() {
    const select =
      $("#productionFilter");

    if (!select) {
      return;
    }

    const current =
      select.value ||
      "TODAS";

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

    select.innerHTML = `
      <option value="TODAS">
        Todos os mapas
      </option>
    `;

    mapIds.forEach(
      (mapId) => {
        const mapSteps =
          steps.filter(
            (step) =>
              step.assets
                ?.map_id ===
              mapId
          );

        const mapName =
          mapSteps
            .map(
              (step) =>
                step.assets
                  ?.map_name
            )
            .find(Boolean) ||
          mapId;

        select.innerHTML += `
          <option
            value="${esc(
              mapId
            )}"
          >
            ${esc(
              mapName
            )}
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
          current
      )
    ) {
      select.value =
        current;
    }
  }

  /* =======================================================
     RENDER
  ======================================================= */

  function renderProduction() {
    const filter =
      $("#productionFilter")
        ?.value ||
      "TODAS";

    const visible =
      steps.filter(
        (step) =>
          filter === "TODAS" ||
          step.assets
            ?.map_id ===
          filter
      );

    const total =
      visible.length;

    const completed =
      visible.filter(
        (step) =>
          isDone(
            step.status
          )
      ).length;

    const blocked =
      visible.filter(
        (step) =>
          getState(
            step
          )[1] ===
          "blocked"
      ).length;

    const released =
      visible.filter(
        (step) =>
          !isDone(
            step.status
          ) &&
          getState(
            step
          )[1] !==
          "blocked"
      ).length;

    const mine =
      visible.filter(
        (step) =>
          step.assigned_to ===
          window.user?.id &&
          !isDone(
            step.status
          )
      ).length;

    setText(
      "#productionTotal",
      total
    );

    setText(
      "#productionReleased",
      released
    );

    setText(
      "#productionBlocked",
      blocked
    );

    setText(
      "#productionCompleted",
      completed
    );

    setText(
      "#myProductionCount",
      mine
    );

    const grid =
      $("#productionGrid");

    if (!grid) {
      return;
    }

    grid.innerHTML = "";

    if (!visible.length) {
      grid.innerHTML = `
        <div
          class="production-empty"
        >
          Nenhuma etapa encontrada.
        </div>
      `;

      return;
    }

    const groups =
      new Map();

    visible.forEach(
      (step) => {
        const key =
          step.assets
            ?.map_id ||
          "SEM_MAPA";

        if (
          !groups.has(
            key
          )
        ) {
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

    groups.forEach(
      (mapSteps) => {
        renderMap(
          grid,
          mapSteps
        );
      }
    );
  }

  function renderMap(
    grid,
    mapSteps
  ) {
    const first =
      mapSteps[0];

    const mapName =
      first.assets
        ?.map_name ||
      first.assets
        ?.project_name ||
      "Sem mapa";

    const map =
      document.createElement(
        "section"
      );

    map.className =
      "production-map";

    map.innerHTML = `
      <div
        class="production-map-head"
      >
        <div>
          <span
            class="eyebrow"
          >
            MAPA / LOTE
          </span>

          <h3>
            ${esc(
              mapName
            )}
          </h3>
        </div>

        <span
          class="production-count"
        >
          ${mapSteps.length}
          etapas
        </span>
      </div>

      <div
        class="production-cards"
      ></div>
    `;

    const cards =
      map.querySelector(
        ".production-cards"
      );

    mapSteps.forEach(
      (step) => {
        cards.appendChild(
          createStepCard(
            step
          )
        );
      }
    );

    grid.appendChild(
      map
    );
  }

  /* =======================================================
     CARD DA ETAPA
  ======================================================= */

  function createStepCard(
    step
  ) {
    const [
      label,
      state
    ] =
      getState(step);

    const card =
      document.createElement(
        "article"
      );

    card.className =
      `production-card ${state}`;

    const person =
      step._profile
        ?.name ||
      "Sem responsável";

    const dependency =
      getDependency(
        step
      );

    card.innerHTML = `
      <div
        class="production-card-top"
      >
        <span
          class="
            production-pill
            ${state}
          "
        >
          ${label}
        </span>

        <span
          class="production-type"
        >
          ${esc(
            step.step_type ||
            "ETAPA"
          )}
        </span>
      </div>

      <h4>
        ${esc(
          step.assets
            ?.name ||
          "Asset"
        )}
      </h4>

      <div
        class="production-person"
      >
        👤 ${esc(
          person
        )}
      </div>

      <div
        class="production-time"
      >
        ${
          step.planned_date
            ? `
              📅
              ${formatDate(
                step.planned_date
              )}

              ${
                step.planned_start
                  ? `
                    •
                    ${esc(
                      step.planned_start
                    )}
                  `
                  : ""
              }

              ${
                step.planned_end
                  ? `
                    –
                    ${esc(
                      step.planned_end
                    )}
                  `
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
            <div
              class="
                production-dependency
              "
            >
              ⏳ Aguardando:

              <strong>
                ${esc(
                  dependency.assets
                    ?.name ||
                  "etapa anterior"
                )}
              </strong>
            </div>
          `
          : ""
      }

      <div
        class="production-card-actions"
      >

        <button
          type="button"
          class="production-action"
          data-open-step="${esc(
            step.id
          )}"
        >
          Ver detalhes
        </button>

        ${
          !isDone(
            step.status
          )
            ? `
              <button
                type="button"
                class="
                  production-action
                  primary
                "
                data-start-step="${esc(
                  step.id
                )}"
              >
                ${
                  isProgress(
                    step.status
                  )
                    ? "Continuar"
                    : "Iniciar"
                }
              </button>
            `
            : `
              <button
                type="button"
                class="
                  production-action
                  completed
                "
                data-reopen-step="${esc(
                  step.id
                )}"
              >
                Reabrir
              </button>
            `
        }

      </div>
    `;

    bindCardEvents(
      card,
      step
    );

    return card;
  }

  /* =======================================================
     EVENTOS DOS CARDS
  ======================================================= */

  function bindCardEvents(
    card,
    step
  ) {
    card
      .querySelector(
        "[data-open-step]"
      )
      ?.addEventListener(
        "click",
        () =>
          openStepDetails(
            step.id
          )
      );

    card
      .querySelector(
        "[data-start-step]"
      )
      ?.addEventListener(
        "click",
        () =>
          quickStatus(
            step.id,
            "Em andamento"
          )
      );

    card
      .querySelector(
        "[data-reopen-step]"
      )
      ?.addEventListener(
        "click",
        () =>
          quickStatus(
            step.id,
            "Não inicializado"
          )
      );
  }

  /* =======================================================
     MUDANÇA RÁPIDA DE STATUS
  ======================================================= */

  async function quickStatus(
    stepId,
    status
  ) {
    const step =
      steps.find(
        (item) =>
          item.id ===
          stepId
      );

    if (!step) {
      return;
    }

    if (
      status ===
      "Em andamento" &&
      !isReleased(step)
    ) {
      alert(
        "Esta etapa está bloqueada pela dependência anterior."
      );

      return;
    }

    await updateStepStatus(
      step,
      status
    );
  }

  async function updateStepStatus(
    step,
    status
  ) {
    const { error } =
      await window.sb
        .from("asset_steps")
        .update({
          status
        })
        .eq(
          "id",
          step.id
        );

    if (error) {
      console.error(
        "Erro ao alterar status:",
        error
      );

      alert(
        "Não foi possível alterar o status:\n\n" +
        error.message
      );

      return;
    }

    await logProductionActivity(
      "updated_asset_step_status",
      step.id,
      {
        asset_id:
          step.asset_id,

        step_type:
          step.step_type,

        previous_status:
          step.status,

        new_status:
          status
      }
    );

    await loadProduction();
  }

  /* =======================================================
     MODAL DE ETAPA
  ======================================================= */

  function ensureStepModal() {
    if (
      $("#productionStepModal")
    ) {
      return;
    }

    const modal =
      document.createElement(
        "div"
      );

    modal.id =
      "productionStepModal";

    modal.className =
      "modal-backdrop hidden";

    modal.innerHTML = `
      <div
        class="
          modal
          production-detail-modal
        "
      >

        <button
          type="button"
          class="close"
          id="productionStepClose"
        >
          ×
        </button>

        <div
          id="productionStepContent"
        ></div>

      </div>
    `;

    document.body.appendChild(
      modal
    );

    $("#productionStepClose")
      .addEventListener(
        "click",
        closeStepModal
      );

    modal.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          modal
        ) {
          closeStepModal();
        }
      }
    );
  }

  function openStepDetails(
    stepId
  ) {
    const step =
      steps.find(
        (item) =>
          item.id ===
          stepId
      );

    if (!step) {
      return;
    }

    ensureStepModal();

    const dependency =
      getDependency(
        step
      );

    const asset =
      step.assets ||
      {};

    const content =
      $("#productionStepContent");

    content.innerHTML = `
      <span
        class="eyebrow"
      >
        ETAPA DE PRODUÇÃO
      </span>

      <h2>
        ${esc(
          asset.name ||
          "Asset"
        )}
      </h2>

      <p
        class="detail-subtitle"
      >
        ${esc(
          step.step_type ||
          "Produção"
        )}
      </p>

      <div
        class="detail-grid"
      >

        <label
          class="full"
        >
          Status

          <select
            id="productionDetailStatus"
          >
            ${[
              "Não inicializado",
              "Em andamento",
              "Concluído",
              "Bloqueado"
            ]
              .map(
                (status) => `
                  <option
                    value="${esc(
                      status
                    )}"
                    ${
                      normalize(
                        status
                      ) ===
                      normalize(
                        step.status ||
                        "Não inicializado"
                      )
                        ? "selected"
                        : ""
                    }
                  >
                    ${esc(
                      status
                    )}
                  </option>
                `
              )
              .join("")}
          </select>
        </label>

        <label>
          Responsável

          <select
            id="productionDetailProfile"
          >
            <option
              value=""
            >
              Sem responsável
            </option>

            ${profiles
              .map(
                (p) => `
                  <option
                    value="${esc(
                      p.id
                    )}"
                    ${
                      p.id ===
                      step.assigned_to
                        ? "selected"
                        : ""
                    }
                  >
                    ${esc(
                      p.name
                    )}
                  </option>
                `
              )
              .join("")}
          </select>
        </label>

        <label>
          Data

          <input
            id="productionDetailDate"
            type="date"
            value="${esc(
              step.planned_date ||
              ""
            )}"
          >
        </label>

        <label>
          Início

          <input
            id="productionDetailStart"
            type="time"
            value="${esc(
              step.planned_start ||
              ""
            )}"
          >
        </label>

        <label>
          Fim

          <input
            id="productionDetailEnd"
            type="time"
            value="${esc(
              step.planned_end ||
              ""
            )}"
          >
        </label>

        <div
          class="
            detail-box
            full
          "
        >
          <small>
            ASSET
          </small>

          <strong>
            ${esc(
              asset.name ||
              "—"
            )}
          </strong>

          ${
            asset.map_name
              ? `
                <span>
                  Mapa:
                  ${esc(
                    asset.map_name
                  )}
                </span>
              `
              : ""
          }

          ${
            asset.project_name
              ? `
                <span>
                  Projeto:
                  ${esc(
                    asset.project_name
                  )}
                </span>
              `
              : ""
          }
        </div>

        ${
          dependency
            ? `
              <div
                class="
                  detail-box
                  full
                "
              >
                <small>
                  DEPENDÊNCIA
                </small>

                <strong>
                  ${esc(
                    dependency.assets
                      ?.name ||
                    "Etapa anterior"
                  )}
                </strong>

                <span>
                  Status:
                  ${esc(
                    dependency.status ||
                    "Não inicializado"
                  )}
                </span>

                ${
                  isDone(
                    dependency.status
                  )
                    ? `
                      <span>
                        ✓ Dependência concluída
                      </span>
                    `
                    : `
                      <span>
                        ⏳ Esta etapa precisa ser concluída antes.
                      </span>
                    `
                }
              </div>
            `
            : `
              <div
                class="
                  detail-box
                  full
                "
              >
                <small>
                  DEPENDÊNCIA
                </small>

                <strong>
                  Nenhuma
                </strong>

                <span>
                  Esta etapa pode começar livremente.
                </span>
              </div>
            `
        }

        <div
          class="
            detail-box
            full
          "
        >
          <small>
            ID DA ETAPA
          </small>

          <span>
            ${esc(
              step.id
            )}
          </span>
        </div>

      </div>

      <div
        class="actions"
      >

        <button
          type="button"
          class="ghost-btn"
          id="productionStepCancel"
        >
          Cancelar
        </button>

        <button
          type="button"
          class="primary-btn"
          id="productionStepSave"
        >
          Salvar alterações
        </button>

      </div>
    `;

    $("#productionStepCancel")
      .onclick =
      closeStepModal;

    $("#productionStepSave")
      .onclick =
      () =>
        saveStepDetails(
          step
        );

    $("#productionStepModal")
      .classList.remove(
        "hidden"
      );
  }

  function closeStepModal() {
    $("#productionStepModal")
      ?.classList.add(
        "hidden"
      );
  }

  /* =======================================================
     SALVAR ETAPA
  ======================================================= */

  async function saveStepDetails(
    step
  ) {
    const status =
      $("#productionDetailStatus")
        .value;

    /*
     * Não deixa iniciar
     * etapa bloqueada.
     */
    if (
      status ===
        "Em andamento" &&
      !isReleased(step)
    ) {
      alert(
        "Esta etapa ainda está bloqueada.\n\n" +
        "Conclua primeiro a etapa da qual ela depende."
      );

      return;
    }

    /*
     * Não deixa concluir
     * uma etapa que ainda
     * depende de outra.
     */
    if (
      status ===
        "Concluído" &&
      !isReleased(step)
    ) {
      alert(
        "Esta etapa não pode ser concluída enquanto a dependência estiver pendente."
      );

      return;
    }

    const payload = {
      status,

      assigned_to:
        $("#productionDetailProfile")
          .value ||
        null,

      planned_date:
        $("#productionDetailDate")
          .value ||
        null,

      planned_start:
        $("#productionDetailStart")
          .value ||
        null,

      planned_end:
        $("#productionDetailEnd")
          .value ||
        null
    };

    const button =
      $("#productionStepSave");

    if (button) {
      button.disabled =
        true;

      button.textContent =
        "Salvando...";
    }

    const { error } =
      await window.sb
        .from("asset_steps")
        .update(payload)
        .eq(
          "id",
          step.id
        );

    if (error) {
      console.error(
        "Erro ao salvar etapa:",
        error
      );

      alert(
        "Não foi possível salvar:\n\n" +
        error.message
      );

      if (button) {
        button.disabled =
          false;

        button.textContent =
          "Salvar alterações";
      }

      return;
    }

    await logProductionActivity(
      "updated_asset_step",
      step.id,
      {
        previous_status:
          step.status,

        new_status:
          payload.status,

        assigned_to:
          payload.assigned_to,

        planned_date:
          payload.planned_date,

        planned_start:
          payload.planned_start,

        planned_end:
          payload.planned_end
      }
    );

    closeStepModal();

    await loadProduction();

    if (
      window.refreshBithouse
    ) {
      await window.refreshBithouse();
    }
  }

  /* =======================================================
     LOG DE ATIVIDADE
  ======================================================= */

  async function logProductionActivity(
    action,
    entityId,
    metadata
  ) {
    if (
      !window.user
    ) {
      return;
    }

    const { error } =
      await window.sb
        .from(
          "activity_log"
        )
        .insert({
          /*
           * Sua tabela usa actor.
           */
          actor:
            window.user.id,

          action,

          entity_type:
            "asset_step",

          entity_id:
            entityId,

          /*
           * Sua tabela usa metadata.
           */
          metadata:
            metadata || {}
        });

    if (error) {
      console.warn(
        "Activity log:",
        error
      );
    }
  }

  /* =======================================================
     UTILITÁRIO
  ======================================================= */

  function setText(
    selector,
    value
  ) {
    const element =
      $(selector);

    if (element) {
      element.textContent =
        value;
    }
  }

  /* =======================================================
     EVENTOS
  ======================================================= */

  function initProduction() {
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

    /*
     * Canal específico da produção.
     */
    if (
      window.sb
    ) {
      window.sb
        .channel(
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
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "assets"
          },
          loadProduction
        )
        .subscribe();
    }
  }

  /*
   * O app.js chama isso
   * depois do login.
   */
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
