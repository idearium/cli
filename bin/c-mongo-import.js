#!/usr/bin/env node

'use strict';

const program = require('commander');
const { spawn } = require('child_process');
const { loadConfig, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .arguments('[env]')
    .arguments('<collection>')
    .description(
        "Import all or a specific collection from a Mongo database. If you don't provide a collection, all will be imported."
    )
    .parse(process.argv);

if (!program.args.length) {
    return reportError(new Error('Please provide an environment'), program);
}

const [env, collection] = program.args;

if (env.toLowerCase() === 'local') {
    return reportError(
        new Error('You cannot import the local database'),
        program
    );
}

loadConfig('mongo')
    .then((mongo) => {
        const db = mongo[`${env}`];
        const localDb = mongo.local;

        // Default to importing all collections.
        let collectionArg = `--nsInclude '${db.name}.*'`;

        // Otherwise, import a specific collection only.
        if (typeof collection !== 'undefined') {
            collectionArg = `--nsInclude '${db.name}.${collection}'`;
        }

        if (!localDb) {
            return reportError(
                new Error('Could not find the local db'),
                program
            );
        }

        if (!db) {
            return reportError(
                new Error(`Could not find the ${env} db`),
                program
            );
        }

        return spawn(
            `docker run -it -v ${process.cwd()}/data/${db.name}:/data/${
                db.name
            } --add-host ${localDb.host}:$(c hosts get -n ${
                localDb.host
            }) --rm mongo:4.2 mongorestore --noIndexRestore --drop -h ${
                localDb.host
            }:${localDb.port} ${collectionArg} data/`,
            {
                shell: true,
                stdio: 'inherit',
            }
        );
    })
    .catch(reportError);
