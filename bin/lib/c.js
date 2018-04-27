'use strict';

const chalk = require('chalk');
const { readFile, writeFile } = require('fs');
const { homedir } = require('os');
const { join } = require('path');
const { compile } = require('handlebars');
const { promisify } = require('util');
const { red } = require('chalk');
const { exec } = require('shelljs');

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
 * Given a template file, and a locals object, compile the template and generate the result.
 * @param  {String} file        A path to a template file.
 * @param  {Object} [locals={}] The locals to the pass to the template.
 * @return {Promise}            A promise.
 */
const executeTemplate = (file, locals = {}) => new Promise((resolve, reject) => {

    readFile(join(process.cwd(), 'devops', 'templates', file), 'utf-8', (err, data) => {

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
 * @param {String} key The name of a top-level key to return.
 * @param {String} type The name of a config file to load.
 * @return {Promise} A promise that will resolve with some JSON data.
 */
const loadConfig = (key, type = 'c') => new Promise((resolve, reject) => {

    readFile(join(process.cwd(), `${type}.json`), 'utf-8', (err, data) => {

        if (err) {
            return reject(err);
        }

        const json = JSON.parse(data);

        if (key && !json[key]) {
            return reject(new Error(`The '${key}' configuration was not found in ${type}.json. See https://github.com/idearium/cli#configuration`));
        }

        if (key && json[key]) {
            return resolve(json[key]);
        }

        return resolve(json);

    });

});

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
    loadConfig,
    missingCommand,
    npmAuthToken,
    proxyCommand,
    proxyCommands,
    reportError,
    throwErr,
    writeFile: promisify(writeFile),
};
