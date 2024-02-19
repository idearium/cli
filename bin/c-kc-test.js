'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { hasProperty, loadConfig, loadState, reportError } = require('./lib/c');
const getPropertyPath = require('get-value');

/**
 * Given a string, return it prefixed with a space, or given an undefined value, return an empty string.
 * @param {*} str The string to prefix.
 * @param {*} prefixValue The prefix value
 * @returns {String} The prefixed string.
 */
const prefixWith = (str, prefixValue = ' ') => {
    if (str) {
        return `${prefixValue}${str}`;
    }

    return '';
};

/**
 * Take a parameter, and multiple values, and turn it into a formatted parameter string.
 * For example:
 * buildParamString('-e', ['foo="bar"', 'bar="foo"']) == '-e foo="bar" -e bar="foo"'
 * @param {String} param The name of the parameter.
 * @param {Array} values Multiple values for the parameter.
 * @returns {String} The parameter string.
 */
const buildParamString = (param, values = []) =>
    values.map((value) => prefixWith(value, `${param} `)).join(' ');

/**
 * Take an object of parameters, and turn it into a formatted parameter string.
 * For example:
 * buildParamString({
 *      '-e': ['foo="bar"', 'bar="foo"'],
 *      '-w': '/app',
 *  }) == '-e foo="bar" -e bar="foo" -w /app'
 * @param {Object} params An object keyed by parameter name.
 * @returns {String} The formatted parameter string.
 */
const buildParamsString = (params = {}) =>
    Object.keys(params)
        .map((param) => {
            const values = Array.isArray(params[param])
                ? params[param]
                : [params[param]];

            return buildParamString(param, values);
        })
        .join(' ');

program
    .arguments('<location>')
    .option('-b', 'Build the location before testing.')
    .description('Provide a Docker location to test against.')
    .parse(process.argv);

const [location] = program.args;

if (!location) {
    return reportError(
        new Error('You need to provide a Kubernetes location'),
        program,
        true
    );
}

const buildLocation = (build, dockerLocation) =>
    new Promise((resolve, reject) => {
        if (!build) {
            return resolve();
        }

        exec(`c kc build ${dockerLocation}`, (err, stdout, stderr) => {
            if ((err || stderr) && stderr) {
                return reject(new Error(stderr));
            }

            if ((err || stderr) && err) {
                return reject(err);
            }

            return resolve();
        });
    });

return buildLocation(program.B, location)
    .then(() => Promise.all([loadConfig(), loadState()]))
    .then(([config, state]) => {
        const testConfig =
            getPropertyPath(config, `docker.locations.${location}.test`) || {};

        // Default the cmd.
        if (!hasProperty(testConfig, 'cmd')) {
            testConfig.cmd = 'npm test';
        }

        // Default the params.
        if (!hasProperty(testConfig, 'params')) {
            testConfig.params = {};
        }

        return [
            testConfig,
            state,
            exec('c project prefix -n', { silent: true }).stdout,
        ];
    })
    .then(([testConfig, state, prefix]) => {
        const image = `${prefix}/${location}`;

        const buildTag = getPropertyPath(
            state,
            `kubernetes.environments.${state.env}.build.tags.${image}`
        );

        if (!buildTag) {
            throw Error(`Could not find a build tag for ${image}`);
        }

        const cmd = `docker run --rm --name ${prefix}-${location}-test --tty ${prefixWith(
            buildParamsString(testConfig.params),
            ' '
        )} ${prefix}/${location}:${buildTag} ${testConfig.cmd}`;

        return exec(cmd);
    })
    .catch(reportError);
