const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const http = require("http");

let mainWindow = null;

function waitForServer(url, retries = 30, delay = 1000) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 404) resolve();
        else setTimeout(attempt, delay);
      }).on("error", () => {
        if (retries-- > 0) setTimeout(attempt, delay);
        else reject(new Error("Server did not start in time"));
      });
    };
    attempt();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
    title: "Blgasm POS",
    backgroundColor: "#f8fdf5",
    show: false,
    autoHideMenuBar: true,
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
    // Try standalone Next.js server
    const nextPath = path.join(__dirname, "..", ".next", "standalone");
    const fs = require("fs");

    if (fs.existsSync(nextPath)) {
      process.env.NODE_ENV = "production";
      process.env.PORT = "3000";
      const serverPath = path.join(nextPath, "server.js");
      require(serverPath);
      await waitForServer("http://localhost:3000");
      mainWindow.loadURL("http://localhost:3000/dashboard");
    } else {
      // Dev mode fallback
      mainWindow.loadURL("http://localhost:3000/dashboard");
    }
  } catch (err) {
    console.error("Failed to start server:", err);
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
