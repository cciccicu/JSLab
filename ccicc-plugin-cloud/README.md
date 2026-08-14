# JSLab-Cloud

`jslab-cloud/` is the installable ccicc.icu plugin for JSLab cloud files, device pairing, the JS market, account activation, and server-side AI generation. Its manifest ID is `jslab-cloud`; `JSLab Cloud` is the public plugin name and a feature of ccicc.icu.

## Install and endpoint

Package from `jslab-cloud/` with:

```powershell
npm run pack -- .\ .\dist\jslab-cloud-0.5.0.zip
```

Install the ZIP through ccicc.icu. The current development quick-app endpoint is `http://192.168.3.17:3000/jslab-cloud`. With Caddy integration enabled, the plugin also registers the `jslab-api` subdomain for a future HTTPS endpoint.

## Activation and AI

Only an activated account can use the cloud file space or AI generation. An administrator opens **JSLab Cloud 管理**, generates a batch of activation codes, and distributes the codes outside the site. Codes are displayed once and only SHA-256 hashes are retained.

- A user's first valid code enables the cloud file space and AI and grants ¥2.00 AI credit.
- Every later unused code redeemed by that account grants ¥3.00 AI credit.
- AI requests are sent from the server to the configured OpenAI-compatible API. The device receives generated source and token usage only; it never receives the provider key.
- Credit is reserved before the provider request, then settled from the provider's reported `prompt_tokens` and `completion_tokens`. Failed or invalid provider responses release the reservation.

Choose either manual moderation or single-LLM moderation for the market. In single-LLM mode, the configured moderation model makes the final decision; an unavailable or invalid provider response leaves the submission pending. Configure the **code generation AI** separately before enabling device-side generation:

- `aiApiUrl`: OpenAI-compatible chat-completions URL.
- `aiApiKey`: provider secret, stored only in plugin configuration.
- `aiModel`: model identifier; the default is `deepseek-ai/DeepSeek-V4-Flash`.
- `aiInputCentsPerMillionTokens`, `aiCachedInputCentsPerMillionTokens`, and `aiOutputCentsPerMillionTokens`: cache-miss input, cache-hit input, and output prices in cents per 1,000,000 tokens (分/M Token).
- `aiMaxOutputTokens` and `aiRequestTimeoutMs`: generation limits. The default output allowance is 8192 tokens for the long-context model.

The AI endpoint accepts a paired-device token and returns only `.js` or `.ui.js` source below 48 KiB. The server composes a common JSLab/Vela API reference with a Console-specific or UI-specific prompt, then appends sanitized runtime information from the watch (336x480 screen, design width, platform, transport, editor version, and resource limits). The system prompt stays exclusively on the server. Do not place provider keys, device tokens, or activation codes in scripts or market packages.

## Web workspace

The inherited-mode SSR workspace is available at `/jslab-cloud/workspace`. It uses the host Nunjucks layout and Bootstrap components, with plugin-scoped CSS and progressive JavaScript under `assets/`.

- Search, create, rename and edit `.js` or `.ui.js` scripts.
- Keep browser-local drafts, enforce the 48 KiB limit and validate JavaScript on save.
- Manage one current copy of each cloud file with no visible or internal revision history. The watch only uploads and downloads when the user explicitly requests it.
- Search the market, inspect and download source, browse authors, report scripts, publish independent snapshots, and manage pending or published submissions even after deleting the source cloud file.
- Activate cloud/AI credit and pair or revoke devices.
- Moderate market submissions, inspect reports, issue activation codes and review AI usage in the admin page.
