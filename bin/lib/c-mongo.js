'use strict';

const connectionParts = ({
    address,
    host,
    name,
    params: paramsArray = [],
    password,
    port,
    user,
    volumes = [],
}) => {
    const auth = user && password ? ` -u ${user} -p ${password}` : '';
    const params = paramsArray.length ? ` ${paramsArray.join(' ')}` : '';

    const parts = {
        auth,
        name,
        params,
        password,
        user,
        volumes: volumes.map((file) => {
            const [local, remote] = file.split(':');

            return `-v ${process.cwd()}/${local}:${remote}`;
        }),
    };

    if (address) {
        parts.address = address;
    }

    if (host) {
        parts.host = host;
    }

    if (port) {
        parts.host += `:${port}`;
    }

    return parts;
};

module.exports = { connectionParts };
