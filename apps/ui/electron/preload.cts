import { contextBridge, ipcRenderer } from "electron";

type CommandType = "BEGIN_INTERACTION" | "WELCOME_COMPLETE";
interface QuestionRequest {
  previousPrompt: string | null;
  neededHint: boolean;
  recentPrompts: string[];
}

contextBridge.exposeInMainWorld("jaitra", {
  getSnapshot: () => ipcRenderer.invoke("jaitra:get-snapshot"),
  sendCommand: (type: CommandType) => ipcRenderer.invoke("jaitra:send-command", type),
  getQuestion: (activityId: string, request: QuestionRequest) =>
    ipcRenderer.invoke("jaitra:get-question", activityId, request),
});
