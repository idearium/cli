#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const { spawn } = require('child_process');
const { loadConfig, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program.arguments('[env]').parse(process.argv);

if (!program.args.length) {
    return reportError(new Error('Please provide an environment'), program);
}

const [env] = program.args;

loadConfig(`mongo.${env}`)
    .then(({ host, name, params = [], password, port, user }) => {
        let dbAuth = '';

        if (user && password) {
            dbAuth = `-u ${user} -p ${password}`;
        }

        return spawn(
            `docker run -it --rm mongo:4.2 mongo ${dbAuth} ${params.join(
                ' '
            )} --host ${host}:${port} ${name}`,
            {
                shell: true,
                stdio: 'inherit',
            }
        );
    })
    .catch(reportError);
