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

  const isDone = (status) =>
    String(status || "").toLowerCase() === "concluído";

  const formatDate = (date) => {
    if (!date) return "—";

    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit"
    }).format(new Date(date + "T12:00:00"));
  };

  let steps = [];

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

    if (isReleased(step)) {
      return ["LIBERADA", "released"];
    }

    return ["BLOQUEADA", "blocked"];
  }

  async function loadProduction() {
    if (!window.sb || !window.user) return;

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
      .order("planned_date", {
        ascending: true,
        nullsFirst: false
      })
      .order("planned_start", {
        ascending: true,
        nullsFirst: false
      });

    if (result.error) {
      console.error("Erro ao carregar produção:", result.error);

      const grid = $("#productionGrid");

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
          .map((step) => step.assigned_to)
          .filter(Boolean)
      )
    ];

    let profiles = [];

    if (profileIds.length) {
      const profileResult = await sb
        .from("profiles")
        .select("id,name,specialty,role")
        .in("id", profileIds);

      profiles = profileResult.data || [];
    }

    const profileMap = new Map(
      profiles.map((profile) => [
        profile.id,
        profile
      ])
    );

    steps.forEach((step) => {
      step._profile = profileMap.get(step.assigned_to);
    });

    buildMapFilter();
    renderProduction();
  }

  function buildMapFilter() {
    const select = $("#productionFilter");

    if (!select) return;

    const currentValue = select.value || "TODAS";

    const mapIds = [
      ...new Set(
        steps
          .map((step) => step.assets?.map_id)
          .filter(Boolean)
      )
    ];

    select.innerHTML =
      '<option value="TODAS">Todos os mapas</option>';

    mapIds.forEach((mapId) => {
      const mapSteps = steps.filter(
        (step) => step.assets?.map_id === mapId
      );

      const mapName =
        mapSteps
          .map((step) => step.assets?.map_name)
          .find(Boolean) || mapId;

      select.innerHTML += `
        <option value="${esc(mapId)}">
          ${esc(mapName)}
        </option>
      `;
    });

    if (
      [...select.options].some(
        (option) => option.value === currentValue
      )
    ) {
      select.value = currentValue;
    }
  }

  function renderProduction() {
    const filter =
      $("#productionFilter")?.value || "TODAS";

    const visibleSteps = steps.filter(
      (step) =>
        filter === "TODAS" ||
        step.assets?.map_id === filter
    );

    const activeSteps = visibleSteps.filter(
      (step) => !isDone(step.status)
    );

    $("#productionTotal").textContent =
      visibleSteps.length;

    $("#productionReleased").textContent =
      activeSteps.filter(isReleased).length;

    $("#productionBlocked").textContent =
      activeSteps.filter(
        (step) => !isReleased(step)
      ).length;

    $("#productionCompleted").textContent =
      visibleSteps.filter(
        (step) => isDone(step.status)
      ).length;

    $("#myProductionCount").textContent =
      activeSteps.filter(
        (step) =>
          step.assigned_to === window.user?.id
      ).length;

    const grid = $("#productionGrid");

    if (!grid) return;

    grid.innerHTML = "";

    if (!visibleSteps.length) {
      grid.innerHTML =
        '<div class="production-empty">Nenhuma etapa encontrada.</div>';

      return;
    }

    const groups = new Map();

    visibleSteps.forEach((step) => {
      const key =
        step.assets?.map_id || "SEM_MAPA";

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(step);
    });

    groups.forEach((mapSteps) => {
      const first = mapSteps[0];

      const mapName =
        first.assets?.map_name ||
        first.assets?.project_name ||
        "Sem mapa";

      const mapElement =
        document.createElement("div");

      mapElement.className =
        "production-map";

      mapElement.innerHTML = `
        <div class="production-map-head">
          <div>
            <span class="eyebrow">MAPA / LOTE</span>
            <h3>${esc(mapName)}</h3>
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

      mapSteps.forEach((step) => {
        const [stateLabel, stateClass] =
          getState(step);

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
          document.createElement("article");

        card.className =
          "production-card";

        card.innerHTML = `
          <div class="production-card-top">
            <span class="production-pill ${stateClass}">
              ${stateLabel}
            </span>

            <span class="production-type">
              ${esc(step.step_type)}
            </span>
          </div>

          <h4>
            ${esc(step.assets?.name || "Asset")}
          </h4>

          <div class="production-person">
            👤 ${esc(person)}
          </div>

          <div class="production-time">
            ${
              step.planned_date
                ? `📅 ${formatDate(step.planned_date)}
                   • ${esc(step.planned_start || "")}
                   –${esc(step.planned_end || "")}`
                : "Sem horário"
            }
          </div>

          ${
            dependency &&
            !isDone(dependency.status)
              ? `
                <div class="production-dependency">
                  ⏳ Aguardando
                  ${esc(
                    dependency.assets?.name ||
                    "etapa anterior"
                  )}
                  — ${esc(
                    dependency.step_type
                  )}
                </div>
              `
              : ""
          }
        `;

        cards.appendChild(card);
      });

      grid.appendChild(mapElement);
    });
  }

  function initProduction() {
    $("#productionFilter")?.addEventListener(
      "change",
      renderProduction
    );

    $("#productionRefresh")?.addEventListener(
      "click",
      loadProduction
    );

    loadProduction();

    if (window.sb) {
      sb.channel("bithouse-production-live")
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

  window.loadProduction = loadProduction;

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initProduction
    );
  } else {
    initProduction();
  }
})();
