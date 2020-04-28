'use strict';

const { newline } = require('./c');

// eslint-disable-next-line max-params
const formatProjectPrefix = (
    organisation,
    name,
    environment,
    includeEnvironment = false,
    excludeNewline = false
) => {
    const env = includeEnvironment ? `-${environment}` : '';

    return `${organisation}-${name}${env}${newline(excludeNewline)}`;
};

module.exports = { formatProjectPrefix };
