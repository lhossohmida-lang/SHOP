const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const { fork } = require("child_process");

let serverProcess = null;

let mainWindow = null;

function log(message, error) {
  try {
    const logFile = path.join(app.getPath("userData"), "launcher.log");
    const line = `[${new Date().toISOString()}] ${message}${
      error ? `\n${error.stack || error.message || String(error)}` : ""
    }\n`;
    fs.appendFileSync(logFile, line, "utf8");
  } catch {
    // Logging must never block app startup.
  }
}

function readEnvFile(envFile) {
  if (!fs.existsSync(envFile)) return;

  const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const [key, ...rest] = trimmed.split("=");
    if (key && rest.length > 0 && process.env[key.trim()] === undefined) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  }
}

function injectEnv() {
  const candidates = [
    path.join(process.resourcesPath, "app", ".env.production"),
    path.join(__dirname, "..", ".env.production"),
  ];

  for (const envFile of candidates) {
    readEnvFile(envFile);
  }
}

function waitForServer(url, retries = 80, delay = 250) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http
        .get(url, (res) => {
          res.resume();
          if (res.statusCode < 500) resolve();
          else if (retries-- > 0) setTimeout(attempt, delay);
          else reject(new Error(`Server returned ${res.statusCode}`));
        })
        .on("error", (err) => {
          if (retries-- > 0) setTimeout(attempt, delay);
          else reject(err);
        });
    };

    attempt();
  });
}

function getAvailablePort(startPort = 3000) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const server = http.createServer();
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          tryPort(port + 1);
          return;
        }
        reject(err);
      });
      server.once("listening", () => {
        server.close(() => resolve(port));
      });
      server.listen(port, "127.0.0.1");
    };

    tryPort(startPort);
  });
}

function copyIfMissing(src, dst) {
  if (!fs.existsSync(src) || fs.existsSync(dst)) return;
  fs.cpSync(src, dst, { recursive: true });
}

function prepareStandalone(nextRoot) {
  copyIfMissing(path.join(nextRoot, "..", "static"), path.join(nextRoot, ".next", "static"));
  copyIfMissing(path.join(nextRoot, "..", "..", "public"), path.join(nextRoot, "public"));
}

function findStandaloneRoot() {
  const candidates = [
    path.join(process.resourcesPath, "app", ".next", "standalone"),
    path.join(__dirname, "..", ".next", "standalone"),
  ];

  return candidates.find(
    (candidate) =>
      fs.existsSync(path.join(candidate, "server.js")) &&
      fs.existsSync(path.join(candidate, "node_modules", "next"))
  );
}

function loadStartupError(error) {
  const message = String(error?.message || error || "Unknown startup error");
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f8fdf5;
        color: #17231c;
        font-family: Tahoma, Arial, sans-serif;
      }
      main {
        width: min(560px, calc(100vw - 48px));
        padding: 28px;
        border: 1px solid #c5e5b8;
        border-radius: 12px;
        background: white;
        box-shadow: 0 16px 40px rgba(23, 35, 28, 0.12);
      }
      h1 { margin: 0 0 12px; font-size: 22px; }
      p { line-height: 1.7; color: #4b5563; }
      code {
        display: block;
        margin-top: 16px;
        padding: 12px;
        direction: ltr;
        text-align: left;
        white-space: pre-wrap;
        background: #f3f4f6;
        border-radius: 8px;
        color: #991b1b;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>تعذر تشغيل السيرفر المحلي</h1>
      <p>لم يتمكن تطبيق Blgasm POS من تشغيل نسخة Next.js المحلية داخل برنامج الحاسوب.</p>
      <code>${message.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]))}</code>
    </main>
  </body>
</html>`;

  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function startNextServer() {
  injectEnv();

  const nextRoot = findStandaloneRoot();
  if (!nextRoot) {
    throw new Error("Standalone Next.js build was not found in the packaged app.");
  }

  prepareStandalone(nextRoot);

  const port = await getAvailablePort(3000);
  const serverPath = path.join(nextRoot, "server.js");
  const standaloneNodeModules = path.join(nextRoot, "node_modules");

  log(`Starting local Next.js server from ${serverPath} on port ${port}`);

  await new Promise((resolve, reject) => {
    // Read env file candidates so child process inherits them
    const envCandidates = [
      path.join(process.resourcesPath, "app", ".env.production"),
      path.join(nextRoot, "..", "..", ".env.production"),
      path.join(nextRoot, ".env.production"),
    ];

    const childEnv = {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      // Ensure standalone node_modules takes priority for module resolution
      NODE_PATH: standaloneNodeModules,
    };

    // Inject env file values into child env
    for (const envFile of envCandidates) {
      if (!fs.existsSync(envFile)) continue;
      const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [key, ...rest] = trimmed.split("=");
        if (key && rest.length > 0 && childEnv[key.trim()] === undefined) {
          childEnv[key.trim()] = rest.join("=").trim();
        }
      }
    }

    serverProcess = fork(serverPath, [], {
      cwd: nextRoot,
      env: childEnv,
      // Use the standalone node_modules for resolution
      execArgv: ["--require", "module"].concat(
        [`--experimental-loader`].length ? [] : []
      ),
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });

    if (serverProcess.stdout) {
      serverProcess.stdout.on("data", (d) => log(`[server] ${d.toString().trim()}`));
    }
    if (serverProcess.stderr) {
      serverProcess.stderr.on("data", (d) => log(`[server-err] ${d.toString().trim()}`));
    }

    serverProcess.on("error", (err) => {
      log("Server process error", err);
      reject(err);
    });

    serverProcess.on("exit", (code) => {
      log(`Server process exited with code ${code}`);
      if (code !== 0 && code !== null) {
        reject(new Error(`Server process exited with code ${code}`));
      }
    });

    // Resolve once server is ready (we'll poll via waitForServer)
    resolve();
  });

  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url, 120, 300);
  return url;
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

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    log(`Failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
  });

  try {
    const serverUrl = await startNextServer();
    await mainWindow.loadURL(`${serverUrl}/dashboard`);
  } catch (err) {
    log("Failed to start local Next.js server", err);
    loadStartupError(err);
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  if (serverProcess) {
    try { serverProcess.kill(); } catch {}
    serverProcess = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
