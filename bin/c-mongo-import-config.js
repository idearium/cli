const { loadConfig } = require('./lib/c');
const { connectionParts } = require('./lib/c-mongo');

const connectionStringWithAddress = ({
    address,
    name,
    params,
    password,
    user,
}) => {
    const url = new URL(address);

    url.password = password;
    url.username = user;

    const cmd = [];

    if (params) {
        cmd.push(params);
    }

    return [...cmd, '--uri', `${url.href}/${name}`].join(' ');
};

const connectionStringWithHost = ({ auth, host, name, params }) => {
    const cmd = [];

    if (auth) {
        cmd.push(auth);
    }

    if (params) {
        cmd.push(params);
    }

    return [...cmd, '--host', host, '-d', name].join(' ');
};

const volumeName = ({ collection, env, name }) => {
    const parts = ['mongodump_data', name, env];

    if (collection) {
        parts.push(collection);
    }

    return parts.join('_');
};

// loadConfig('mongo')
//     .then((mongo) => {
//         const db = mongo[`${env}`];
//         const toDb = mongo[to] || mongo.local;

(async () => {
    const [, , env, to, localIp, scriptDir, collection] = process.argv;
    const details = await loadConfig(`mongo`);
    // console.log('details', { env, to, localIp, scriptDir, collection });

    const fromDb = details[env];
    const toDb = details[to] || details.local;

    const toDbConnection = connectionParts(toDb);

    const collectionArg =
        collection === ''
            ? `--nsInclude '${fromDb.name}.*' --nsFrom '${fromDb.name}.*' --nsTo '${toDb.name}.*'`
            : `--nsInclude '${fromDb.name}.${collection}' --nsFrom '${fromDb.name}.*' --nsTo '${toDb.name}.*'`;

    // This is now isToDbLocal.
    // const addHost =
    //     toDb.host === details.local.host
    //         ? ` --add-host ${toDb.host}:$(c hosts get -nl ${toDb.host})`
    //         : '';

    // -it -v $SCRIPT_DIR/data/$FROM_DB:/data/$FROM_DB ${addHost} --rm${networkOption()} mongo:7 mongorestore --noIndexRestore --drop ${
    //     toDbConnection.host
    //         ? connectionStringWithHost(toDbConnection)
    //         : connectionStringWithAddress(toDbConnection)
    // } ${collectionArg} data/

    const args = [
        '-it',
        '--rm',
        '--network',
        'host',
        '-v',
        `${scriptDir}/data/${fromDb.name}:/data/${fromDb.name}`,
    ];

    if (toDb.host === details.local.host) {
        args.push('--add-host');
        args.push(`${toDb.host}:${localIp}`);
    }

    args.push(
        'mongo:7',
        'mongorestore',
        '--noIndexRestore',
        '--drop',
        toDbConnection.host
            ? connectionStringWithHost(toDbConnection)
            : connectionStringWithAddress(toDbConnection),
        collectionArg,
        `data/${toDb.name}`
    );

    console.log(
        JSON.stringify({
            args: args.join(' '),
        })
    );
})();
