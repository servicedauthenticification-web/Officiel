# SERVICE D’AUTHENTIFICATION

Projet web responsive en français. Frontend statique pour GitHub Pages, base et stockage privés sur Supabase, administration par Supabase Auth et notification par e-mail via Resend.

## Fonctionnalités
- Formulaire public : e-mail, montant indiqué sur le justificatif et photo depuis appareil ou galerie.
- Validation du type et de la taille du fichier (JPG/PNG/WebP, 8 Mo max).
- Référence unique et date automatique côté base de données.
- Bucket privé `proofs`.
- Suivi public limité à la référence + e-mail (retourne uniquement le statut).
- Administration : connexion, demandes, lien temporaire signé vers photo, validation/refus, historique, déconnexion.
- Notification e-mail à `servicedautentification@gmail.com` (nécessite le déploiement de la fonction Edge).

## Sécurité et limites
- Le fichier `config.js` contient uniquement l'URL Supabase et la clé anon/publishable : ces valeurs sont destinées au navigateur. Les politiques RLS constituent la barrière de sécurité.
- **Ne jamais publier la clé `service_role`, une clé secrète Resend ou un mot de passe dans le dépôt GitHub ou dans le JavaScript navigateur.**
- Le formulaire impose la confirmation que les PIN, codes de recharge et codes-barres exploitables sont masqués. N'utilisez pas ce site pour collecter des codes de paiement ou des numéros secrets.
- L'upload public est limité par le bucket (types MIME et 8 Mo), mais reste exposé au spam. Avant ouverture publique à grande échelle, ajoutez un CAPTCHA (ex. Cloudflare Turnstile) et une limitation de débit.
- Les notifications sont une commodité, pas une preuve de dépôt : la demande est enregistrée dans Supabase avant l'appel e-mail.
- Le site n'est pas connecté à un service tiers de validation automatique des tickets. La décision est manuelle dans le tableau de bord.
- L'administrateur doit être ajouté explicitement dans `admin_users`. Un compte Auth seul ne donne pas accès aux demandes.
- Le code fourni est une base déployable après configuration ; Supabase, GitHub Pages et Resend ne sont pas préconfigurés.

## 1. Créer Supabase
1. Ouvrez https://supabase.com/ et créez un compte, puis **New project**.
2. Choisissez un nom de projet, un mot de passe DB robuste et une région proche de vos utilisateurs. Conservez le mot de passe DB hors du dépôt.
3. Dans **Project Settings → API** (ou **Data API** selon l'interface), copiez le **Project URL** et la clé **anon/public** ou **publishable**.
4. Collez ces deux valeurs dans `config.js`, à la place des textes `VOTRE-PROJET` et `VOTRE_CLE`.
5. Ouvrez **SQL Editor → New query**, collez tout le contenu de `supabase/schema.sql`, puis cliquez **Run**.

## 2. Créer le compte administrateur
1. Dans Supabase, ouvrez **Authentication → Users → Add user**.
2. Créez le compte avec l'adresse e-mail de l'administrateur et un mot de passe long et unique. Confirmez l'utilisateur si l'interface le demande.
3. Copiez son UUID dans la liste des utilisateurs.
4. Dans SQL Editor, exécutez :
   ```sql
   insert into public.admin_users(user_id) values ('COLLER-ICI-UUID-ADMIN');
   ```
5. Testez `admin.html`. Seuls les utilisateurs ajoutés à `admin_users` peuvent lire ou modifier les demandes et voir les photos.

## 3. Activer les notifications e-mail (Resend)
1. Créez un compte sur https://resend.com/ et vérifiez un domaine d'envoi dans Resend. N'utilisez pas une adresse d'expéditeur inventée : utilisez une adresse validée sur votre domaine.
2. Créez une API key Resend. Elle reste secrète.
3. Installez Supabase CLI, connectez-vous (`supabase login`), puis liez le projet depuis ce dossier (`supabase link --project-ref VOTRE_REF`).
4. Définissez les secrets :
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
   supabase secrets set MAIL_FROM="Service d'authentification <notifications@votre-domaine.fr>"
   ```
5. Déployez :
   ```bash
   supabase functions deploy notify-new-request
   ```
La fonction envoie une alerte à `servicedautentification@gmail.com`. Le domaine expéditeur doit être validé par Resend. La clé Resend n'est jamais mise dans le navigateur.

## 4. Déployer sur GitHub Pages
1. Créez un dépôt GitHub, par exemple `service-authentification`.
2. Téléversez `index.html`, `admin.html`, `styles.css`, `config.js`, `app.js`, `admin.js` et le dossier `supabase` (le dossier Supabase peut être conservé dans le dépôt privé ou public, il ne contient pas de secret).
3. Dans GitHub : **Settings → Pages → Deploy from a branch**, choisissez `main` et `/ (root)`, puis **Save**.
4. Attendez la publication. Le site sera accessible à l'adresse GitHub Pages affichée dans Settings → Pages.
5. Testez depuis un téléphone et un ordinateur. Le navigateur doit être connecté à Internet pour charger Supabase JS et Google Fonts.

## 5. Test complet avant lancement
- Envoyez une demande test avec une photo dont les codes sensibles sont masqués.
- Vérifiez la ligne dans Supabase → Table Editor → `requests`.
- Connectez-vous à `admin.html`, ouvrez le justificatif, puis validez ou refusez.
- Vérifiez `request_history`.
- Utilisez la référence et le même e-mail dans le suivi public.
- Vérifiez la réception de l'e-mail. Si la demande apparaît dans Supabase mais pas l'e-mail, vérifiez le déploiement de la fonction et les secrets Resend.

## Arborescence
```text
service-authentification/
├── index.html
├── admin.html
├── styles.css
├── config.js
├── app.js
├── admin.js
└── supabase/
    ├── schema.sql
    └── functions/
        └── notify-new-request/
            └── index.ts
```

## Dépannage
- « Configuration Supabase manquante » : vérifiez l'URL et la clé dans `config.js`, puis republiez.
- « new row violates row-level security » : vérifiez que `schema.sql` a été exécuté et que le nom de bucket est `proofs`.
- L'administrateur voit une erreur RLS : vérifiez que l'UUID de son compte Auth est présent dans `public.admin_users`.
- Photo inaccessible : le bucket doit rester privé et l'utilisateur connecté doit être un administrateur autorisé.
