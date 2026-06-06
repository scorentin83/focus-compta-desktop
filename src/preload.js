const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('api', {
    version: '0.3'
});