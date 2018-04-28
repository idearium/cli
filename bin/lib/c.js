'use strict';

const chalk = require('chalk');
const { readFile, writeFile } = require('fs');
const { homedir } = require('os');
const { resolve: pathResolve, join } = require('path');
const { compile } = require('handlebars');
const { promisify } = require('util');
const { red } = require('chalk');
const { exec } = require('shelljs');
const getPropertyPath = require('get-value');
const setPropertyPath = require('set-value');

/**
 * Given a service, return a `docker-compose` command string to bring it up.
 * @param  {string} service The name of the service.
 * @return {string}         The `docker-compose` command string.
 */
const composeUp = (service) => {

    // We're bringing up just one container.
    let upCommand = 'docker-compose up -d --force-recreate';

    // We need to scale some containers.
    /* eslint-disable padded-blocks */
    if (['app', 'consul'].includes(service)) {
        upCommand += ` --scale ${service}=2`;
    }
    /* eslint-enable padded-blocks */

    upCommand += ` ${service}`;

    return upCommand;

};

/**
 * Resolve an asbsolute path to the devops folder for the project.
 * @return {String} The path to the devops folder.
 */
const devopsPath = () => {

    return pathResolve(process.cwd(), 'devops');

};

/**
 * Given a template file, and a locals object, compile the template and generate the result.
 * @param  {String} file        A path to a template file.
 * @param  {Object} [locals={}] The locals to the pass to the template.
 * @return {Promise}            A promise.
 */
const executeTemplate = (file, locals = {}) => new Promise((resolve, reject) => {

    readFile(join(devopsPath(), 'templates', file), 'utf-8', (err, data) => {

        /* eslint-disable padded-blocks */
        if (err) {
            return reject(err);
        }
        /* eslint-enable padded-blocks */

        const template = compile(data);

        return resolve(template(locals));

    });

});

/**
 * Work out the path to the hostile binary (within node_modules).
 * @return {String} The path to the hostile binary.
 */
const hostilePath = () => {

    return pathResolve(__dirname, '..', '..', 'node_modules', '.bin', 'hostile');

};

/**
 * Given a program object, make sure there is an actual command running. If not, log a console error.
 * @param  {Object} program A commander.js program.
 * @return {void}
 */
const missingCommand = (program) => {

    if (program.runningCommand) {
        return;
    }

    const [missing] = program.args;

    console.error(chalk.red(`\nThere is no '${missing}' command`));

    program.help();

};

/**
 * Read `~/.npmrc` and retrieve the `authToken`.
 * @return {Promise} A promise that will resolve with the token (string).
 */
const npmAuthToken = () => new Promise((resolve, reject) => {

    readFile(join(homedir(), '.npmrc'), 'utf-8', (err, data) => {

        /* eslint-disable padded-blocks */
        if (err) {
            return reject(err);
        }
        /* eslint-enable padded-blocks */

        const result = (/(?:_authToken=)([0-9a-z-].+)/).exec(data);
        const authToken = result ? result[1] : '';

        return resolve(authToken);

    });

});

/**
 * Load and parse a JSON configuration fiile.
 * @param {String} keys The name of a top-level key to return.
 * @param {String} type The name of a config file to load.
 * @return {Promise} A promise that will resolve with some JSON data.
 */
const loadConfig = (keys, type = 'c') => new Promise((resolve, reject) => {

    // eslint-disable-next-line global-require
    const data = require(join(process.cwd(), type));

    // If there are no keys, return the entire config.
    if (!keys) {
        return resolve(data);
    }

    // Find the config using property paths.
    const config = getPropertyPath(data, keys);

    if (!config) {
        return reject(new Error(`The '${keys}' configuration was not found in ${type}.js. See https://github.com/idearium/cli#configuration`));
    }

    return resolve(config);

});

/**
 * Load and parse a JSON state fiile.
 * @param {String} key The name of a top-level key to return.
 * @return {Promise} A promise that will resolve with some JSON data.
 */
const loadState = key => new Promise((resolve, reject) => {

    // eslint-disable-next-line no-use-before-define
    readFile(stateFilePath(), 'utf-8', (err, data) => {

        if (err) {
            return reject(err);
        }

        const json = JSON.parse(data);

        if (key && !json[key]) {
            return reject(new Error(`The '${key}' state was not found in state.json.`));
        }

        if (key && json[key]) {
            return resolve(json[key]);
        }

        return resolve(json);

    });

});

/**
 * Given a boolean, determine if a newline character should be used.
 * @param {Boolean} exclude Should the newline character be used?
 * @returns {String} Either an empty string, or a newline.
 */
const newline = (exclude) => {

    if (exclude) {
        return '';
    }

    return '\n';

};

/**
 * Run a command, at a particular path.
 * @param {String} location An absolute path.
 * @param {String} command A command to run at that path.
 * @returns {void}
 */
const proxyCommand = (location, command) => {

    exec(command, { cwd: location });

};

/**
 * Run multiple commands, in multiple locations.
 * @param {Array} commands An array of [location, command] arrays.
 * @returns {void}
 */
const proxyCommands = (commands = []) => commands.forEach(command => proxyCommand(...command));

/**
 * Given an error, report it.
 * @param  {Error}  err          The Error object.
 * @param  {Object} program      The commander.js program.
 * @param  {Boolean} exit        If true, exit the Node.js process.
 * @return {void}
 */
const reportError = (err, program, exit = false) => {

    // eslint-disable-next-line no-console
    console.error(`\n${red('Error:')} ${err.message}\n`);

    /* eslint-disable padded-blocks */
    if (program) {
        program.help();
    }
    /* eslint-enable padded-blocks */

    if (exit) {
        // eslint-disable-next-line no-process-exit
        process.exit(1);
    }

};

/**
 * The path to the state file.
 * @returns {String} An absolute path to the state file.
 */
const stateFilePath = () => {

    return pathResolve(devopsPath(), 'state.json');

};

/**
 * Given a key and a value, store it in the state file.
 * @param {String} keys A property path to store the state in.
 * @param {any} value The value to store.
 * @return {Promise} A promise.
 */
const storeState = (keys, value) => new Promise((resolve, reject) => {

    // Ignore any errors as it probably just means that the file hasn't been created yet.
    readFile(pathResolve(stateFilePath()), 'utf-8', (_, data) => {

        const json = data ? JSON.parse(data) : {};
        const nestedData = setPropertyPath({}, keys, value);
        const state = Object.assign({}, json, nestedData);

        writeFile(stateFilePath(), JSON.stringify(state, null, 2), { flag: 'w' }, (writeErr) => {

            if (writeErr) {
                return reject(writeErr);
            }

            return resolve();

        });

    });

});

/**
 * Given an error, throw it.
 * @param  {error} err The error to through.
 * @return {void}
 */
const throwErr = (err) => {

    throw err;

};

module.exports = {
    composeUp,
    executeTemplate,
    hostilePath,
    loadConfig,
    loadState,
    missingCommand,
    newline,
    npmAuthToken,
    proxyCommand,
    proxyCommands,
    reportError,
    storeState,
    throwErr,
    writeFile: promisify(writeFile),
};
