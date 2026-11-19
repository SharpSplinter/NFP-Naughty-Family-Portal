const APPLICATION_ID = process.env.DISCORD_APP_ID || "1558700958983389254";
const INTERACTIONS_ENDPOINT = process.env.DISCORD_INTERACTIONS_ENDPOINT || "https://naughty-company-bot.kboone801.workers.dev";
const TOKEN = (process.env.DISCORD_TOKEN || "").replace(/^Bot\\s+/i, "").trim();

if (!TOKEN) throw new Error("Missing DISCORD_TOKEN. Add it as a repository Actions secret.");
let endpointUrl;
try { endpointUrl = new URL(INTERACTIONS_ENDPOINT); } catch { throw new Error("DISCORD_INTERACTIONS_ENDPOINT must be a valid HTTPS URL."); }
if (endpointUrl.protocol !== "https:") throw new Error("DISCORD_INTERACTIONS_ENDPOINT must be a valid HTTPS URL.");

const headers = {
  authorization: "Bot " + TOKEN,
  "content-type": "application/json",
  "user-agent": "NaughtyCompanyDashboardEndpointSync/2.0"
};
async function request(method, url, body) {
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error("Discord API " + method + " " + response.status + ": " + JSON.stringify(data).slice(0, 1000));
  return data;
}
function requireUserInstall(application) {
  const config = application?.integration_types_config;
  if (!config || !Object.prototype.hasOwnProperty.call(config, "1")) {
    throw new Error("Discord User Install is not enabled for this application. In Discord Developer Portal, open Application → Installation → Installation Contexts, enable User Install, and save before deploying global DM commands.");
  }
}
const api = "https://discord.com/api/v10";
const current = await request("GET", api + "/applications/@me");
if (String(current?.id || "") !== APPLICATION_ID) {
  throw new Error("Discord token belongs to application " + String(current?.id || "unknown") + ", expected " + APPLICATION_ID + ".");
}
requireUserInstall(current);

if (process.argv.includes("--check-install")) {
  console.log("Verified Discord User Install is enabled for application " + APPLICATION_ID + ".");
} else {
  const existing = current.integration_types_config || {};
  const userConfig = existing["1"] || {};
  const desiredUserConfig = {
    ...userConfig,
    oauth2_install_params: { scopes: ["applications.commands"], permissions: "0" }
  };
  const nextConfig = { ...existing, "1": desiredUserConfig };
  const needsUserInstallDefaults = JSON.stringify(userConfig.oauth2_install_params || {}) !== JSON.stringify(desiredUserConfig.oauth2_install_params);
  const needsEndpointUpdate = current.interactions_endpoint_url !== INTERACTIONS_ENDPOINT;
  if (!needsUserInstallDefaults && !needsEndpointUpdate) {
    console.log("Discord User Install defaults and interactions endpoint already target the production Worker.");
  } else {
    const updated = await request("PATCH", api + "/applications/@me", {
      integration_types_config: nextConfig,
      interactions_endpoint_url: INTERACTIONS_ENDPOINT
    });
    requireUserInstall(updated);
    if (updated.interactions_endpoint_url !== INTERACTIONS_ENDPOINT) {
      throw new Error("Discord did not confirm the expected production interactions endpoint.");
    }
    const savedScopes = updated.integration_types_config?.["1"]?.oauth2_install_params?.scopes || [];
    if (!savedScopes.includes("applications.commands")) {
      throw new Error("Discord did not save the applications.commands scope for User Install.");
    }
    console.log("Discord User Install defaults now request applications.commands only; no bot or guild permissions are requested.");
    console.log("Discord interactions endpoint now targets production: " + updated.interactions_endpoint_url);
  }
}
