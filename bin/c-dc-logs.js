#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { npmAuthToken } = require('./lib/c');

// The basic program, which uses sub-commands.
program.parse(process.argv);

npmAuthToken().then((token) => {
    const env = { NPM_AUTH_TOKEN: token };
    const command = 'docker-compose logs -f';

    // Are we logging all containers?
    if (!program.args.length) {
        exec(command, { env });

        return;
    }

    // We're just logging one container.
    const [service] = program.args;

    // Using shelljs here.
    exec(`${command} ${service}`, { env });
});
