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

(async () => {
    const [, , env, collection] = process.argv;
    const details = await loadConfig(`mongo.${env}`);
    const params = [...(details.params || [])];

    if (collection) {
        params.push(`-c=${collection}`);
    }

    const connection = connectionParts({ ...details, params });
    const dockerVolumeName = volumeName({
        collection,
        env,
        name: details.name,
    });
    const connectionString = connection.host
        ? connectionStringWithHost(connection)
        : connectionStringWithAddress(connection);

    console.log(
        JSON.stringify({
            connection,
            connectionString,
            dbName: details.name,
            dockerVolumeName,
            volumes: connection.volumes,
        })
    );
})();
