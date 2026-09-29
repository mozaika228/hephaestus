const { app, BrowserWindow } = require("electron");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#030606",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const webAppUrl = process.env.HEPHAESTUS_WEB_URL || "http://localhost:3000";
  win.loadURL(webAppUrl);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
