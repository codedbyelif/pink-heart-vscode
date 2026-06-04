// @ts-check
const vscode = require("vscode");

const VIEW_ID = "pinkHeartRain.view";

/**
 * Provides the Heart Rain webview inside the sidebar.
 * Runs inside VS Code's own view container; background is transparent
 * so the theme's sidebar color shows through.
 * @implements {vscode.WebviewViewProvider}
 */
class HeartRainViewProvider {
  /** @param {vscode.ExtensionContext} context */
  constructor(context) {
    this.context = context;
    /** @type {vscode.WebviewView | undefined} */
    this._view = undefined;
  }

  /**
   * @param {vscode.WebviewView} webviewView
   */
  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [], // emoji only, no local assets needed
    };
    webviewView.webview.html = getWebviewContent(readConfig());

    webviewView.onDidDispose(() => {
      this._view = undefined;
    });
  }

  /** Push updated settings to the open view (live update) */
  pushConfig() {
    if (this._view) {
      this._view.webview.postMessage({ type: "config", config: readConfig() });
    }
  }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const provider = new HeartRainViewProvider(context);

  const viewReg = vscode.window.registerWebviewViewProvider(VIEW_ID, provider);

  const startCmd = vscode.commands.registerCommand("pinkHeartRain.start", () => {
    vscode.commands.executeCommand(VIEW_ID + ".focus");
  });

  const cfgListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("pinkHeartRain")) {
      provider.pushConfig();
    }
  });

  context.subscriptions.push(viewReg, startCmd, cfgListener);
}

function deactivate() {}

/** Read and normalize extension settings */
function readConfig() {
  const cfg = vscode.workspace.getConfiguration("pinkHeartRain");
  /** @type {Record<string, number>} */
  const speedMap = { slow: 4500, normal: 2800, fast: 1500 };
  const speedKey = cfg.get("speed", "fast");
  return {
    intensity: cfg.get("intensity", 12), // hearts per second
    fallMs: speedMap[speedKey] || speedMap.fast, // fall duration in ms
    emojis: cfg.get("emojis", ["💕", "❤️", "💖", "💗"]),
  };
}

/** Random nonce required for CSP */
function getNonce() {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

/**
 * @param {{intensity:number, fallMs:number, emojis:string[]}} config
 */
function getWebviewContent(config) {
  const nonce = getNonce();
  const cfgJson = JSON.stringify(config);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<title>Heart Rain</title>
<style>
  /* Transparent background — VS Code sidebar color shows through */
  html, body {
    margin: 0; padding: 0; height: 100%; overflow: hidden;
    background: transparent;
  }
  #sky { position: fixed; inset: 0; pointer-events: none; }
  .heart {
    position: absolute;
    top: -2em;
    font-size: 1.8em;
    will-change: transform, opacity;
    user-select: none;
    animation-name: fall;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }
  @keyframes fall {
    0%   { transform: translateY(-10vh) rotate(0deg);   opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { transform: translateY(110vh) rotate(360deg); opacity: 0; }
  }
</style>
</head>
<body>
  <div id="sky"></div>
  <script nonce="${nonce}">
    (function () {
      let config = ${cfgJson};
      const sky = document.getElementById("sky");
      let spawnTimer = null;

      function spawnHeart() {
        const el = document.createElement("div");
        el.className = "heart";
        const emojis = config.emojis && config.emojis.length ? config.emojis : ["💕"];
        el.textContent = emojis[Math.floor(Math.random() * emojis.length)];

        el.style.left = Math.random() * 100 + "vw";
        el.style.fontSize = (1.2 + Math.random() * 1.6) + "em";
        const dur = config.fallMs * (0.7 + Math.random() * 0.6);
        el.style.animationDuration = dur + "ms";

        sky.appendChild(el);

        // Remove heart from DOM after animation to prevent accumulation
        el.addEventListener("animationend", function () { el.remove(); });
        setTimeout(function () { el.remove(); }, dur + 1000);
      }

      function restart() {
        if (spawnTimer) clearInterval(spawnTimer);
        const intervalMs = Math.max(30, 1000 / Math.max(1, config.intensity));
        spawnTimer = setInterval(spawnHeart, intervalMs);
      }

      window.addEventListener("message", function (event) {
        const msg = event.data;
        if (msg && msg.type === "config") {
          config = msg.config;
          restart();
        }
      });

      // Pause spawning when the tab is not visible
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
          if (spawnTimer) clearInterval(spawnTimer);
        } else {
          restart();
        }
      });

      restart();
    })();
  </script>
</body>
</html>`;
}

module.exports = { activate, deactivate };
