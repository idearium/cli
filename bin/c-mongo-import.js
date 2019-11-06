#!/usr/bin/env node

'use strict';

const program = require('commander');
const { spawn } = require('child_process');
const { loadConfig, reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .arguments('[env]')
    .arguments('<collection>')
    .option('-t, --to <env>', 'change the import destination')
    .description(
        "Import all or a specific collection from a Mongo database. If you don't provide a collection, all will be imported."
    )
    .parse(process.argv);

if (!program.args.length) {
    return reportError(new Error('Please provide an environment'), program);
}

const [env, collection] = program.args;
const { to } = program;

if (env.toLowerCase() === 'local') {
    return reportError(
        new Error('You cannot import the local database'),
        program
    );
}

loadConfig('mongo')
    .then((mongo) => {
        const db = mongo[`${env}`];
        const toDb = mongo[to] || mongo.local;

        // Default to importing all collections.
        let collectionArg = `--nsInclude '${db.name}.*' --nsFrom '${db.name}.*' --nsTo '${toDb.name}.*'`;

        // Otherwise, import a specific collection only.
        if (typeof collection !== 'undefined') {
            collectionArg = `--nsInclude '${db.name}.${collection}' --nsFrom '${db.name}.${collection}' --nsTo '${toDb.name}.${collection}'`;
        }

        if (!toDb) {
            return reportError(
                new Error('Could not find a db to import into'),
                program
            );
        }

        if (!db) {
            return reportError(
                new Error(`Could not find the ${env} db`),
                program
            );
        }

        const [host] = toDb.host.split(':');

        const addHost =
            toDb.host === mongo.local.host
                ? ` --add-host ${host}:$(c hosts get -n ${host})`
                : '';

        let dbAuth = '';

        if (toDb.user && toDb.password) {
            dbAuth = `-u ${toDb.user} -p ${toDb.password}`;
        }

        let cmd = `docker run -it -v ${process.cwd()}/data/${db.name}:/data/${
            db.name
        }${addHost} --rm mongo:3.4 mongorestore --noIndexRestore ${dbAuth} ${(
            toDb.params || []
        ).join(' ')} -d ${toDb.name} --drop -h ${
            toDb.host
        } ${collectionArg} data/${db.name}`;

        return spawn(cmd, {
            shell: true,
            stdio: 'inherit',
        });
    })
    .catch(reportError);
