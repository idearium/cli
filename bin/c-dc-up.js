'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { composeUp, npmAuthToken, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program.arguments('[service]').parse(process.argv);

npmAuthToken()
    .then((token) => {
        const env = { NPM_AUTH_TOKEN: token };

        // Are we bringing up all, or just one contaner?
        if (!program.args.length) {
            exec('docker-compose stop', { env });
            exec('docker-compose rm --force', { env });
            exec('docker-compose build', { env });
            exec('docker-compose up -d --scale consul=3 --scale app=2', {
                env,
            });

            return;
        }

        // We're bringing up just one container.
        const [service] = program.args;

        exec(`docker-compose build ${service}`, { env });
        exec(composeUp(service), { env });
    })
    .catch((err) => reportError(err));
