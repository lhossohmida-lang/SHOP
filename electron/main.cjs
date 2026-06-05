const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");

let mainWindow = null;
let serverProcess = null;

// ─── Inject Firebase + AI env vars into the packaged app ─────────────────────
function injectEnv() {
  const envFile = path.join(__dirname, "..", ".env.production");
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, "utf-8").split("\n");
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...rest] = trimmed.split("=");
        if (key && rest.length > 0) {
          process.env[key.trim()] = rest.join("=").trim();
        }
      }
    });
  }
}

function waitForServer(url, retries = 40, delay = 1000) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http
        .get(url, (res) => {
          if (res.statusCode < 500) resolve();
          else setTimeout(attempt, delay);
        })
        .on("error", () => {
          if (retries-- > 0) setTimeout(attempt, delay);
          else reject(new Error("Server did not start in time"));
        });
    };
    attempt();
  });
}

async function startNextServer() {
  const standalonePath = path.join(process.resourcesPath, "app", ".next", "standalone");
  const devStandalone = path.join(__dirname, "..", ".next", "standalone");

  const nextRoot = fs.existsSync(standalonePath) ? standalonePath : fs.existsSync(devStandalone) ? devStandalone : null;

  if (!nextRoot) {
    console.warn("Standalone build not found – connecting to dev server");
    return false;
  }

  injectEnv();

  process.env.NODE_ENV = "production";
  process.env.PORT = "3000";
  process.env.HOSTNAME = "127.0.0.1";

  // Copy static assets into standalone if not already there
  const staticSrc = path.join(nextRoot, "..", "static");
  const staticDst = path.join(nextRoot, ".next", "static");
  if (fs.existsSync(staticSrc) && !fs.existsSync(staticDst)) {
    fs.cpSync(staticSrc, staticDst, { recursive: true });
  }

  const serverPath = path.join(nextRoot, "server.js");
  require(serverPath);
  await waitForServer("http://127.0.0.1:3000");
  return true;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
    title: "Blgasm POS",
    backgroundColor: "#f8fdf5",
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "public", "icon.png"),
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  try {
    const started = await startNextServer();
    mainWindow.loadURL(started ? "http://127.0.0.1:3000/dashboard" : "http://localhost:3000/dashboard");
  } catch (err) {
    console.error("Failed to start Next.js server:", err);
    // Fallback to dev server
    mainWindow.loadURL("http://localhost:3000/dashboard");
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
