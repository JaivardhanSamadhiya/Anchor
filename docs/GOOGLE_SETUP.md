# Activate Google login on Cloudflare

1. Deploy Anchor and copy its final HTTPS origin (no path, hash, or trailing slash).
2. In Google Cloud Console configure Google Auth Platform branding and audience. Create a **Web application** OAuth client named **Anchor Web**.
3. Add the Cloudflare origin to **Authorized JavaScript origins**. You can retain the original preview origin on the same client. For local testing add http://localhost and http://localhost:8787.
4. Remove empty redirect URI rows. Anchor uses the Google Identity Services JavaScript callback, so it requires no redirect URI or client secret.
5. Copy the client ID ending in .apps.googleusercontent.com.
6. In Cloudflare open the **anchor** Worker, then **Settings → Variables and Secrets**. Add **GOOGLE_CLIENT_ID** with the client ID; a secret binding is suitable and persists separately from source. Deploy that settings change, then refresh Anchor.
7. If Google is in Testing mode, add intended accounts under Google Auth Platform Audience → Test users.

The Google button should replace the unconfigured message. Perform a real login, save a fictional personal notice and receipt, and verify restoration on a second browser profile/device. Test sign-out and account separation before inviting real users.

Google identifies the user; workspace data lives in Anchor's D1/R2 storage, not Google Drive. PDF/OCR runs locally, while signed-in saving uploads personal records and their referenced files. Guests must explicitly import device work into an empty account. Practice activity is excluded from cloud saving.

The Cloudflare website has no Sites/ChatGPT visitor gate. Account records still require Anchor's verified session. Keep R2 private. Never commit .dev.vars, credentials, tokens, or real benefit documents. The Google Web client ID is a public identifier returned to the browser; no client secret is needed.

Official references: [Google setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [Cloudflare bindings](https://developers.cloudflare.com/workers/configuration/environment-variables/), [Automatic resource provisioning](https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/).
