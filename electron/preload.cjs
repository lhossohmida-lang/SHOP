const { contextBridge, ipcRenderer } = require("electron");

// جسر آمن للطباعة المحلية من Electron: يطبع المحتوى بحجم ورق محسوب من ارتفاع
// المحتوى نفسه (بدل A4) فلا يبقى فراغ أبيض أسفل الوصل على الطابعات الحرارية.
contextBridge.exposeInMainWorld("electronAPI", {
  printHTML: (html, widthMm) => ipcRenderer.invoke("print-html", { html, widthMm }),
});
