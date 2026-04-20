'use strict';

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

    return [...cmd, `${url.href}/${name}`].join(' ');
};

const connectionStringWithHost = ({ auth, host, name, params }) => {
    const cmd = [];

    if (auth) {
        cmd.push(auth);
    }

    if (params) {
        cmd.push(params);
    }

    return [...cmd, '--host', host, name].join(' ');
};

(async () => {
    const [, , env] = process.argv;
    const details = await loadConfig(`mongo.${env}`);
    const connection = connectionParts(details);
    const connectionString = connection.host
        ? connectionStringWithHost(connection)
        : connectionStringWithAddress(connection);

    console.log(
        JSON.stringify({
            connectionString,
            volumes: connection.volumes,
        })
    );
})();
