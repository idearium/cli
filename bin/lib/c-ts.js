'use strict';

const os = require('os');

const platform = os.platform();
let app;

if (platform === 'darwin') {
    // MacOS
    app = '/Applications/Tailscale.app/Contents/MacOS/Tailscale';
}

if (platform === 'linux') {
    // Linux
    app = '/usr/bin/tailscale';
}

if (!['darwin', 'linux'].includes(platform)) {
    throw new Error('Unsupported platform');
}

module.exports = {
    app,
};
