
(() => {
  const cfg = window.APP_CONFIG || {};
  const ready =
    cfg.SUPABASE_URL?.startsWith("https://") &&
    !cfg.SUPABASE_URL.includes("VOTRE-PROJET") &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_ANON_KEY.includes("VOTRE_CLE");

  const client = ready && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  const $ = (s) => document.querySelector(s);
  $("#year").textContent = new Date().getFullYear();

  const form = $("#request-form");
  const file = $("#photo");
  const feedback = $("#form-feedback");
  const submit = $("#submit-btn");

  $(".upload-box").addEventListener("click", () => file.click());

  file.addEventListener("change", () => {
    $("#file-name").textContent =
      file.files[0]?.name || "Aucun fichier sélectionné";
  });

  function message(el, text, error = false) {
    el.textContent = text;
    el.classList.toggle("error", error);
  }

  if (!client) {
    message(
      feedback,
      "Le site n’est pas encore connecté à Supabase. Vérifiez config.js.",
      true
    );
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!client) {
      return message(feedback, "Configuration Supabase manquante.", true);
    }

    const f = file.files[0];
    const data = new FormData(form);

    if (!f) {
      return message(feedback, "Veuillez ajouter une photo.", true);
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      return message(feedback, "Format non accepté. Utilisez JPG, PNG ou WEBP.", true);
    }

    if (!$("#redaction-confirm").checked) {
      return message(
        feedback,
        "Veuillez confirmer que les codes sensibles sont masqués.",
        true
      );
    }

    submit.disabled = true;
    submit.textContent = "ENVOI EN COURS…";
    message(feedback, "Transmission sécurisée de votre demande…");

    try {
      const id = crypto.randomUUID();

      const ext =
        f.type === "image/png" ? "png" :
        f.type === "image/webp" ? "webp" : "jpg";

      const path = `${id}.${ext}`;

      const upload = await client.storage
        .from("Proof")
        .upload(path, f, {
          contentType: f.type,
          upsert: false
        });

      if (upload.error) throw upload.error;

      const { data: row, error } = await client
        .from("requests")
        .insert({
          id,
          email: String(data.get("email")).trim().toLowerCase(),
          amount: Number(data.get("amount")),
          photo_path: path,
          status: "pending"
        })
        .select("reference")
        .single();

      if (error) {
        await client.storage.from("Proof").remove([path]);
        throw error;
      }

      try {
        await client.functions.invoke("notify-new-request", {
          body: {
            reference: row.reference,
            amount: Number(data.get("amount")),
            created_at: new Date().toISOString()
          }
        });
      } catch (_) {}

      form.reset();
      $("#file-name").textContent = "Aucun fichier sélectionné";

      message(
        feedback,
        `Demande enregistrée. Votre référence est ${row.reference}. Conservez-la pour suivre votre dossier.`
      );

    } catch (err) {
      console.error(err);
      message(
        feedback,
        err.message || "Une erreur est survenue. Réessayez plus tard.",
        true
      );
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'ENVOYER LA DEMANDE <span>→</span>';
    }
  });

  $("#track-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const out = $("#track-result");
    out.textContent = "";

    if (!client) {
      return message(out, "Le service n’est pas encore configuré.", true);
    }

    const fd = new FormData(e.currentTarget);

    const { data, error } = await client.rpc("check_request_status", {
      p_reference: String(fd.get("reference")).trim().toUpperCase(),
      p_email: String(fd.get("email")).trim().toLowerCase()
    });

    if (error || !data || !data.length) {
      return message(
        out,
        "Aucune demande correspondante. Vérifiez la référence et l’adresse e-mail.",
        true
      );
    }

    const item = data[0];

    const labels = {
      pending: "Votre demande est en cours de vérification.",
      approved: "Votre ticket a été authentifié avec succès. Merci d’utiliser le Service d’authentification.",
      rejected: "La vérification de votre demande n’a pas été validée. Veuillez contacter le service concerné."
    };

    const status = document.createElement("span");
    status.className = `status ${item.status}`;
    status.textContent = {
      pending: "En attente",
      approved: "Validée",
      rejected: "Refusée"
    }[item.status];

    out.append(status, document.createTextNode(" " + labels[item.status]));
  });
})();
