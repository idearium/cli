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

    return [...cmd, '--host', host].join(' ');
};

(async () => {
    const [, , env, to, localIp, collection] = process.argv;
    const details = await loadConfig(`mongo`);

    const fromDb = details[env];
    const toDb = details[to] || details.local;

    const toDbConnection = connectionParts(toDb);

    const collectionArg =
        collection === ''
            ? `--nsInclude ${fromDb.name}.* --nsFrom '${fromDb.name}.*' --nsTo '${toDb.name}.*'`
            : `--nsInclude ${fromDb.name}.${collection} --nsFrom '${fromDb.name}.*' --nsTo '${toDb.name}.*'`;

    const args = [
        '-it',
        '--rm',
        '--network',
        'host',
        '-v',
        `${process.cwd()}/data/${fromDb.name}:/data/${fromDb.name}`,
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
        'data/'
    );

    console.log(
        JSON.stringify({
            args: args.join(' '),
        })
    );
})();
