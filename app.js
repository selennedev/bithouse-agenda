/* =========================================================
   BITHOUSE — APP CORE
   Dashboard / Agenda / Comissões / Equipe

   Estrutura preparada para:
   - Agenda interativa
   - Status
   - Edição
   - Detalhes
   - Capacidade
   - Realtime
   - Activity Log
   - Produção
   - Futuros campos
========================================================= */

(function () {

  "use strict";

  /* =======================================================
     SUPABASE
  ======================================================= */

  const { createClient } = window.supabase;

  const sb = createClient(
    window.BITHOUSE_SUPABASE_URL,
    window.BITHOUSE_SUPABASE_KEY
  );

  window.sb = sb;


  /* =======================================================
     ESTADO GLOBAL
  ======================================================= */

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

  let selectedCommission = null;
  let selectedAgendaItem = null;


  /* =======================================================
     HELPERS
  ======================================================= */

  const $ = (selector) =>
    document.querySelector(selector);


  const $$ = (selector) =>
    [...document.querySelectorAll(selector)];


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


  function normalize(value) {

    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  }


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

    d.setDate(
      d.getDate() + days
    );

    return d;

  }


  function iso(date) {

    const d = new Date(date);

    return d
      .toISOString()
      .slice(0, 10);

  }


  function fmt(date) {

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
      new Date(date)
    );

  }


  function fmtLong(date) {

    if (!date) {
      return "—";
    }

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


  function number(value) {

    return Number(value || 0);

  }


  function hours(value) {

    return number(value)
      .toFixed(1);

  }


  function cap(profile) {

    return (
      number(profile?.hours_per_day) *
      number(profile?.days_per_week) *
      0.8
    );

  }


  function dateInput(value) {

    return value || "";

  }


  /* =======================================================
     STATUS
  ======================================================= */

  const STATUS = {

    COMMISSION: [
      "Planejamento",
      "Em andamento",
      "Concluído",
      "Pausado",
      "Cancelado"
    ],

    AGENDA: [
      "Não inicializado",
      "Em andamento",
      "Concluído",
      "Bloqueado"
    ]

  };


  function statusClass(status) {

    const s = normalize(status);

    if (
      s === "concluido"
    ) {
      return "done";
    }

    if (
      s === "em andamento"
    ) {
      return "progress";
    }

    if (
      s === "cancelado"
    ) {
      return "cancelled";
    }

    if (
      s === "pausado"
    ) {
      return "paused";
    }

    if (
      s === "bloqueado"
    ) {
      return "blocked";
    }

    return "not-started";

  }


  function statusLabel(status) {

    return status ||
      "Não inicializado";

  }


  /* =======================================================
     AUTH
  ======================================================= */

  async function boot() {

    try {

      const {
        data: {
          session
        }
      } = await sb.auth.getSession();

      if (session) {

        user = session.user;

        await enter();

      } else {

        showLogin();

      }

      sb.auth.onAuthStateChange(
        async (event, session) => {

          if (session) {

            user = session.user;

            await enter();

          } else {

            user = null;

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

    $("#login")
      ?.classList
      .remove("hidden");

    $("#app")
      ?.classList
      .add("hidden");

  }


  async function enter() {

    $("#login")
      ?.classList
      .add("hidden");

    $("#app")
      ?.classList
      .remove("hidden");


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

      await sb
        .from("profiles")
        .upsert({
          id: user.id,
          name:
            user.email
              ?.split("@")[0] ||
            "Membro"
        });


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


    ensureModals();

    subscribe();

    await refresh();


    if (
      window.loadProduction
    ) {

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


    channel =
      sb
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

        .subscribe(
          (state) => {

            const sync =
              $("#syncState");

            if (!sync) {
              return;
            }

            sync.textContent =
              state === "SUBSCRIBED"
                ? "● sincronizado"
                : "● conectando...";

          }
        );

  }


  /* =======================================================
     DATA
  ======================================================= */

  async function data() {

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
          commission:commissions(
            *
          ),
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

      sb
        .from("profiles")
        .select("*")
        .eq("active", true)
        .order("name")

    ]);


    if (
      commissionsResult.error
    ) {

      console.error(
        "Comissões:",
        commissionsResult.error
      );

    }


    if (
      agendaResult.error
    ) {

      console.error(
        "Agenda:",
        agendaResult.error
      );

    }


    if (
      tasksResult.error
    ) {

      console.error(
        "Tasks:",
        tasksResult.error
      );

    }


    if (
      profilesResult.error
    ) {

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

    if (!user) {
      return;
    }


    try {

      appData =
        await data();

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

  function render(d) {

    renderStats(d);

    renderAgenda(d);

    renderCommissions(d);

    renderTeam(d);

  }


  /* =======================================================
     DASHBOARD / STATS
  ======================================================= */

  function renderStats(d) {

    const active =
      d.commissions.filter(
        (x) =>
          ![
            "Concluído",
            "Cancelado"
          ].includes(x.status)
      );


    const high =
      active.filter(
        (x) =>
          x.priority === "Alta"
      );


    const pendingTasks =
      d.tasks.filter(
        (x) =>
          normalize(x.status) !==
          "concluido"
      );


    const owners =
      d.commissions.filter(
        (x) =>
          x.owner_id
      );


    const totalCapacity =
      d.profiles.reduce(
        (total, p) =>
          total + cap(p),
        0
      );


    const committed =
      d.agenda.reduce(
        (total, item) =>
          total +
          number(item.hours),
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
        percentage * 100 + "%";

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
        hours(committed) + "h";

    }


    if ($("#free")) {

      $("#free")
        .textContent =
        hours(free) + "h";

    }


    if ($("#freePreview")) {

      $("#freePreview")
        .textContent =
        hours(free) + "h";

    }

  }


  /* =======================================================
     AGENDA
  ======================================================= */

  function renderAgenda(d) {

    if (!$("#agendaGrid")) {
      return;
    }


    if ($("#weekTitle")) {

      $("#weekTitle")
        .textContent =
        `${fmt(weekStart)} — ${fmt(
          add(weekStart, 5)
        )}`;

    }


    const grid =
      $("#agendaGrid");


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
        d.agenda.filter(
          (item) =>
            item.date === key
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
            ${fmt(date)}
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

          const element =
            createAgendaItem(
              item
            );

          day.appendChild(
            element
          );

        }
      );


      grid.appendChild(day);

    }

  }


  function createAgendaItem(item) {

    const element =
      document.createElement(
        "div"
      );


    element.className =
      "item agenda-clickable";


    const status =
      item.status ||
      "Não inicializado";


    element.innerHTML = `

      <div class="agenda-item-status">
        <span
          class="status-dot ${statusClass(status)}"
        ></span>
      </div>

      <b>
        ${esc(
          item.commission?.name ||
          "Comissão"
        )}
      </b>

      <small>
        ${esc(
          item.profile?.name ||
          item.collaborator_name ||
          "Equipe"
        )}
        •
        ${esc(
          item.task ||
          "Produção"
        )}
      </small>

      <small>

        <strong>
          ${hours(item.hours)}h
        </strong>

        ${
          item.start_time
            ? ` • ${esc(
                item.start_time
              )}`
            : ""
        }

      </small>

    `;


    element.addEventListener(
      "click",
      () =>
        openAgendaDetails(
          item
        )
    );


    return element;

  }


  /* =======================================================
     COMISSÕES
  ======================================================= */

  function renderCommissions(d) {

    const grid =
      $("#commissionGrid");


    if (!grid) {
      return;
    }


    grid.innerHTML = "";


    d.commissions.forEach(
      (commission) => {

        const total =
          d.agenda
            .filter(
              (item) =>
                item.commission_id ===
                commission.id
            )
            .reduce(
              (total, item) =>
                total +
                number(item.hours),
              0
            );


        const card =
          document.createElement(
            "article"
          );


        card.className =
          "card commission-clickable";


        const progress =
          Math.min(
            1,
            Math.max(
              0,
              number(
                commission.progress
              )
            )
          );


        card.innerHTML = `

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
              "Normal"
            )}
          </span>

          <span
            class="commission-status
            ${statusClass(
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
                  commission.owner?.name ||
                  "Sem responsável"
                )}
              </b>

            </div>

            <div>

              <small>
                Horas agendadas
              </small>

              <b>
                ${hours(total)}h
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

        `;


        card.addEventListener(
          "click",
          () =>
            openCommissionDetails(
              commission
            )
        );


        grid.appendChild(
          card
        );

      }
    );

  }


  /* =======================================================
     EQUIPE
  ======================================================= */

  function renderTeam(d) {

    const grid =
      $("#teamGrid");


    if (!grid) {
      return;
    }


    grid.innerHTML = "";


    d.profiles.forEach(
      (p) => {

        const owned =
          d.commissions.filter(
            (commission) =>
              commission.owner_id ===
              p.id
          );


        const used =
          d.agenda
            .filter(
              (item) =>
                item.profile_id ===
                p.id
            )
            .reduce(
              (total, item) =>
                total +
                number(item.hours),
              0
            );


        const capacity =
          cap(p);


        const available =
          Math.max(
            0,
            capacity - used
          );


        const percentage =
          capacity
            ? Math.min(
                1,
                used / capacity
              )
            : 0;


        grid.innerHTML += `

          <article
            class="card"
          >

            <h3>
              ${esc(p.name)}
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
                font:800 30px
                'Space Grotesk';
                margin-top:12px
              "
            >

              ${hours(
                available
              )}h

              <span
                class="muted"
              >
                livres
              </span>

            </div>

            <div class="bar">

              <span
                style="
                  width:${
                    percentage * 100
                  }%
                "
              ></span>

            </div>

            <div class="muted">

              ${owned.length}
              comissão(ões) como
              responsável

              •

              ${hours(used)}h
              comprometidas

            </div>

          </article>

        `;

      }
    );

  }


  /* =======================================================
     MODAIS
  ======================================================= */

  function ensureModals() {

    ensureAgendaModal();

    ensureCommissionModal();

  }


  function ensureAgendaModal() {

    if (
      $("#agendaDetailsModal")
    ) {
      return;
    }


    const modal =
      document.createElement(
        "div"
      );


    modal.id =
      "agendaDetailsModal";


    modal.className =
      "agenda-details-backdrop hidden";


    modal.innerHTML = `

      <div
        class="agenda-details-modal"
      >

        <button
          type="button"
          class="agenda-details-close"
          id="agendaDetailsClose"
        >
          ×
        </button>

        <div
          id="agendaDetailsContent"
        ></div>

      </div>

    `;


    document.body.appendChild(
      modal
    );


    $("#agendaDetailsClose")
      .onclick =
      closeAgendaDetails;


    modal.addEventListener(
      "click",
      (event) => {

        if (
          event.target ===
          modal
        ) {

          closeAgendaDetails();

        }

      }
    );

  }


  function ensureCommissionModal() {

    if (
      $("#commissionDetailsModal")
    ) {
      return;
    }


    const modal =
      document.createElement(
        "div"
      );


    modal.id =
      "commissionDetailsModal";


    modal.className =
      "agenda-details-backdrop hidden";


    modal.innerHTML = `

      <div
        class="agenda-details-modal"
      >

        <button
          type="button"
          class="agenda-details-close"
          id="commissionDetailsClose"
        >
          ×
        </button>

        <div
          id="commissionDetailsContent"
        ></div>

      </div>

    `;


    document.body.appendChild(
      modal
    );


    $("#commissionDetailsClose")
      .onclick =
      closeCommissionDetails;


    modal.addEventListener(
      "click",
      (event) => {

        if (
          event.target ===
          modal
        ) {

          closeCommissionDetails();

        }

      }
    );

  }


  /* =======================================================
     AGENDA DETAILS
  ======================================================= */

  function openAgendaDetails(
    item
  ) {

    ensureAgendaModal();


    selectedAgendaItem =
      item;


    const modal =
      $("#agendaDetailsModal");


    const content =
      $("#agendaDetailsContent");


    const commission =
      item.commission;


    const status =
      item.status ||
      "Não inicializado";


    content.innerHTML = `

      <span class="eyebrow">
        ITEM DA AGENDA
      </span>

      <h2>
        ${esc(
          item.task ||
          "Produção"
        )}
      </h2>

      <div
        class="
          production-details-status-row
        "
      >

        <span
          class="
            production-pill
            ${statusClass(status)}
          "
        >
          ${esc(
            statusLabel(status)
          )}
        </span>

      </div>


      <div
        class="
          production-details-section
        "
      >

        <h3>
          O que precisa ser feito
        </h3>

        <div
          class="production-detail-box"
        >

          <strong>

            ${esc(
              item.task ||
              "Produção"
            )}

          </strong>

          <p>

            ${esc(
              item.description ||
              item.notes ||
              "Nenhuma instrução adicional foi cadastrada para este item."
            )}

          </p>

        </div>

      </div>


      <div
        class="
          production-details-grid
        "
      >

        <div>

          <small>
            COMISSÃO
          </small>

          <strong>
            ${esc(
              commission?.name ||
              "—"
            )}
          </strong>

        </div>


        <div>

          <small>
            CLIENTE
          </small>

          <strong>
            ${esc(
              commission?.client ||
              "—"
            )}
          </strong>

        </div>


        <div>

          <small>
            RESPONSÁVEL
          </small>

          <strong>
            ${esc(
              item.profile?.name ||
              item.collaborator_name ||
              "Equipe"
            )}
          </strong>

        </div>


        <div>

          <small>
            HORAS
          </small>

          <strong>
            ${hours(item.hours)}h
          </strong>

        </div>


        <div>

          <small>
            DATA
          </small>

          <strong>
            ${fmtLong(item.date)}
          </strong>

        </div>


        <div>

          <small>
            HORÁRIO
          </small>

          <strong>

            ${
              item.start_time
                ? `${esc(
                    item.start_time
                  )} ${
                    item.end_time
                      ? `– ${esc(
                          item.end_time
                        )}`
                      : ""
                  }`
                : "Não definido"
            }

          </strong>

        </div>


        <div>

          <small>
            PRAZO DA COMISSÃO
          </small>

          <strong>

            ${
              commission?.deadline
                ? fmtLong(
                    commission.deadline
                  )
                : "—"
            }

          </strong>

        </div>


        <div>

          <small>
            MAPA
          </small>

          <strong>
            ${esc(
              commission?.map_name ||
              "—"
            )}
          </strong>

        </div>

      </div>


      <div
        class="
          production-details-section
        "
      >

        <h3>
          Alterar status
        </h3>


        <div
          class="
            production-status-buttons
          "
        >

          ${renderAgendaStatusButton(
            item,
            "Não inicializado"
          )}

          ${renderAgendaStatusButton(
            item,
            "Em andamento"
          )}

          ${renderAgendaStatusButton(
            item,
            "Concluído"
          )}

        </div>

      </div>


      <div
        class="
          production-details-section
        "
      >

        <h3>
          Ações
        </h3>

        <div
          class="modal-actions"
        >

          <button
            type="button"
            id="agendaEditButton"
            class="production-view-btn"
          >
            Editar item
          </button>

          <button
            type="button"
            id="agendaDeleteButton"
            class="production-view-btn danger"
          >
            Remover
          </button>

        </div>

      </div>

    `;


    $$("#agendaDetailsContent [data-agenda-status]")
      .forEach(
        (button) => {

          button.addEventListener(
            "click",
            () =>
              updateAgendaStatus(
                item,
                button.dataset.agendaStatus
              )
          );

        }
      );


    $("#agendaEditButton")
      ?.addEventListener(
        "click",
        () =>
          openAgendaEditor(
            item
          )
      );


    $("#agendaDeleteButton")
      ?.addEventListener(
        "click",
        () =>
          deleteAgendaItem(
            item
          )
      );


    modal.classList.remove(
      "hidden"
    );

  }


  function renderAgendaStatusButton(
    item,
    status
  ) {

    const active =
      normalize(
        item.status
      ) ===
      normalize(status);


    return `

      <button
        type="button"
        class="
          status-btn
          ${active ? "active" : ""}
        "
        data-agenda-status="${esc(
          status
        )}"
      >

        ${
          status ===
          "Não inicializado"
            ? "⚪"
            : status ===
              "Em andamento"
              ? "🔵"
              : "✅"
        }

        ${esc(status)}

      </button>

    `;

  }


  function closeAgendaDetails() {

    $("#agendaDetailsModal")
      ?.classList
      .add("hidden");

    selectedAgendaItem =
      null;

  }


  /* =======================================================
     STATUS DA AGENDA
  ======================================================= */

  async function updateAgendaStatus(
    item,
    status
  ) {

    if (!item?.id) {
      return;
    }


    const oldStatus =
      item.status ||
      "Não inicializado";


    const button =
      document.querySelector(
        `[data-agenda-status="${CSS.escape(
          status
        )}"]`
      );


    if (button) {
      button.disabled = true;
    }


    /*
      O campo status precisa existir
      em agenda_items.

      Se ainda não existir, a operação
      mostrará o erro do Supabase.
    */

    const {
      error
    } = await sb
      .from("agenda_items")
      .update({
        status
      })
      .eq("id", item.id);


    if (error) {

      console.error(
        "Erro ao atualizar agenda:",
        error
      );


      alert(
        "Não foi possível atualizar o status.\n\n" +
        error.message
      );


      if (button) {
        button.disabled = false;
      }


      return;

    }


    await logActivity(
      "updated_agenda_status",
      "agenda_item",
      item.id,
      {
        previous_status:
          oldStatus,

        new_status:
          status
      }
    );


    item.status =
      status;


    await refresh();


    openAgendaDetails(
      appData.agenda.find(
        (x) =>
          x.id === item.id
      ) || item
    );

  }


  /* =======================================================
     EDITOR DA AGENDA
  ======================================================= */

  function openAgendaEditor(
    item
  ) {

    const content =
      $("#agendaDetailsContent");


    content.innerHTML = `

      <span class="eyebrow">
        EDITAR AGENDA
      </span>

      <h2>
        ${esc(
          item.task ||
          "Produção"
        )}
      </h2>


      <form
        id="agendaEditForm"
      >

        <label>
          Tarefa

          <input
            id="editAgendaTask"
            value="${esc(
              item.task || ""
            )}"
            required
          >

        </label>


        <label>
          Descrição

          <textarea
            id="editAgendaDescription"
            rows="4"
          >${esc(
            item.description ||
            item.notes ||
            ""
          )}</textarea>

        </label>


        <label>
          Data

          <input
            type="date"
            id="editAgendaDate"
            value="${dateInput(
              item.date
            )}"
            required
          >

        </label>


        <label>
          Horas

          <input
            type="number"
            id="editAgendaHours"
            min="0"
            step="0.1"
            value="${number(
              item.hours
            )}"
            required
          >

        </label>


        <div class="modal-actions">

          <button
            type="submit"
            class="production-view-btn"
          >
            Salvar alterações
          </button>

          <button
            type="button"
            id="agendaEditorCancel"
            class="production-view-btn"
          >
            Cancelar
          </button>

        </div>

      </form>

    `;


    $("#agendaEditForm")
      ?.addEventListener(
        "submit",
        async (event) => {

          event.preventDefault();

          await saveAgendaEdit(
            item
          );

        }
      );


    $("#agendaEditorCancel")
      ?.addEventListener(
        "click",
        () =>
          openAgendaDetails(
            item
          )
      );

  }


  async function saveAgendaEdit(
    item
  ) {

    const values = {

      task:
        $("#editAgendaTask")
          ?.value
          .trim(),

      description:
        $("#editAgendaDescription")
          ?.value
          .trim(),

      date:
        $("#editAgendaDate")
          ?.value ||
        null,

      hours:
        number(
          $("#editAgendaHours")
            ?.value
        )

    };


    const {
      error
    } = await sb
      .from("agenda_items")
      .update(values)
      .eq("id", item.id);


    if (error) {

      alert(
        "Erro ao salvar:\n\n" +
        error.message
      );

      return;

    }


    await logActivity(
      "updated_agenda_item",
      "agenda_item",
      item.id,
      values
    );


    closeAgendaDetails();

    await refresh();

  }


  /* =======================================================
     DELETE AGENDA
  ======================================================= */

  async function deleteAgendaItem(
    item
  ) {

    const confirmed =
      confirm(
        "Remover este item da agenda?\n\n" +
        "Essa ação não pode ser desfeita."
      );


    if (!confirmed) {
      return;
    }


    const {
      error
    } = await sb
      .from("agenda_items")
      .delete()
      .eq("id", item.id);


    if (error) {

      alert(
        "Não foi possível remover.\n\n" +
        error.message
      );

      return;

    }


    await logActivity(
      "deleted_agenda_item",
      "agenda_item",
      item.id,
      {
        task:
          item.task
      }
    );


    closeAgendaDetails();

    await refresh();

  }


  /* =======================================================
     COMISSÃO DETAILS
  ======================================================= */

  function openCommissionDetails(
    commission
  ) {

    ensureCommissionModal();


    selectedCommission =
      commission;


    const content =
      $("#commissionDetailsContent");


    const agenda =
      appData.agenda.filter(
        (item) =>
          item.commission_id ===
          commission.id
      );


    const totalHours =
      agenda.reduce(
        (total, item) =>
          total +
          number(item.hours),
        0
      );


    content.innerHTML = `

      <span class="eyebrow">
        COMISSÃO
      </span>

      <h2>
        ${esc(
          commission.name
        )}
      </h2>


      <div
        class="production-details-status-row"
      >

        <span
          class="
            production-pill
            ${statusClass(
              commission.status
            )}
          "
        >
          ${esc(
            commission.status ||
            "Planejamento"
          )}
        </span>

        <span
          class="
            production-pill
            ${
              commission.priority ===
              "Alta"
                ? "blocked"
                : "not-started"
            }
          "
        >
          ${esc(
            commission.priority ||
            "Normal"
          )}
        </span>

      </div>


      <div
        class="
          production-details-grid
        "
      >

        <div>
          <small>CLIENTE</small>
          <strong>
            ${esc(
              commission.client ||
              "—"
            )}
          </strong>
        </div>


        <div>
          <small>RESPONSÁVEL</small>
          <strong>
            ${esc(
              commission.owner?.name ||
              "Sem responsável"
            )}
          </strong>
        </div>


        <div>
          <small>INÍCIO</small>
          <strong>
            ${
              commission.start_date
                ? fmtLong(
                    commission.start_date
                  )
                : "—"
            }
          </strong>
        </div>


        <div>
          <small>PRAZO</small>
          <strong>
            ${
              commission.deadline
                ? fmtLong(
                    commission.deadline
                  )
                : "—"
            }
          </strong>
        </div>


        <div>
          <small>MAPA</small>
          <strong>
            ${esc(
              commission.map_name ||
              "—"
            )}
          </strong>
        </div>


        <div>
          <small>HORAS</small>
          <strong>
            ${hours(totalHours)}h
          </strong>
        </div>

      </div>


      <div
        class="
          production-details-section
        "
      >

        <h3>
          Progresso
        </h3>

        <div class="bar">

          <span
            style="
              width:${
                number(
                  commission.progress
                ) * 100
              }%
            "
          ></span>

        </div>

      </div>


      <div
        class="
          production-details-section
        "
      >

        <h3>
          Agenda
        </h3>

        ${
          agenda.length
            ? agenda
                .map(
                  (item) => `
                    <div
                      class="
                        production-detail-box
                        agenda-row-clickable
                      "
                      data-agenda-id="${
                        item.id
                      }"
                    >

                      <strong>
                        ${esc(
                          item.task ||
                          "Produção"
                        )}
                      </strong>

                      <p>

                        ${fmt(
                          item.date
                        )}

                        •

                        ${esc(
                          item.profile?.name ||
                          "Equipe"
                        )}

                        •

                        ${hours(
                          item.hours
                        )}h

                      </p>

                    </div>
                  `
                )
                .join("")
            : `
              <div
                class="production-detail-box"
              >
                Nenhum item agendado.
              </div>
            `
        }

      </div>


      <div
        class="
          production-details-section
        "
      >

        <h3>
          Alterar status
        </h3>


        <select
          id="commissionStatusEdit"
          class="production-status-select"
        >

          ${STATUS.COMMISSION
            .map(
              (status) => `
                <option
                  value="${esc(
                    status
                  )}"
                  ${
                    normalize(
                      commission.status
                    ) ===
                    normalize(status)
                      ? "selected"
                      : ""
                  }
                >
                  ${esc(status)}
                </option>
              `
            )
            .join("")}

        </select>

      </div>


      <div
        class="
          production-details-section
        "
      >

        <div
          class="modal-actions"
        >

          <button
            type="button"
            id="editCommissionButton"
            class="production-view-btn"
          >
            Editar comissão
          </button>

          <button
            type="button"
            id="deleteCommissionButton"
            class="production-view-btn danger"
          >
            Excluir comissão
          </button>

        </div>

      </div>

    `;


    $$("#commissionDetailsContent [data-agenda-id]")
      .forEach(
        (row) => {

          row.addEventListener(
            "click",
            () => {

              const item =
                appData.agenda.find(
                  (x) =>
                    String(x.id) ===
                    String(
                      row.dataset.agendaId
                    )
                );

              if (item) {

                closeCommissionDetails();

                openAgendaDetails(
                  item
                );

              }

            }
          );

        }
      );


    $("#commissionStatusEdit")
      ?.addEventListener(
        "change",
        async (event) => {

          await updateCommission(
            commission.id,
            {
              status:
                event.target.value
            }
          );

        }
      );


    $("#editCommissionButton")
      ?.addEventListener(
        "click",
        () =>
          openCommissionEditor(
            commission
          )
      );


    $("#deleteCommissionButton")
      ?.addEventListener(
        "click",
        () =>
          deleteCommission(
            commission
          )
      );


    $("#commissionDetailsModal")
      .classList
      .remove("hidden");

  }


  function closeCommissionDetails() {

    $("#commissionDetailsModal")
      ?.classList
      .add("hidden");

    selectedCommission =
      null;

  }


  /* =======================================================
     EDITAR COMISSÃO
  ======================================================= */

  function openCommissionEditor(
    commission
  ) {

    const content =
      $("#commissionDetailsContent");


    content.innerHTML = `

      <span class="eyebrow">
        EDITAR COMISSÃO
      </span>

      <h2>
        ${esc(
          commission.name
        )}
      </h2>


      <form
        id="commissionEditForm"
      >

        <label>
          Nome

          <input
            id="editCommissionName"
            value="${esc(
              commission.name
            )}"
            required
          >

        </label>


        <label>
          Cliente

          <input
            id="editCommissionClient"
            value="${esc(
              commission.client ||
              ""
            )}"
          >

        </label>


        <label>
          Prioridade

          <select
            id="editCommissionPriority"
          >

            <option
              ${
                commission.priority ===
                "Baixa"
                  ? "selected"
                  : ""
              }
            >
              Baixa
            </option>

            <option
              ${
                commission.priority ===
                "Normal"
                  ? "selected"
                  : ""
              }
            >
              Normal
            </option>

            <option
              ${
                commission.priority ===
                "Alta"
                  ? "selected"
                  : ""
              }
            >
              Alta
            </option>

          </select>

        </label>


        <label>
          Responsável

          <select
            id="editCommissionOwner"
          >

            <option value="">
              Sem responsável
            </option>

            ${appData.profiles
              .map(
                (p) => `
                  <option
                    value="${esc(p.id)}"
                    ${
                      p.id ===
                      commission.owner_id
                        ? "selected"
                        : ""
                    }
                  >
                    ${esc(p.name)}
                  </option>
                `
              )
              .join("")}

          </select>

        </label>


        <label>
          Início

          <input
            type="date"
            id="editCommissionStart"
            value="${esc(
              commission.start_date ||
              ""
            )}"
          >

        </label>


        <label>
          Prazo

          <input
            type="date"
            id="editCommissionDeadline"
            value="${esc(
              commission.deadline ||
              ""
            )}"
          >

        </label>


        <label>
          Mapa

          <input
            id="editCommissionMap"
            value="${esc(
              commission.map_name ||
              ""
            )}"
          >

        </label>


        <label>
          Progresso

          <input
            type="number"
            id="editCommissionProgress"
            min="0"
            max="1"
            step="0.01"
            value="${number(
              commission.progress
            )}"
          >

        </label>


        <div class="modal-actions">

          <button
            type="submit"
            class="production-view-btn"
          >
            Salvar
          </button>

          <button
            type="button"
            id="commissionEditCancel"
            class="production-view-btn"
          >
            Cancelar
          </button>

        </div>

      </form>

    `;


    $("#commissionEditForm")
      ?.addEventListener(
        "submit",
        async (event) => {

          event.preventDefault();

          await saveCommissionEdit(
            commission
          );

        }
      );


    $("#commissionEditCancel")
      ?.addEventListener(
        "click",
        () =>
          openCommissionDetails(
            commission
          )
      );

  }


  async function saveCommissionEdit(
    commission
  ) {

    const values = {

      name:
        $("#editCommissionName")
          ?.value
          .trim(),

      client:
        $("#editCommissionClient")
          ?.value
          .trim(),

      priority:
        $("#editCommissionPriority")
          ?.value,

      owner_id:
        $("#editCommissionOwner")
          ?.value ||
        null,

      start_date:
        $("#editCommissionStart")
          ?.value ||
        null,

      deadline:
        $("#editCommissionDeadline")
          ?.value ||
        null,

      map_name:
        $("#editCommissionMap")
          ?.value
          .trim(),

      progress:
        number(
          $("#editCommissionProgress")
            ?.value
        )

    };


    await updateCommission(
      commission.id,
      values
    );

  }


  async function updateCommission(
    id,
    values
  ) {

    const {
      error
    } = await sb
      .from("commissions")
      .update(values)
      .eq("id", id);


    if (error) {

      console.error(
        "Erro ao atualizar comissão:",
        error
      );


      alert(
        "Não foi possível salvar.\n\n" +
        error.message
      );


      return false;

    }


    await logActivity(
      "updated_commission",
      "commission",
      id,
      values
    );


    await refresh();


    const updated =
      appData.commissions.find(
        (x) =>
          x.id === id
      );


    if (updated) {

      openCommissionDetails(
        updated
      );

    }


    return true;

  }


  /* =======================================================
     EXCLUIR COMISSÃO
  ======================================================= */

  async function deleteCommission(
    commission
  ) {

    const confirmed =
      confirm(
        `Excluir a comissão "${commission.name}"?\n\n` +
        "Os itens da agenda relacionados também precisam ser tratados."
      );


    if (!confirmed) {
      return;
    }


    /*
      Primeiro removemos agenda.
    */

    const {
      error:
        agendaError
    } = await sb
      .from("agenda_items")
      .delete()
      .eq(
        "commission_id",
        commission.id
      );


    if (agendaError) {

      alert(
        "Não foi possível remover os itens da agenda.\n\n" +
        agendaError.message
      );

      return;

    }


    const {
      error
    } = await sb
      .from("commissions")
      .delete()
      .eq(
        "id",
        commission.id
      );


    if (error) {

      alert(
        "Não foi possível excluir a comissão.\n\n" +
        error.message
      );

      return;

    }


    await logActivity(
      "deleted_commission",
      "commission",
      commission.id,
      {
        name:
          commission.name
      }
    );


    closeCommissionDetails();

    await refresh();

  }


  /* =======================================================
     NOVA COMISSÃO
  ======================================================= */

  function openModal() {

    const modal =
      $("#modal");

    if (!modal) {
      return;
    }


    modal
      .classList
      .remove("hidden");


    if ($("#start")) {

      $("#start").value ||=
        iso(
          new Date()
        );

    }


    preview();

  }


  function closeModal() {

    $("#modal")
      ?.classList
      .add("hidden");

  }


  function preview() {

    const ids = [
      "hs",
      "hm",
      "hb"
    ];


    const total =
      ids.reduce(
        (sum, id) =>
          sum +
          number(
            $("#" + id)?.value
          ),
        0
      );


    if ($("#total")) {

      $("#total")
        .textContent =
        hours(total) +
        "h";

    }


    if ($("#verdict")) {

      $("#verdict")
        .textContent =
        total
          ? "A agenda será montada por pessoa."
          : "Preencha as horas.";

    }

  }


  /* =======================================================
     CRIAR COMISSÃO
  ======================================================= */

  async function createCommission(
    event
  ) {

    event.preventDefault();


    const button =
      event.submitter;


    if (button) {
      button.disabled = true;
      button.textContent =
        "Criando...";
    }


    try {

      const values = {

        name:
          $("#name")
            ?.value
            .trim(),

        client:
          $("#client")
            ?.value
            .trim(),

        priority:
          $("#priority")
            ?.value ||
          "Normal",

        status:
          "Planejamento",

        owner_id:
          null,

        start_date:
          $("#start")
            ?.value ||
          null,

        deadline:
          $("#deadline")
            ?.value ||
          null,

        map_name:
          $("#map")
            ?.value
            .trim(),

        progress:
          0,

        created_by:
          user.id

      };


      const ownerName =
        $("#owner")
          ?.value;


      if (ownerName) {

        const {
          data: owner
        } = await sb
          .from("profiles")
          .select("id")
          .eq(
            "name",
            ownerName
          )
          .maybeSingle();


        values.owner_id =
          owner?.id ||
          null;

      }


      const {
        data: commission,
        error
      } = await sb
        .from("commissions")
        .insert(values)
        .select()
        .single();


      if (error) {

        throw error;

      }


      const people = {

        Selenne:
          number(
            $("#hs")
              ?.value
          ),

        Midas:
          number(
            $("#hm")
              ?.value
          ),

        Biell:
          number(
            $("#hb")
              ?.value
          )

      };


      await generateAgenda(
        commission,
        people
      );


      await logActivity(
        "created_commission",
        "commission",
        commission.id,
        {
          hours:
            people
        }
      );


      closeModal();


      $("#form")
        ?.reset();


      await refresh();


      location.hash =
        "#agenda";


    } catch (error) {

      console.error(
        "Erro ao criar comissão:",
        error
      );


      alert(
        "Não foi possível criar a comissão.\n\n" +
        error.message
      );


    } finally {

      if (button) {

        button.disabled =
          false;

        button.textContent =
          "Criar comissão";

      }

    }

  }


  /* =======================================================
     GERADOR DE AGENDA
  ======================================================= */

  async function generateAgenda(
    commission,
    people
  ) {

    const names =
      Object.keys(
        people
      );


    if (!names.length) {
      return;
    }


    const {
      data: profiles
    } = await sb
      .from("profiles")
      .select(
        "id,name,hours_per_day,days_per_week"
      )
      .in(
        "name",
        names
      );


    const rows = [];


    for (
      const p of
      profiles || []
    ) {

      let remaining =
        number(
          people[p.name]
        );


      if (!remaining) {
        continue;
      }


      let day =
        new Date(
          (
            commission.start_date ||
            iso(new Date())
          ) +
          "T12:00:00"
        );


      let guard = 0;


      while (
        remaining > 0 &&
        guard < 365
      ) {

        /*
          Domingo = dia 0.
        */

        if (
          day.getDay() !== 0
        ) {

          const dailyCapacity =
            number(
              p.hours_per_day
            ) * 0.8;


          const {
            data: existing
          } = await sb
            .from("agenda_items")
            .select("hours")
            .eq(
              "profile_id",
              p.id
            )
            .eq(
              "date",
              iso(day)
            );


          const used =
            (
              existing ||
              []
            ).reduce(
              (total, item) =>
                total +
                number(
                  item.hours
                ),
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

              date:
                iso(day),

              task:
                "Produção",

              description:
                "",

              hours:
                put,

              status:
                "Não inicializado"

            });


            remaining -=
              put;

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

      const {
        error
      } = await sb
        .from("agenda_items")
        .insert(rows);


      if (error) {

        /*
          Caso a coluna status ainda
          não exista, tenta novamente
          sem ela.

          Isso deixa o sistema compatível
          durante a migração do banco.
        */

        if (
          normalize(
            error.message
          ).includes(
            "status"
          )
        ) {

          const fallback =
            rows.map(
              ({
                status,
                ...row
              }) =>
                row
            );


          const retry =
            await sb
              .from("agenda_items")
              .insert(
                fallback
              );


          if (retry.error) {
            throw retry.error;
          }

        } else {

          throw error;

        }

      }

    }

  }


  /* =======================================================
     ACTIVITY LOG
  ======================================================= */

  async function logActivity(
    action,
    entityType,
    entityId,
    details = {}
  ) {

    if (!user) {
      return;
    }


    try {

      await sb
        .from("activity_log")
        .insert({

          actor_id:
            user.id,

          action,

          entity_type:
            entityType,

          entity_id:
            entityId,

          details

        });

    } catch (error) {

      /*
        Activity log nunca deve
        impedir a operação principal.
      */

      console.warn(
        "Activity log:",
        error
      );

    }

  }


  /* =======================================================
     NAVEGAÇÃO DA SEMANA
  ======================================================= */

  function previousWeek() {

    weekStart =
      add(
        weekStart,
        -7
      );

    refresh();

  }


  function nextWeek() {

    weekStart =
      add(
        weekStart,
        7
      );

    refresh();

  }


  function currentWeek() {

    weekStart =
      monday(
        new Date()
      );

    refresh();

  }


  /* =======================================================
     KEYBOARD
  ======================================================= */

  function keyboard() {

    document.addEventListener(
      "keydown",
      (event) => {

        if (
          event.key ===
          "Escape"
        ) {

          closeAgendaDetails();

          closeCommissionDetails();

          closeModal();

        }

      }
    );

  }


  /* =======================================================
     EVENTS
  ======================================================= */

  function bindEvents() {

    $("#newBtn")
      ?.addEventListener(
        "click",
        openModal
      );


    $("#newBtn2")
      ?.addEventListener(
        "click",
        openModal
      );


    $("#close")
      ?.addEventListener(
        "click",
        closeModal
      );


    $("#cancel")
      ?.addEventListener(
        "click",
        closeModal
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
        previousWeek
      );


    $("#next")
      ?.addEventListener(
        "click",
        nextWeek
      );


    $("#today")
      ?.addEventListener(
        "click",
        currentWeek
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


    keyboard();

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


    const {
      error
    } = await sb.auth
      .signInWithOtp({

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
     INIT
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


  /* =======================================================
     API GLOBAL
  ======================================================= */

  window.bithouse = {

    refresh,

    openAgendaDetails,

    openCommissionDetails,

    closeAgendaDetails,

    closeCommissionDetails,

    openModal,

    closeModal,

    previousWeek,

    nextWeek,

    currentWeek

  };


})();
