#!/usr/bin/env node

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

loadConfig(`redis.${env}`)
    .then(({ host, password, port }) => {
        return spawn(
            `docker run -it --rm redis:5.0 redis-cli -h ${host} -p ${port} -a ${password}`,
            {
                shell: true,
                stdio: 'inherit',
            }
        );
    })
    .catch(reportError);
