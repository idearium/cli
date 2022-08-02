'use strict';

const connectionParts = ({
    address,
    host,
    name,
    params: paramsArray = [],
    password,
    port,
    user,
}) => {
    const auth = user && password ? ` -u ${user} -p ${password}` : '';
    const params = paramsArray.length ? ` ${paramsArray.join(' ')}` : '';

    const parts = {
        auth,
        name,
        params,
        password,
        user,
    };

    if (address) {
        parts.address = address;
    }

    if (host && port) {
        parts.host = `${host}:${port}`;
    }

    return parts;
};

module.exports = { connectionParts };
