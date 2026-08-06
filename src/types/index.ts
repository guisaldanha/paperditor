export interface FileOperations {
  openFile: () => Promise<{ content: string; path: string } | null>;
  saveFile: (content: string, path?: string) => Promise<string | null>;
  exportPdf: () => Promise<void>;
}

export interface ElectronAPI {
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    on: (channel: string, listener: (...args: unknown[]) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}