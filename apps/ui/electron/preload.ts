import { contextBridge, ipcRenderer } from "electron";

type CommandType = "BEGIN_INTERACTION" | "WELCOME_COMPLETE";

contextBridge.exposeInMainWorld("jaitra", {
  getSnapshot: () => ipcRenderer.invoke("jaitra:get-snapshot"),
  sendCommand: (type: CommandType) => ipcRenderer.invoke("jaitra:send-command", type),
});
