#!/usr/bin/env node

'use strict';

const program = require('commander');
const { spawn } = require('child_process');
const { loadConfig, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .arguments('[env]')
    .parse(process.argv);

if (!program.args.length) {
    return reportError(new Error('Please provide an environment'), program);
}

const [env] = program.args;

loadConfig(`mongo.${env}`)
    .then(({ host, name, params = [], password, user }) => {

        let dbAuth = '';

        if (user && password) {
            dbAuth = `-u ${user} -p ${password}`;
        }

        return spawn(`docker run -it --rm mongo:3.2 mongo ${dbAuth} ${params.join(' ')} --host ${host} ${name}`, {
            shell: true,
            stdio: 'inherit',
        });

    })
    .catch(reportError);
