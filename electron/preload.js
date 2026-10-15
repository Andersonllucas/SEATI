const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('seatiDesktop', {
  isDesktop: true,
  version: '1.0.0',
  platform: process.platform,
});
