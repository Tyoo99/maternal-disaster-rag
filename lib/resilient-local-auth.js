const fs = require("node:fs");
const { LocalAuth } = require("whatsapp-web.js");

const WINDOWS_LOCK_ERRORS = new Set(["EBUSY", "EPERM", "ENOTEMPTY"]);

class ResilientLocalAuth extends LocalAuth {
  async afterBrowserInitialized() {
    const page = this.client?.pupPage;
    const userAgent = this.client?.options?.userAgent;
    if (!page || !userAgent) return;

    const chromeVersion = userAgent.match(/Chrome\/(\d+(?:\.\d+){0,3})/)?.[1] || "146.0.0.0";
    const majorVersion = chromeVersion.split(".")[0];

    await page.setUserAgent({
      userAgent,
      userAgentMetadata: {
        brands: [
          { brand: "Chromium", version: majorVersion },
          { brand: "Google Chrome", version: majorVersion },
          { brand: "Not_A Brand", version: "99" }
        ],
        fullVersionList: [
          { brand: "Chromium", version: chromeVersion },
          { brand: "Google Chrome", version: chromeVersion },
          { brand: "Not_A Brand", version: "99.0.0.0" }
        ],
        fullVersion: chromeVersion,
        platform: "Windows",
        platformVersion: "10.0.0",
        architecture: "x86",
        bitness: "64",
        model: "",
        mobile: false,
        wow64: false
      }
    });
  }

  async logout() {
    if (!this.userDataDir) return;

    try {
      await fs.promises.rm(this.userDataDir, {
        recursive: true,
        force: true,
        maxRetries: this.rmMaxRetries,
        retryDelay: 250
      });
    } catch (error) {
      if (!WINDOWS_LOCK_ERRORS.has(error?.code)) throw error;

      console.warn(
        `[WA] Folder sesi masih dikunci Chromium (${error.code}); ` +
        "pembersihan ditunda agar server tetap berjalan. Gunakan Reset setelah bot berhenti."
      );
    }
  }
}

module.exports = ResilientLocalAuth;
