/* =========================================================
   BITHOUSE — APP CORE
   Agenda / Comissões / Equipe / Realtime
   Versão interativa e preparada para expansão
========================================================= */

(function () {
  "use strict";

  const { createClient } = window.supabase;

  const sb = createClient(
    window.BITHOUSE_SUPABASE_URL,
    window.BITHOUSE_SUPABASE_KEY
  );

  window.sb = sb;

  let user = null;
  let profile = null;
  let weekStart = monday(new Date());
  let channel = null;

  let appData = {
    commissions: [],
    agenda: [],
    tasks: [],
    profiles: []
  };

  let selectedAgendaItem = null;
  let selectedCommission = null;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));

  const normalize = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  function monday(date) {
    const d = new Date(date);
    const day = d.getDay();

    d.setDate(
      d.getDate() +
      (day === 0 ? -6 : 1 - day)
    );

    d.setHours(12, 0, 0, 0);

    return d;
  }

  function add(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function iso(date) {
    const d = new Date(date);
    return d.toISOString().slice(0, 10);
  }

  function fmt(date) {
    if (!date) return "—";

    const value =
      String(date).length === 10
        ? date + "T12:00:00"
        : date;

    return new Intl.DateTimeFormat(
      "pt-BR",
      {
        day: "2-digit",
        month: "2-digit"
      }
    ).format(new Date(value));
  }

  function fmtLong(date) {
    if (!date) return "—";

    return new Intl.DateTimeFormat(
      "pt-BR",
      {
        day: "2-digit",
        month: "long",
        year: "numeric"
      }
    ).format(
      new Date(date + "T12:00:00")
    );
  }

  function num(value) {
    return Number(value || 0);
  }

  function hours(value) {
    return num(value).toFixed(1);
  }

  function capacity(p) {
    return (
      num(p?.hours_per_day) *
      num(p?.days_per_week) *
      0.8
    );
  }

  /* =======================================================
     STATUS
  ======================================================= */

  function normalizeAgendaStatus(status) {
    const s = normalize(status);

    if (s === "concluido") {
      return "Concluído";
    }

    if (s === "em andamento") {
      return "Em andamento";
    }

    if (s === "bloqueado") {
      return "Bloqueado";
    }

    if (
      s === "nao inicializado" ||
      s === "nao iniciado" ||
      s === "não inicializado" ||
      s === "não iniciado"
    ) {
      return "Não inicializado";
    }

    return "Não inicializado";
  }

  function statusClass(status) {
    const s = normalize(status);

    if (s === "concluido") {
      return "done";
    }

    if (s === "em andamento") {
      return "progress";
    }

    if (s === "bloqueado") {
      return "blocked";
    }

    if (s === "cancelado") {
      return "cancelled";
    }

    if (s === "pausado") {
      return "paused";
    }

    return "not-started";
  }

  function statusLabel(status) {
    return status || "Não inicializado";
  }

  function commissionStatusClass(status) {
    return statusClass(status);
  }

  /* =======================================================
     AUTENTICAÇÃO
  ======================================================= */

  async function boot() {
    try {
      const {
        data: { session }
      } = await sb.auth.getSession();

      if (session) {
        user = session.user;
        await enter();
      } else {
        showLogin();
      }

      sb.auth.onAuthStateChange(
        async (_, session) => {
          if (session) {
            user = session.user;
            await enter();
          } else {
            user = null;
            profile = null;
            showLogin();
          }
        }
      );
    } catch (error) {
      console.error(
        "Erro no boot:",
        error
      );

      showLogin();
    }
  }

  function showLogin() {
    $("#login")?.classList.remove(
      "hidden"
    );

    $("#app")?.classList.add(
      "hidden"
    );
  }

  async function enter() {
    $("#login")?.classList.add(
      "hidden"
    );

    $("#app")?.classList.remove(
      "hidden"
    );

    window.user = user;

    let {
      data: p,
      error
    } = await sb
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error(
        "Erro ao buscar perfil:",
        error
      );
    }

    if (!p) {
      const created =
        await sb
          .from("profiles")
          .upsert({
            id: user.id,
            name:
              user.email?.split("@")[0] ||
              "Membro"
          });

      if (created.error) {
        console.error(
          "Erro ao criar perfil:",
          created.error
        );
      }

      const result =
        await sb
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

      p = result.data;
    }

    profile = p;
    window.profile = profile;

    if ($("#userName")) {
      $("#userName").textContent =
        p?.name ||
        user.email ||
        "Membro";
    }

    ensureDetailModal();

    subscribe();

    await refresh();

    if (window.loadProduction) {
      window.loadProduction();
    }
  }

  /* =======================================================
     REALTIME
  ======================================================= */

  function subscribe() {
    if (channel) {
      sb.removeChannel(channel);
    }

    channel = sb
      .channel("bithouse-live")

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "commissions"
        },
        refresh
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agenda_items"
        },
        refresh
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks"
        },
        refresh
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles"
        },
        refresh
      )

      .subscribe((state) => {
        const sync =
          $("#syncState");

        if (!sync) return;

        sync.textContent =
          state === "SUBSCRIBED"
            ? "● sincronizado"
            : "● conectando...";
      });
  }

  /* =======================================================
     DADOS
  ======================================================= */

  async function loadData() {
    const [
      commissionsResult,
      agendaResult,
      tasksResult,
      profilesResult
    ] = await Promise.all([

      sb
        .from("commissions")
        .select(`
          *,
          owner:profiles!commissions_owner_id_fkey(
            id,
            name,
            specialty,
            role
          )
        `)
        .order(
          "created_at",
          {
            ascending: false
          }
        ),

      sb
        .from("agenda_items")
        .select(`
          *,
          commission:commissions(*),
          profile:profiles(
            id,
            name,
            specialty,
            role
          )
        `)
        .order(
          "date",
          {
            ascending: true
          }
        ),

      sb
        .from("tasks")
        .select("*"),

      /*
       * NÃO usamos .eq("active", true)
       * porque a sua tabela profiles
       * pode não possuir essa coluna.
       */
      sb
        .from("profiles")
        .select("*")
        .order("name")
    ]);

    if (commissionsResult.error) {
      console.error(
        "Comissões:",
        commissionsResult.error
      );
    }

    if (agendaResult.error) {
      console.error(
        "Agenda:",
        agendaResult.error
      );
    }

    if (tasksResult.error) {
      console.error(
        "Tasks:",
        tasksResult.error
      );
    }

    if (profilesResult.error) {
      console.error(
        "Profiles:",
        profilesResult.error
      );
    }

    return {
      commissions:
        commissionsResult.data || [],

      agenda:
        agendaResult.data || [],

      tasks:
        tasksResult.data || [],

      profiles:
        profilesResult.data || []
    };
  }

  async function refresh() {
    if (!user) return;

    try {
      appData =
        await loadData();

      render(appData);
    } catch (error) {
      console.error(
        "Erro ao atualizar:",
        error
      );
    }
  }

  /* =======================================================
     RENDER PRINCIPAL
  ======================================================= */

  function render(data) {
    renderStats(data);
    renderAgenda(data);
    renderCommissions(data);
    renderTeam(data);
  }

  function renderStats(data) {
    const active =
      data.commissions.filter(
        (c) =>
          ![
            "Concluído",
            "Cancelado"
          ].includes(c.status)
      );

    const high =
      active.filter(
        (c) =>
          c.priority === "Alta"
      );

    const pendingTasks =
      data.tasks.filter(
        (t) =>
          normalize(t.status) !==
          "concluido"
      );

    const owners =
      data.commissions.filter(
        (c) => c.owner_id
      );

    const totalCapacity =
      data.profiles.reduce(
        (sum, p) =>
          sum + capacity(p),
        0
      );

    const committed =
      data.agenda
        .filter(
          (item) =>
            normalizeAgendaStatus(
              item.status
            ) !== "Concluído"
        )
        .reduce(
          (sum, item) =>
            sum + num(item.hours),
          0
        );

    const percentage =
      totalCapacity
        ? Math.min(
            1,
            committed /
              totalCapacity
          )
        : 0;

    if ($("#activeCount")) {
      $("#activeCount")
        .textContent =
        active.length;
    }

    if ($("#highCount")) {
      $("#highCount")
        .textContent =
        high.length;
    }

    if ($("#taskCount")) {
      $("#taskCount")
        .textContent =
        pendingTasks.length;
    }

    if ($("#ownerCount")) {
      $("#ownerCount")
        .textContent =
        owners.length;
    }

    if ($("#capacityPct")) {
      $("#capacityPct")
        .textContent =
        Math.round(
          percentage * 100
        ) + "%";
    }

    if ($("#capacityBar")) {
      $("#capacityBar")
        .style.width =
        percentage * 100 +
        "%";
    }

    const free =
      Math.max(
        0,
        totalCapacity -
          committed
      );

    if ($("#committed")) {
      $("#committed")
        .textContent =
        hours(committed) +
        "h";
    }

    if ($("#free")) {
      $("#free")
        .textContent =
        hours(free) +
        "h";
    }

    if ($("#freePreview")) {
      $("#freePreview")
        .textContent =
        hours(free) +
        "h";
    }
  }

  /* =======================================================
     AGENDA
  ======================================================= */

  function renderAgenda(data) {
    const grid =
      $("#agendaGrid");

    if (!grid) return;

    if ($("#weekTitle")) {
      $("#weekTitle")
        .textContent =
        `${fmt(
          iso(weekStart)
        )} — ${fmt(
          iso(
            add(
              weekStart,
              5
            )
          )
        )}`;
    }

    grid.innerHTML = "";

    const dayNames = [
      "SEG",
      "TER",
      "QUA",
      "QUI",
      "SEX",
      "SÁB"
    ];

    for (
      let i = 0;
      i < 6;
      i++
    ) {
      const date =
        add(
          weekStart,
          i
        );

      const key =
        iso(date);

      const items =
        data.agenda
          .filter(
            (item) =>
              item.date === key
          )
          .sort(
            (a, b) =>
              num(b.hours) -
              num(a.hours)
          );

      const day =
        document.createElement(
          "div"
        );

      day.className =
        "day";

      day.innerHTML = `
        <div class="day-head">
          <span>
            ${dayNames[i]}
          </span>

          <small>
            ${fmt(key)}
          </small>
        </div>
      `;

      if (!items.length) {
        day.innerHTML += `
          <div
            class="muted"
            style="padding:16px"
          >
            Dia livre ✨
          </div>
        `;
      }

      items.forEach(
        (item) => {
          const status =
            normalizeAgendaStatus(
              item.status
            );

          const commission =
            item.commission;

          const person =
            item.profile?.name ||
            item.collaborator_name ||
            "Equipe";

          const el =
            document.createElement(
              "button"
            );

          el.type =
            "button";

          el.className =
            `item agenda-item ${statusClass(
              status
            )}`;

          el.innerHTML = `
            <span
              class="agenda-item-status"
            >
              ${esc(
                statusLabel(
                  status
                )
              )}
            </span>

            <b>
              ${esc(
                commission?.name ||
                "Comissão"
              )}
            </b>

            <small>
              ${esc(person)}
              •
              ${esc(
                item.task ||
                "Produção"
              )}
            </small>

            <small>
              <strong>
                ${hours(
                  item.hours
                )}h
              </strong>

              ${
                item.updated_at
                  ? " • atualizado"
                  : ""
              }
            </small>
          `;

          el.addEventListener(
            "click",
            () =>
              openAgendaDetails(
                item.id
              )
          );

          day.appendChild(
            el
          );
        }
      );

      grid.appendChild(day);
    }
  }

  /* =======================================================
     COMISSÕES
  ======================================================= */

  function renderCommissions(data) {
    const grid =
      $("#commissionGrid");

    if (!grid) return;

    grid.innerHTML = "";

    data.commissions.forEach(
      (commission) => {
        const items =
          data.agenda.filter(
            (item) =>
              item.commission_id ===
              commission.id
          );

        const totalHours =
          items.reduce(
            (sum, item) =>
              sum +
              num(item.hours),
            0
          );

        const doneHours =
          items
            .filter(
              (item) =>
                normalizeAgendaStatus(
                  item.status
                ) ===
                "Concluído"
            )
            .reduce(
              (sum, item) =>
                sum +
                num(item.hours),
              0
            );

        const progress =
          totalHours > 0
            ? Math.min(
                1,
                doneHours /
                  totalHours
              )
            : num(
                commission.progress
              );

        const el =
          document.createElement(
            "article"
          );

        el.className =
          "card commission-card";

        el.tabIndex = 0;

        el.innerHTML = `
          <span
            class="badge ${
              commission.priority ===
              "Alta"
                ? "high"
                : ""
            }"
          >
            ${esc(
              commission.priority ||
              "Média"
            )}
          </span>

          <span
            class="commission-status ${commissionStatusClass(
              commission.status
            )}"
          >
            ${esc(
              commission.status ||
              "Planejamento"
            )}
          </span>

          <h3>
            ${esc(
              commission.name
            )}
          </h3>

          <div class="muted">
            ${esc(
              commission.client ||
              "Cliente não informado"
            )}
          </div>

          <div class="bar">
            <span
              style="
                width:${progress * 100}%
              "
            ></span>
          </div>

          <div class="meta">

            <div>
              <small>
                Responsável
              </small>

              <b>
                ${esc(
                  commission.owner
                    ?.name ||
                  "Sem responsável"
                )}
              </b>
            </div>

            <div>
              <small>
                Horas
              </small>

              <b>
                ${hours(
                  totalHours
                )}h
              </b>
            </div>

            <div>
              <small>
                Prazo
              </small>

              <b>
                ${
                  commission.deadline
                    ? fmt(
                        commission.deadline
                      )
                    : "—"
                }
              </b>
            </div>

            <div>
              <small>
                Mapa
              </small>

              <b>
                ${esc(
                  commission.map_name ||
                  "—"
                )}
              </b>
            </div>

          </div>

          <div class="card-hint">
            Clique para abrir detalhes →
          </div>
        `;

        el.addEventListener(
          "click",
          () =>
            openCommissionDetails(
              commission.id
            )
        );

        grid.appendChild(el);
      }
    );
  }

  /* =======================================================
     EQUIPE
  ======================================================= */

  function renderTeam(data) {
    const grid =
      $("#teamGrid");

    if (!grid) return;

    grid.innerHTML = "";

    data.profiles.forEach(
      (p) => {
        const owned =
          data.commissions.filter(
            (c) =>
              c.owner_id ===
              p.id
          );

        const used =
          data.agenda
            .filter(
              (item) =>
                item.profile_id ===
                  p.id &&
                normalizeAgendaStatus(
                  item.status
                ) !==
                  "Concluído"
            )
            .reduce(
              (sum, item) =>
                sum +
                num(item.hours),
              0
            );

        const total =
          capacity(p);

        const available =
          Math.max(
            0,
            total - used
          );

        const pct =
          total
            ? Math.min(
                1,
                used / total
              )
            : 0;

        const el =
          document.createElement(
            "article"
          );

        el.className =
          "card";

        el.innerHTML = `
          <h3>
            ${esc(
              p.name
            )}
          </h3>

          <div class="muted">
            ${esc(
              p.specialty ||
              p.role ||
              "Equipe"
            )}
          </div>

          <div
            style="
              font:
                800 30px
                'Space Grotesk';
              margin-top:12px
            "
          >
            ${hours(
              available
            )}h

            <span class="muted">
              livres
            </span>
          </div>

          <div class="bar">
            <span
              style="
                width:${pct * 100}%
              "
            ></span>
          </div>

          <div class="muted">
            ${owned.length}
            comissão(ões)
            como responsável
            •
            ${hours(
              used
            )}h comprometidas
          </div>
        `;

        grid.appendChild(
          el
        );
      }
    );
  }

  /* =======================================================
     MODAL DE DETALHES
  ======================================================= */

  function ensureDetailModal() {
    if ($("#detailModal")) {
      return;
    }

    const backdrop =
      document.createElement(
        "div"
      );

    backdrop.id =
      "detailModal";

    backdrop.className =
      "modal-backdrop hidden";

    backdrop.innerHTML = `
      <div
        class="
          modal
          detail-modal
        "
      >
        <button
          class="close"
          id="detailClose"
          type="button"
        >
          ×
        </button>

        <div
          id="detailContent"
        ></div>
      </div>
    `;

    document.body.appendChild(
      backdrop
    );

    $("#detailClose")
      .addEventListener(
        "click",
        closeDetailModal
      );

    backdrop.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          backdrop
        ) {
          closeDetailModal();
        }
      }
    );
  }

  function openDetailModal(
    html
  ) {
    ensureDetailModal();

    $("#detailContent")
      .innerHTML = html;

    $("#detailModal")
      .classList.remove(
        "hidden"
      );
  }

  function closeDetailModal() {
    $("#detailModal")
      ?.classList.add(
        "hidden"
      );

    selectedAgendaItem =
      null;

    selectedCommission =
      null;
  }

  /* =======================================================
     AGENDA — DETALHES
  ======================================================= */

  function openAgendaDetails(
    id
  ) {
    const item =
      appData.agenda.find(
        (agendaItem) =>
          agendaItem.id === id
      );

    if (!item) return;

    selectedAgendaItem =
      item;

    const commission =
      item.commission;

    const task =
      item.task_id
        ? appData.tasks.find(
            (t) =>
              t.id ===
              item.task_id
          )
        : null;

    const status =
      normalizeAgendaStatus(
        item.status
      );

    const people =
      appData.profiles;

    openDetailModal(`
      <span class="eyebrow">
        ITEM DA AGENDA
      </span>

      <h2>
        ${esc(
          commission?.name ||
          "Produção"
        )}
      </h2>

      <div
        class="detail-subtitle"
      >
        ${esc(
          item.task ||
          "Produção"
        )}
      </div>

      <div
        class="detail-grid"
      >

        <label>
          Status

          <select
            id="detailAgendaStatus"
          >
            ${[
              "Não inicializado",
              "Em andamento",
              "Concluído",
              "Bloqueado"
            ]
              .map(
                (s) => `
                  <option
                    value="${esc(s)}"
                    ${
                      s === status
                        ? "selected"
                        : ""
                    }
                  >
                    ${esc(s)}
                  </option>
                `
              )
              .join("")}
          </select>
        </label>

        <label>
          Responsável

          <select
            id="detailAgendaProfile"
          >
            <option value="">
              Equipe / não definido
            </option>

            ${people
              .map(
                (p) => `
                  <option
                    value="${esc(
                      p.id
                    )}"
                    ${
                      p.id ===
                      item.profile_id
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
            id="detailAgendaDate"
            type="date"
            value="${esc(
              item.date || ""
            )}"
          >
        </label>

        <label>
          Horas

          <input
            id="detailAgendaHours"
            type="number"
            min="0"
            step="0.5"
            value="${esc(
              item.hours || 0
            )}"
          >
        </label>

        <label
          class="full"
        >
          O que precisa fazer

          <input
            id="detailAgendaTask"
            value="${esc(
              item.task || ""
            )}"
            placeholder="
              Descreva exatamente
              o que precisa ser feito
            "
          >
        </label>

        <div
          class="
            detail-box
            full
          "
        >
          <small>
            COMISSÃO
          </small>

          <strong>
            ${esc(
              commission?.name ||
              "—"
            )}
          </strong>

          ${
            commission?.client
              ? `
                <span>
                  Cliente:
                  ${esc(
                    commission.client
                  )}
                </span>
              `
              : ""
          }

          ${
            commission?.map_name
              ? `
                <span>
                  Mapa:
                  ${esc(
                    commission.map_name
                  )}
                </span>
              `
              : ""
          }

          ${
            commission?.deadline
              ? `
                <span>
                  Prazo:
                  ${fmtLong(
                    commission.deadline
                  )}
                </span>
              `
              : ""
          }
        </div>

        ${
          task
            ? `
              <div
                class="
                  detail-box
                  full
                "
              >
                <small>
                  TAREFA RELACIONADA
                </small>

                <strong>
                  ${esc(
                    task.title ||
                    "Tarefa"
                  )}
                </strong>

                <span>
                  Status:
                  ${esc(
                    task.status ||
                    "Pendente"
                  )}
                </span>

                ${
                  task.notes
                    ? `
                      <span>
                        ${esc(
                          task.notes
                        )}
                      </span>
                    `
                    : ""
                }
              </div>
            `
            : ""
        }

      </div>

      <div
        class="actions"
      >
        <button
          class="ghost-btn"
          id="detailCancel"
          type="button"
        >
          Cancelar
        </button>

        <button
          class="primary-btn"
          id="detailSave"
          type="button"
        >
          Salvar alterações
        </button>
      </div>
    `);

    $("#detailCancel")
      .onclick =
      closeDetailModal;

    $("#detailSave")
      .onclick =
      saveAgendaDetails;
  }

  /* =======================================================
     SALVAR AGENDA
  ======================================================= */

  async function saveAgendaDetails() {
    if (!selectedAgendaItem) {
      return;
    }

    const item =
      selectedAgendaItem;

    const payload = {
      status:
        $("#detailAgendaStatus")
          .value,

      profile_id:
        $("#detailAgendaProfile")
          .value ||
        null,

      date:
        $("#detailAgendaDate")
          .value,

      hours:
        num(
          $("#detailAgendaHours")
            .value
        ),

      task:
        $("#detailAgendaTask")
          .value
          .trim()
    };

    const button =
      $("#detailSave");

    if (button) {
      button.disabled =
        true;

      button.textContent =
        "Salvando...";
    }

    const { error } =
      await sb
        .from("agenda_items")
        .update(payload)
        .eq(
          "id",
          item.id
        );

    if (error) {
      console.error(
        "Erro ao atualizar agenda:",
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

    await logActivity(
      "updated_agenda_item",
      "agenda_item",
      item.id,
      payload
    );

    closeDetailModal();

    await refresh();
  }

  /* =======================================================
     COMISSÃO — DETALHES
  ======================================================= */

  function openCommissionDetails(
    id
  ) {
    const commission =
      appData.commissions.find(
        (c) =>
          c.id === id
      );

    if (!commission) {
      return;
    }

    selectedCommission =
      commission;

    const members =
      appData.agenda.filter(
        (item) =>
          item.commission_id ===
          commission.id
      );

    const total =
      members.reduce(
        (sum, item) =>
          sum +
          num(item.hours),
        0
      );

    const completed =
      members.filter(
        (item) =>
          normalizeAgendaStatus(
            item.status
          ) ===
          "Concluído"
      ).length;

    openDetailModal(`
      <span class="eyebrow">
        COMISSÃO
      </span>

      <h2>
        ${esc(
          commission.name
        )}
      </h2>

      <div
        class="detail-grid"
      >

        <label>
          Nome

          <input
            id="detailCommissionName"
            value="${esc(
              commission.name
            )}"
          >
        </label>

        <label>
          Cliente

          <input
            id="detailCommissionClient"
            value="${esc(
              commission.client ||
              ""
            )}"
          >
        </label>

        <label>
          Status

          <select
            id="detailCommissionStatus"
          >
            ${[
              "Planejamento",
              "Em andamento",
              "Concluído",
              "Pausado",
              "Cancelado"
            ]
              .map(
                (s) => `
                  <option
                    value="${esc(s)}"
                    ${
                      s ===
                      commission.status
                        ? "selected"
                        : ""
                    }
                  >
                    ${esc(s)}
                  </option>
                `
              )
              .join("")}
          </select>
        </label>

        <label>
          Prioridade

          <select
            id="detailCommissionPriority"
          >
            ${[
              "Alta",
              "Média",
              "Baixa"
            ]
              .map(
                (s) => `
                  <option
                    value="${esc(s)}"
                    ${
                      s ===
                      commission.priority
                        ? "selected"
                        : ""
                    }
                  >
                    ${esc(s)}
                  </option>
                `
              )
              .join("")}
          </select>
        </label>

        <label>
          Responsável

          <select
            id="detailCommissionOwner"
          >
            <option value="">
              Sem responsável
            </option>

            ${appData.profiles
              .map(
                (p) => `
                  <option
                    value="${esc(
                      p.id
                    )}"
                    ${
                      p.id ===
                      commission.owner_id
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
          Mapa / lote

          <input
            id="detailCommissionMap"
            value="${esc(
              commission.map_name ||
              ""
            )}"
          >
        </label>

        <label>
          Início

          <input
            id="detailCommissionStart"
            type="date"
            value="${esc(
              commission.start_date ||
              ""
            )}"
          >
        </label>

        <label>
          Prazo

          <input
            id="detailCommissionDeadline"
            type="date"
            value="${esc(
              commission.deadline ||
              ""
            )}"
          >
        </label>

        <label>
          Progresso

          <input
            id="detailCommissionProgress"
            type="number"
            min="0"
            max="100"
            step="1"
            value="${Math.round(
              num(
                commission.progress
              ) * 100
            )}"
          >
        </label>

        <label
          class="full"
        >
          Observações

          <textarea
            id="detailCommissionNotes"
            rows="5"
            placeholder="
              Notas, referências,
              regras do cliente,
              dependências...
            "
          >${esc(
            commission.notes ||
            ""
          )}</textarea>
        </label>

        <div
          class="
            detail-box
            full
          "
        >
          <small>
            RESUMO DE PRODUÇÃO
          </small>

          <strong>
            ${hours(
              total
            )}h agendadas
          </strong>

          <span>
            ${completed}
            item(ns)
            concluído(s)
          </span>

          <span>
            ${members.length}
            item(ns)
            na agenda
          </span>
        </div>

      </div>

      <div
        class="actions"
      >
        <button
          class="ghost-btn"
          id="detailCancel"
          type="button"
        >
          Cancelar
        </button>

        <button
          class="primary-btn"
          id="detailSave"
          type="button"
        >
          Salvar comissão
        </button>
      </div>
    `);

    $("#detailCancel")
      .onclick =
      closeDetailModal;

    $("#detailSave")
      .onclick =
      saveCommissionDetails;
  }

  /* =======================================================
     SALVAR COMISSÃO
  ======================================================= */

  async function saveCommissionDetails() {
    if (!selectedCommission) {
      return;
    }

    const c =
      selectedCommission;

    const percentage =
      Math.max(
        0,
        Math.min(
          100,
          num(
            $("#detailCommissionProgress")
              .value
          )
        )
      );

    const payload = {
      name:
        $("#detailCommissionName")
          .value
          .trim(),

      client:
        $("#detailCommissionClient")
          .value
          .trim() ||
        null,

      status:
        $("#detailCommissionStatus")
          .value,

      priority:
        $("#detailCommissionPriority")
          .value,

      owner_id:
        $("#detailCommissionOwner")
          .value ||
        null,

      map_name:
        $("#detailCommissionMap")
          .value
          .trim() ||
        null,

      start_date:
        $("#detailCommissionStart")
          .value ||
        null,

      deadline:
        $("#detailCommissionDeadline")
          .value ||
        null,

      progress:
        percentage / 100,

      notes:
        $("#detailCommissionNotes")
          .value
          .trim() ||
        null
    };

    const button =
      $("#detailSave");

    if (button) {
      button.disabled =
        true;

      button.textContent =
        "Salvando...";
    }

    const { error } =
      await sb
        .from("commissions")
        .update(payload)
        .eq(
          "id",
          c.id
        );

    if (error) {
      console.error(
        "Erro ao atualizar comissão:",
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
          "Salvar comissão";
      }

      return;
    }

    await logActivity(
      "updated_commission",
      "commission",
      c.id,
      payload
    );

    closeDetailModal();

    await refresh();
  }

  /* =======================================================
     ATIVIDADE
  ======================================================= */

  async function logActivity(
    action,
    entityType,
    entityId,
    details
  ) {
    if (!user) {
      return;
    }

    const { error } =
      await sb
        .from("activity_log")
        .insert({
          /*
           * IMPORTANTE:
           * Sua tabela usa "actor",
           * não "actor_id".
           */
          actor: user.id,

          action,

          entity_type:
            entityType,

          entity_id:
            entityId,

          /*
           * Sua tabela usa "metadata",
           * não "details".
           */
          metadata:
            details || {}
        });

    if (error) {
      console.warn(
        "Activity log:",
        error
      );
    }
  }

  /* =======================================================
     NOVA COMISSÃO
  ======================================================= */

  function openNewCommission() {
    $("#modal")
      ?.classList.remove(
        "hidden"
      );

    if (
      $("#start") &&
      !$("#start").value
    ) {
      $("#start").value =
        iso(new Date());
    }

    fillOwnerOptions();

    preview();
  }

  function fillOwnerOptions() {
    const select =
      $("#owner");

    if (!select) {
      return;
    }

    const current =
      select.value;

    select.innerHTML = `
      <option value="">
        Selecionar
      </option>

      ${appData.profiles
        .map(
          (p) => `
            <option
              value="${esc(
                p.name
              )}"
            >
              ${esc(
                p.name
              )}
            </option>
          `
        )
        .join("")}
    `;

    if (current) {
      select.value =
        current;
    }
  }

  function closeNewCommission() {
    $("#modal")
      ?.classList.add(
        "hidden"
      );
  }

  function preview() {
    const total =
      [
        "hs",
        "hm",
        "hb"
      ].reduce(
        (sum, id) =>
          sum +
          num(
            $("#" + id)
              ?.value
          ),
        0
      );

    if ($("#total")) {
      $("#total")
        .textContent =
        hours(total) +
        "h";
    }

    const currentCommitted =
      appData.agenda.reduce(
        (sum, item) =>
          sum +
          num(item.hours),
        0
      );

    const totalCapacity =
      appData.profiles.reduce(
        (sum, p) =>
          sum +
          capacity(p),
        0
      );

    const free =
      Math.max(
        0,
        totalCapacity -
          currentCommitted -
          total
      );

    if ($("#freePreview")) {
      $("#freePreview")
        .textContent =
        hours(free) +
        "h";
    }

    if ($("#verdict")) {
      $("#verdict")
        .textContent =
        total
          ? "A agenda será montada por pessoa."
          : "Preencha as horas";
    }
  }

  /* =======================================================
     CRIAR COMISSÃO
  ======================================================= */

  async function createCommission(
    event
  ) {
    event.preventDefault();

    if (!user) {
      return;
    }

    const payload = {
      name:
        $("#name")
          .value
          .trim(),

      client:
        $("#client")
          .value
          .trim() ||
        null,

      priority:
        $("#priority")
          .value,

      status:
        "Planejamento",

      progress:
        0,

      owner_id:
        null,

      start_date:
        $("#start")
          .value ||
        null,

      deadline:
        $("#deadline")
          .value ||
        null,

      map_name:
        $("#map")
          .value
          .trim() ||
        null,

      notes:
        null,

      created_by:
        user.id
    };

    const ownerName =
      $("#owner").value;

    if (ownerName) {
      const owner =
        appData.profiles.find(
          (p) =>
            p.name ===
            ownerName
        );

      payload.owner_id =
        owner?.id ||
        null;
    }

    const saveButton =
      $("#form button[type='submit']");

    if (saveButton) {
      saveButton.disabled =
        true;

      saveButton.textContent =
        "Salvando...";
    }

    const {
      data: commission,
      error
    } = await sb
      .from("commissions")
      .insert(payload)
      .select()
      .single();

    if (error) {
      alert(
        error.message
      );

      if (saveButton) {
        saveButton.disabled =
          false;

        saveButton.textContent =
          "Salvar + montar agenda";
      }

      return;
    }

    const people = {
      Selenne:
        num(
          $("#hs").value
        ),

      Midas:
        num(
          $("#hm").value
        ),

      Biell:
        num(
          $("#hb").value
        )
    };

    const names =
      Object.keys(
        people
      ).filter(
        (name) =>
          people[name] > 0
      );

    const profiles =
      appData.profiles.filter(
        (p) =>
          names.includes(
            p.name
          )
      );

    const rows = [];

    for (
      const p of profiles
    ) {
      let remaining =
        people[p.name];

      let day =
        new Date(
          (
            payload.start_date ||
            iso(new Date())
          ) +
          "T12:00:00"
        );

      let guard = 0;

      while (
        remaining > 0 &&
        guard < 365
      ) {
        const weekday =
          day.getDay();

        /*
         * Domingo = 0.
         */
        if (weekday !== 0) {
          const dailyCapacity =
            num(
              p.hours_per_day
            ) * 0.8;

          const date =
            iso(day);

          const existingResult =
            await sb
              .from(
                "agenda_items"
              )
              .select("hours")
              .eq(
                "profile_id",
                p.id
              )
              .eq(
                "date",
                date
              );

          const existing =
            existingResult.data ||
            [];

          const used =
            existing.reduce(
              (sum, item) =>
                sum +
                num(item.hours),
              0
            );

          const room =
            Math.max(
              0,
              dailyCapacity -
                used
            );

          const put =
            Math.min(
              remaining,
              room
            );

          if (put > 0) {
            rows.push({
              commission_id:
                commission.id,

              profile_id:
                p.id,

              date,

              task:
                "Produção",

              hours:
                put,

              status:
                "Não inicializado"
            });

            remaining -= put;
          }
        }

        day =
          add(
            day,
            1
          );

        guard++;
      }
    }

    if (rows.length) {
      const agendaInsert =
        await sb
          .from(
            "agenda_items"
          )
          .insert(rows);

      if (agendaInsert.error) {
        console.error(
          "Erro ao montar agenda:",
          agendaInsert.error
        );
      }
    }

    await logActivity(
      "created_commission",
      "commission",
      commission.id,
      {
        hours: people
      }
    );

    closeNewCommission();

    $("#form").reset();

    await refresh();

    location.hash =
      "#agenda";

    if (saveButton) {
      saveButton.disabled =
        false;

      saveButton.textContent =
        "Salvar + montar agenda";
    }
  }

  /* =======================================================
     EVENTOS
  ======================================================= */

  function bindEvents() {

    $("#newBtn")
      ?.addEventListener(
        "click",
        openNewCommission
      );

    $("#newBtn2")
      ?.addEventListener(
        "click",
        openNewCommission
      );

    $("#close")
      ?.addEventListener(
        "click",
        closeNewCommission
      );

    $("#cancel")
      ?.addEventListener(
        "click",
        closeNewCommission
      );

    [
      "hs",
      "hm",
      "hb"
    ].forEach(
      (id) => {
        $("#" + id)
          ?.addEventListener(
            "input",
            preview
          );
      }
    );

    $("#form")
      ?.addEventListener(
        "submit",
        createCommission
      );

    $("#prev")
      ?.addEventListener(
        "click",
        async () => {
          weekStart =
            add(
              weekStart,
              -7
            );

          await refresh();
        }
      );

    $("#next")
      ?.addEventListener(
        "click",
        async () => {
          weekStart =
            add(
              weekStart,
              7
            );

          await refresh();
        }
      );

    $("#today")
      ?.addEventListener(
        "click",
        async () => {
          weekStart =
            monday(
              new Date()
            );

          await refresh();
        }
      );

    $("#loginBtn")
      ?.addEventListener(
        "click",
        login
      );

    $("#logoutBtn")
      ?.addEventListener(
        "click",
        () =>
          sb.auth.signOut()
      );

    $("#modal")
      ?.addEventListener(
        "click",
        (event) => {
          if (
            event.target ===
            $("#modal")
          ) {
            closeNewCommission();
          }
        }
      );

    document.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key ===
          "Escape"
        ) {
          closeDetailModal();
          closeNewCommission();
        }
      }
    );
  }

  /* =======================================================
     LOGIN
  ======================================================= */

  async function login() {
    const email =
      $("#loginEmail")
        ?.value
        .trim();

    if (!email) {
      return;
    }

    const { error } =
      await sb.auth.signInWithOtp({
        email,

        options: {
          emailRedirectTo:
            location.href
        }
      });

    if ($("#loginMsg")) {
      $("#loginMsg")
        .textContent =
        error
          ? error.message
          : "Link enviado! Verifique seu e-mail.";
    }
  }

  /* =======================================================
     INICIALIZAÇÃO
  ======================================================= */

  function init() {
    bindEvents();
    boot();
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }

  window.refreshBithouse =
    refresh;

  window.openAgendaDetails =
    openAgendaDetails;

  window.openCommissionDetails =
    openCommissionDetails;

})();

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
