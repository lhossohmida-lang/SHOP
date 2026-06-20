const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const Module = require("module");

let mainWindow = null;
let standaloneNodeModules = null;

// Hook Node's module resolution so that standalone modules can be resolved
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  try {
    return originalResolve(request, parent, isMain, options);
  } catch (err) {
    if (standaloneNodeModules && !path.isAbsolute(request) && !request.startsWith(".")) {
      try {
        const lookupPath = path.join(standaloneNodeModules, request);
        return originalResolve(lookupPath, parent, isMain, options);
      } catch (resolveErr) {
        // ignore and let original error throw
      }
    }
    throw err;
  }
};

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
  if (!fs.existsSync(envFile)) return {};

  const result = {};
  const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const [key, ...rest] = trimmed.split("=");
    if (key && rest.length > 0) {
      result[key.trim()] = rest.join("=").trim();
    }
  }
  return result;
}

function injectEnv() {
  const candidates = [
    path.join(process.resourcesPath, "app", ".env.production"),
    path.join(__dirname, "..", ".env.production"),
  ];

  for (const envFile of candidates) {
    const vars = readEnvFile(envFile);
    for (const [key, val] of Object.entries(vars)) {
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

function waitForServer(url, retries = 120, delay = 300) {
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
    path.join(process.resourcesPath, "app.asar.unpacked", ".next", "standalone"),
    path.join(process.resourcesPath, "app", ".next", "standalone"),
    path.join(__dirname, "..", ".next", "standalone"),
  ];

  for (const candidate of candidates) {
    const serverJs = path.join(candidate, "server.js");
    const nextPkg = path.join(candidate, "node_modules", "next");
    log(`Checking standalone candidate: ${candidate} | server.js: ${fs.existsSync(serverJs)} | next: ${fs.existsSync(nextPkg)}`);
    if (fs.existsSync(serverJs) && fs.existsSync(nextPkg)) {
      return candidate;
    }
  }
  return null;
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
      <p>لم يتمكن تطبيق بلقاسم من تشغيل نسخة Next.js المحلية داخل برنامج الحاسوب.</p>
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
    throw new Error(
      "Standalone Next.js build was not found in the packaged app.\n" +
      "Expected: resources/app/.next/standalone/server.js + node_modules/next"
    );
  }

  prepareStandalone(nextRoot);

  const port = await getAvailablePort(3000);
  const serverPath = path.join(nextRoot, "server.js");
  
  // Set standalone modules path for custom resolver hook
  standaloneNodeModules = path.join(nextRoot, "node_modules");

  log(`Starting local Next.js server inside main process from ${serverPath} on port ${port}`);
  log(`standalone node_modules: ${standaloneNodeModules}`);

  // Set production environment variables
  process.env.NODE_ENV = "production";
  process.env.PORT = String(port);
  process.env.HOSTNAME = "127.0.0.1";

  // Merge env files into process.env so they are available to Next.js
  const envCandidates = [
    path.join(process.resourcesPath, "app", ".env.production"),
    path.join(nextRoot, "..", "..", ".env.production"),
    path.join(nextRoot, ".env.production"),
  ];

  for (const envFile of envCandidates) {
    const vars = readEnvFile(envFile);
    for (const [key, val] of Object.entries(vars)) {
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }

  // Load the standalone server directly in the main process
  require(serverPath);

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
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
    title: "بلقاسم",
    backgroundColor: "#f8fdf5",
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "public", "icon.png"),
  });

  // Grant camera and microphone permissions automatically
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      const allowed = ["media", "camera", "microphone", "geolocation", "notifications", "display-capture"];
      callback(allowed.includes(permission));
    }
  );

  mainWindow.webContents.session.setPermissionCheckHandler(
    (_webContents, permission) => {
      const allowed = ["media", "camera", "microphone"];
      return allowed.includes(permission);
    }
  );

  // Always grant camera/microphone device access (no OS prompt blocking)
  mainWindow.webContents.session.setDevicePermissionHandler(() => true);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // 1. /api/print → always open in Chrome / Edge (system browser)
    if (url && url.includes("/api/print")) {
      shell.openExternal(url);
      return { action: "deny" };
    }

    // 2. Local app URLs (127.0.0.1 / localhost) → open inside a new Electron window
    //    e.g. F1 shortcut opens a second POS window at http://127.0.0.1:<port>/pos
    if (
      !url ||
      url === "about:blank" ||
      url.startsWith("about:") ||
      url.startsWith("http://127.0.0.1") ||
      url.startsWith("http://localhost")
    ) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            preload: path.join(__dirname, "preload.cjs"),
          },
        },
      };
    }

    // 3. All other external URLs → open in system browser
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

// طباعة محلية بحجم ورق محسوب من ارتفاع المحتوى — يلغي الفراغ الأبيض أسفل الوصل.
// نُحمّل HTML في نافذة مخفية، نقيس ارتفاع المحتوى، ثم نطبع بحجم ورق مطابق تماماً.
ipcMain.handle("print-html", async (_evt, { html, widthMm }) => {
  const w = widthMm || 80;
  // عرض النافذة ثابت (~84mm) حتى يتخطّط المحتوى بعرضه الصحيح؛ الارتفاع صغير ولا يؤثر على القياس.
  const printWin = new BrowserWindow({
    show: false,
    width: 320,
    height: 200,
    webPreferences: { offscreen: false, sandbox: false },
  });
  try {
    await printWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    // مهلة قصيرة حتى يستقر التخطيط والخطوط
    await new Promise((r) => setTimeout(r, 350));

    let heightPx = 0;
    try {
      // نقيس ارتفاع المحتوى الفعلي فقط (getBoundingClientRect على body) — وليس ارتفاع
      // نافذة المتصفح، حتى لا تنشأ صفحة طويلة جداً بفراغ كبير فوق/تحت التيكت.
      heightPx = await printWin.webContents.executeJavaScript(
        "Math.ceil(document.body.getBoundingClientRect().height)"
      );
    } catch {}

    // px → mm عند 96dpi (تغذية القص مضمّنة في نقاط .cut-feed أسفل المحتوى)
    const heightMm = Math.max(35, (heightPx / 96) * 25.4 + 2);
    const micron = (mm) => Math.round(mm * 1000);

    // اكتشف الطابعة الحرارية تلقائياً (Xprinter / POS / 80mm) لاستخدامها في الطباعة الصامتة
    let deviceName = "";
    try {
      const printers = await printWin.webContents.getPrintersAsync();
      const thermal = printers.find((p) =>
        /xp|xprinter|pos|thermal|receipt|80mm|58mm/i.test(`${p.name} ${p.displayName || ""}`)
      );
      const def = printers.find((p) => p.isDefault);
      deviceName = (thermal || def || printers[0] || {}).name || "";
      log(`print-html: using printer "${deviceName}" (${printers.length} available)`);
    } catch (e) {
      log("print-html: getPrintersAsync failed", e);
    }

    // طباعة صامتة تفرض ارتفاع الصفحة المحسوب بالضبط (لا نافذة تتجاوز الحجم) → صفحة واحدة، لا انقسام
    await new Promise((resolve) => {
      printWin.webContents.print(
        {
          silent: true,
          deviceName: deviceName || undefined,
          printBackground: true,
          margins: { marginType: "none" },
          pageSize: { width: micron(w), height: micron(heightMm) },
        },
        (success, failureReason) => {
          if (!success) log(`print-html: silent print failed: ${failureReason}`);
          resolve();
        }
      );
    });
  } catch (err) {
    log("print-html failed", err);
    throw err;
  } finally {
    setTimeout(() => { try { printWin.close(); } catch {} }, 1500);
  }
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
