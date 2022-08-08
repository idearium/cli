'use strict';

const program = require('commander');
const { spawn } = require('child_process');
const { loadConfig, reportError } = require('./lib/c');
const { connectionParts } = require('./lib/c-mongo');

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

const connectionStringWithAddress = ({ address, params, password, user }) => {
    const url = new URL(address);

    url.password = password;
    url.username = user;

    return `${params} --uri ${url.href}`;
};

const connectionStringWithHost = ({ auth, host, name, params }) => {
    let connectionString = `--host ${host}`;

    if (auth) {
        connectionString = `--authenticationDatabase ${name}${auth}${params} ${connectionString}`;
    }

    return connectionString;
};

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
            collectionArg = `--nsInclude '${db.name}.${collection}' --nsFrom '${db.name}.*' --nsTo '${toDb.name}.*'`;
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

        const toDbConnection = connectionParts(toDb);

        const addHost =
            toDb.host === mongo.local.host
                ? ` --add-host ${toDb.host}:$(c hosts get -nl ${toDb.host})`
                : '';

        const cmd = `docker run -it -v ${process.cwd()}/data/${db.name}:/data/${
            db.name
        }${addHost} --rm mongo:4.2 mongorestore --noIndexRestore --drop ${
            toDbConnection.host
                ? connectionStringWithHost(toDbConnection)
                : connectionStringWithAddress(toDbConnection)
        } ${collectionArg} data/`;

        return spawn(cmd, {
            shell: true,
            stdio: 'inherit',
        });
    })
    .catch(reportError);
