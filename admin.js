
(() => {
  const cfg = window.APP_CONFIG || {};

  const ready =
    cfg.SUPABASE_URL?.startsWith("https://") &&
    !cfg.SUPABASE_URL.includes("VOTRE-PROJET") &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_ANON_KEY.includes("VOTRE_CLE");

  const db = ready && window.supabase
    ? window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_ANON_KEY
      )
    : null;

  const $ = (selector) => document.querySelector(selector);

  $("#year").textContent = new Date().getFullYear();

  const loginView = $("#login-view");
  const dash = $("#dashboard-view");
  const loginForm = $("#login-form");

  const say = (element, message, error = false) => {
    element.textContent = message;
    element.classList.toggle("error", error);
  };

  if (!db) {
    say(
      $("#login-feedback"),
      "Configuration Supabase manquante. Vérifiez config.js.",
      true
    );
    return;
  }

  async function checkSession() {
    const { data, error } = await db.auth.getSession();

    if (error) {
      say($("#login-feedback"), error.message, true);
      return;
    }

    if (data.session) {
      loginView.hidden = true;
      dash.hidden = false;
      await loadAll();
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const fd = new FormData(loginForm);

    const { error } = await db.auth.signInWithPassword({
      email: fd.get("email"),
      password: fd.get("password")
    });

    if (error) {
      say($("#login-feedback"), error.message, true);
      return;
    }

    loginView.hidden = true;
    dash.hidden = false;

    await loadAll();
  });

  $("#logout-btn").addEventListener("click", async () => {
    const { error } = await db.auth.signOut();

    if (error) {
      say($("#admin-feedback"), error.message, true);
      return;
    }

    dash.hidden = true;
    loginView.hidden = false;
  });

  $("#refresh-btn").addEventListener("click", loadAll);

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((tab) => {
        tab.classList.toggle("active", tab === button);
      });

      $("#requests-view").hidden =
        button.dataset.tab !== "requests";

      $("#history-view").hidden =
        button.dataset.tab !== "history";
    });
  });

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  const date = (value) =>
    new Date(value).toLocaleString("fr-FR");

  async function loadAll() {
    say($("#admin-feedback"), "Chargement…");

    const [requests, history] = await Promise.all([
      db.from("requests")
        .select("*")
        .order("created_at", { ascending: false }),

      db.from("request_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100)
    ]);

    if (requests.error || history.error) {
      say(
        $("#admin-feedback"),
        (requests.error || history.error).message,
        true
      );
      return;
    }

    const rows = requests.data || [];
    const hist = history.data || [];

    $("#stats").innerHTML = [
      ["Total", rows.length],
      ["En attente", rows.filter(x => x.status === "pending").length],
      ["Validées", rows.filter(x => x.status === "approved").length]
    ].map(([label, count]) =>
      `<div class="stat"><strong>${count}</strong><span>${label}</span></div>`
    ).join("");

    const list = $("#requests-list");
    list.innerHTML = "";

    if (!rows.length) {
      list.innerHTML =
        '<div class="empty">Aucune demande reçue pour le moment.</div>';
    }

    for (const request of rows) {
      const card = document.createElement("article");
      card.className = "request-card";

      const info = document.createElement("div");

      const statusLabels = {
        pending: "En attente",
        approved: "Validée",
        rejected: "Refusée"
      };

      info.innerHTML = `
        <h3>
          ${esc(request.reference)}
          <span class="status ${esc(request.status)}">
            ${statusLabels[request.status] || esc(request.status)}
          </span>
        </h3>
        <div class="request-meta">
          <span>${esc(request.email)}</span>
          <span>${esc(request.amount)}</span>
          <span>${date(request.created_at)}</span>
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "request-actions";

      const photo = document.createElement("button");
      photo.className = "view-photo";
      photo.textContent = "VOIR LE JUSTIFICATIF";

      photo.addEventListener("click", async () => {
        if (!request.photo_path) {
          say(
            $("#admin-feedback"),
            "Aucun justificatif n'est enregistré pour cette demande.",
            true
          );
          return;
        }

        const { data, error } = await db.storage
          .from("Proof")
          .createSignedUrl(request.photo_path, 60);

        if (error) {
          say($("#admin-feedback"), error.message, true);
          return;
        }

        window.open(data.signedUrl, "_blank", "noopener");
      });

      const approve = document.createElement("button");
      approve.className = "approve";
      approve.textContent = "VALIDER";
      approve.disabled = request.status === "approved";
      approve.addEventListener("click", () =>
        changeStatus(request, "approved")
      );

      const reject = document.createElement("button");
      reject.className = "reject";
      reject.textContent = "REFUSER";
      reject.disabled = request.status === "rejected";
      reject.addEventListener("click", () =>
        changeStatus(request, "rejected")
      );

      actions.append(photo, approve, reject);
      card.append(info, actions);
      list.append(card);
    }

    const historyList = $("#history-list");
    historyList.innerHTML = "";

    if (!hist.length) {
      historyList.innerHTML =
        '<div class="empty">Aucune décision enregistrée.</div>';
    }

    hist.forEach((item) => {
      const entry = document.createElement("div");
      entry.className = "history-item";

      entry.innerHTML = `
        <strong>${esc(item.reference)}</strong> —
        ${item.old_status ? esc(item.old_status) + " → " : ""}
        <strong>
          ${item.new_status === "approved" ? "Validée" : "Refusée"}
        </strong>
        <br>
        <span class="muted">
          ${date(item.created_at)} ·
          ${esc(item.admin_email || "Administrateur")}
        </span>
      `;

      historyList.append(entry);
    });

    say($("#admin-feedback"), "Données actualisées.");
  }

  async function changeStatus(request, status) {
    const verb = status === "approved" ? "valider" : "refuser";

    if (!confirm(
      `Confirmer : ${verb} la demande ${request.reference} ?`
    )) {
      return;
    }

    const { error } = await db
      .from("requests")
      .update({ status })
      .eq("id", request.id);

    if (error) {
      say($("#admin-feedback"), error.message, true);
      return;
    }

    await loadAll();
  }

  checkSession();
})();

 
