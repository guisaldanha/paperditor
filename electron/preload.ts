import { ipcRenderer, contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => {
      const validChannels = [
        'dialog:openFile',
        'dialog:saveFile',
        'dialog:exportPdf',
        'dialog:exportHtml',
        'dialog:exportDocx',
        'dialog:print',
        'dialog:showUnsavedDialog',
        'app:confirmClose',
        'file:new',
        'file:open',
        'shell:openExternal',
      ];
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      return Promise.reject(new Error(`Invalid channel: ${channel}`));
    },
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      const validChannels = [
        'menu:new',
        'menu:open',
        'menu:save',
        'menu:saveAs',
        'menu:exportPdf',
        'menu:print',
        'app:close-requested',
        'file:opened',
      ];
      if (validChannels.includes(channel)) {
        const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...args);
        ipcRenderer.on(channel, subscription);
        return () => {
          ipcRenderer.removeListener(channel, subscription);
        };
      }
      return () => {};
    },
  },
});