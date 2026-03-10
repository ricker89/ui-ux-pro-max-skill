// _worker.js
// Thin Cloudflare Pages worker — serves all static files as-is.
// Required so wrangler doesn't complain about "assets-only Worker with binding".

export default {
  async fetch(request, env) {
    // Delegate everything to the static asset handler provided by Pages
    return env.ASSETS.fetch(request);
  }
};
