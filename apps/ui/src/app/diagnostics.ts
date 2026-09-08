export function diagnostic(event: string, data: Record<string, string | number | boolean> = {}) {
  // Never send transcripts, prompts, device IDs, frame coordinates or media.
  window.jaitra?.diagnostic?.(event, data);
}

export function installDiagnostics() {
  window.addEventListener("error", event => diagnostic("renderer.error", {
    error: event.error instanceof Error ? event.error.name : "ResourceError",
    source: event.filename.split("/").pop()?.split("?")[0] ?? "unknown",
    line: event.lineno, column: event.colno,
  }));
  window.addEventListener("unhandledrejection", event => diagnostic("renderer.rejection", {
    error: event.reason instanceof Error ? event.reason.name : "UnknownError",
  }));
}
