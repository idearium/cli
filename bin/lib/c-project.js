'use strict';

const { newline } = require('./c');

const PRERELEASE_TYPES = ['alpha', 'beta', 'staging'];

const findPrereleaseType = ({ value }) =>
    PRERELEASE_TYPES.find((prereleaseType) => value.includes(prereleaseType));

// The prerelease type named by the bump type wins; a bump type that names
// none keeps the type the current version already carries.
const getPrereleaseIdentifier = ({ currentVersion, type }) =>
    findPrereleaseType({ value: type }) ||
    findPrereleaseType({ value: currentVersion }) ||
    'alpha';

const getBumpType = ({ type }) => {
    const match = type.match(
        new RegExp(`^(${PRERELEASE_TYPES.join('|')})(major|minor|patch)?$`)
    );

    if (!match) {
        return type;
    }

    if (!match[2]) {
        return 'prerelease';
    }

    return `pre${match[2]}`;
};

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

module.exports = { formatProjectPrefix, getBumpType, getPrereleaseIdentifier };
