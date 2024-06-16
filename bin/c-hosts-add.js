'use strict';

const program = require('commander');
const { execSync, spawnSync } = require('child_process');
const { hostilePath, reportError } = require('./lib/c');

let ip;
let domains;

// The basic program, which uses sub-commands.
program
    .arguments('<ip> <domain...>')
    .action((ipValue, domainsValue) => {
        ip = ipValue;
        domains = domainsValue;
    })
    .parse(process.argv);

if (!ip) {
    return reportError(new Error('You must pass the ip argument.'), program);
}

if (!domains) {
    return reportError(
        new Error('You must pass the domain argument.'),
        program
    );
}

const findNodePath = () => {
    let nodePath;
    try {
        nodePath = execSync('which node').toString().trim();
    } catch (error) {
        console.error('Node.js is not installed or not found in PATH.');
        process.exit(1);
    }

    if (!nodePath) {
        console.error('Node.js is not installed or not found in PATH.');
        process.exit(1);
    }

    return nodePath;
};

const { status, stderr } = spawnSync('sudo', [
    findNodePath(),
    hostilePath(),
    'set',
    ip,
    domains.join(' '),
]);

if (status) {
    reportError(new Error(stderr.toString()), false, true);
}
