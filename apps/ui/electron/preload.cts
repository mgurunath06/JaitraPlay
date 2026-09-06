import { contextBridge, ipcRenderer } from "electron";

type CommandType = "BEGIN_INTERACTION" | "WELCOME_COMPLETE";
interface QuestionRequest {
  previousPrompt: string | null;
  neededHint: boolean;
  recentPrompts: string[];
}

contextBridge.exposeInMainWorld("jaitra", {
  identity: (action: "get" | "save" | "delete", profile?: unknown) => ipcRenderer.invoke("jaitra:identity", action, profile),
  transcribe: (request: { audio: string; sampleRate: number; phrases?: string[] }) => ipcRenderer.invoke("jaitra:transcribe", request),
  quit: () => ipcRenderer.invoke("jaitra:quit"),
  getSnapshot: () => ipcRenderer.invoke("jaitra:get-snapshot"),
  sendCommand: (type: CommandType) => ipcRenderer.invoke("jaitra:send-command", type),
  getQuestion: (activityId: string, request: QuestionRequest) =>
    ipcRenderer.invoke("jaitra:get-question", activityId, request),
  createStorybook: (topic: string | null) => ipcRenderer.invoke("jaitra:create-storybook", topic),
  listStorybooks: () => ipcRenderer.invoke("jaitra:list-storybooks"),
  getStorybook: (storyId: string) => ipcRenderer.invoke("jaitra:get-storybook", storyId),
  getStorybookImage: (storyId: string, pageNumber: number) =>
    ipcRenderer.invoke("jaitra:get-storybook-image", storyId, pageNumber),
});
