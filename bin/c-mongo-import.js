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

if (env.toLowerCase() === 'local') {
    return reportError(new Error('You cannot download the local database'), program);
}

loadConfig('mongo')
    .then((mongo) => {

        const db = mongo[`${env}`];
        const localDb = mongo.local;

        if (!localDb) {
            return reportError(new Error('Could not find the local db'), program);
        }

        if (!db) {
            return reportError(new Error(`Could not find the ${env} db`), program);
        }

        return spawn(`docker run -it -v ${process.cwd()}/data/${db.name}:/data/${db.name} --add-host ${localDb.host}:$(c hosts get -n ${localDb.host}) --rm mongo:3.2 mongorestore --noIndexRestore --drop -h ${localDb.host}:${localDb.port} -d ${localDb.name} data/${db.name}`, {
            shell: true,
            stdio: 'inherit',
        });


    })
    .catch(reportError);
