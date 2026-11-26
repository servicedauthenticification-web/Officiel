
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

 const $ = s => document.querySelector(s);

 $("#year").textContent = new Date().getFullYear();

 const loginView = $("#login-view");
 const dash = $("#dashboard-view");
 const loginForm = $("#login-form");

 const say = (s, t, bad = false) => {
  s.textContent = t;
  s.classList.toggle("error", bad);
 };

 if (!db) {
  say($("#login-feedback"),
   "Configuration Supabase manquante. Vérifiez config.js.",
   true
  );
 }

 async function checkSession() {
  if (!db) return;

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

 loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  if (!db) return;

  const fd = new FormData(loginForm);

  const { error } = await db.auth.signInWithPassword({
   email: fd.get("email"),
   password: fd.get("password")
  });

  if (error) {
   return say($("#login-feedback"), error.message, true);
  }

  loginView.hidden = true;
  dash.hidden = false;

  await loadAll();
 });

 $("#logout-btn").addEventListener("click", async () => {
  if (!db) return;

  await db.auth.signOut();
  dash.hidden = true;
  loginView.hidden = false;
 });

 $("#refresh-btn").addEventListener("click", loadAll);

 document.querySelectorAll(".tab").forEach(b => {
  b.addEventListener("click", () => {
   document.querySelectorAll(".tab").forEach(x => {
    x.classList.toggle("active", x === b);
   });

   $("#requests-view").hidden =
    b.dataset.tab !== "requests";

   $("#history-view").hidden =
    b.dataset.tab !== "history";
  });
 });

 const esc = s => String(s ?? "").replace(
  /[&<>"']/g,
  c => ({
   "&": "&amp;",
   "<": "&lt;",
   ">": "&gt;",
   '"': "&quot;",
   "'": "&#39;"
  }[c])
 );

 const date = s => new Date(s).toLocaleString("fr-FR");

 async function loadAll() {
  if (!db) return;

  say($("#admin-feedback"), "Chargement…");

  const [r, h] = await Promise.all([
   db.from("requests")
    .select("*")
    .order("created_at", { ascending: false }),

   db.from("request_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)
  ]);

  if (r.error || h.error) {
   say(
    $("#admin-feedback"),
    (r.error || h.error).message,
    true
   );
   return;
  }

  const rows = r.data || [];
  const hist = h.data || [];

  $("#stats").innerHTML = [
   ["Total", rows.length],
   ["En attente", rows.filter(x => x.status === "pending").length],
   ["Validées", rows.filter(x => x.status === "approved").length]
  ].map(([a, b]) =>
   `<div class="stat"><strong>${b}</strong><span>${a}</span></div>`
  ).join("");

  const list = $("#requests-list");
  list.innerHTML = "";

  if (!rows.length) {
   list.innerHTML =
    '<div class="empty">Aucune demande reçue pour le moment.</div>';
  }

  for (const x of rows) {
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
     ${esc(x.reference)}
     <span class="status ${esc(x.status)}">
      ${statusLabels[x.status] || esc(x.status)}
     </span>
    </h3>
    <div class="request-meta">
     <span>${esc(x.email)}</span>
     <span>${esc(x.amount)}</span>
     <span>${date(x.created_at)}</span>
    </div>
   `;

   const actions = document.createElement("div");
   actions.className = "request-actions";

   const photo = document.createElement("button");
   photo.className = "view-photo";
   photo.textContent = "VOIR LE JUSTIFICATIF";

   photo.onclick = async () => {
    if (!x.proof_path) {
     return say(
      $("#admin-feedback"),
      "Aucun chemin de justificatif enregistré.",
      true
     );
    }

    const { data, error } = await db.storage
     .from("Proof")
     .createSignedUrl(x.proof_path, 60);

    if (error) {
     return say($("#admin-feedback"), error.message, true);
    }

    window.open(data.signedUrl, "_blank", "noopener");
   };

   const approve = document.createElement("button");
   approve.className = "approve";
   approve.textContent = "VALIDER";
   approve.disabled = x.status === "approved";
   approve.onclick = () => changeStatus(x, "approved");

   const reject = document.createElement("button");
   reject.className = "reject";
   reject.textContent = "REFUSER";
   reject.disabled = x.status === "rejected";
   reject.onclick = () => changeStatus(x, "rejected");

   actions.append(photo, approve, reject);
   card.append(info, actions);
   list.append(card);
  }

  const hl = $("#history-list");
  hl.innerHTML = "";

  if (!hist.length) {
   hl.innerHTML =
    '<div class="empty">Aucune décision enregistrée.</div>';
  }

  hist.forEach(x => {
   const d = document.createElement("div");
   d.className = "history-item";

   d.innerHTML = `
    <strong>${esc(x.reference)}</strong> —
    ${x.old_status
     ? esc(x.old_status) + " → "
     : ""}
    <strong>
     ${x.new_status === "approved" ? "Validée" : "Refusée"}
    </strong>
    <br>
    <span class="muted">
     ${date(x.created_at)} ·
     ${esc(x.admin_email || "Administrateur")}
    </span>
   `;

   hl.append(d);
  });

  say($("#admin-feedback"), "Données actualisées.");
 }

 async function changeStatus(row, status) {
  const verb = status === "approved" ? "valider" : "refuser";

  if (!confirm(`Confirmer : ${verb} la demande ${row.reference} ?`)) {
   return;
  }

  const { error } = await db
   .from("requests")
   .update({ status })
   .eq("id", row.id);

  if (error) {
   return say($("#admin-feedback"), error.message, true);
  }

  await loadAll();
 }

 checkSession();
})();
