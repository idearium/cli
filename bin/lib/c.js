'use strict';

const chalk = require('chalk');
const { readFile, writeFile } = require('fs');
const { homedir } = require('os');
const { join } = require('path');
const { compile } = require('handlebars');
const { promisify } = require('util');
const { red } = require('chalk');

/**
 * Given a service, return a `docker-compose` command string to bring it up.
 * @param  {string} service The name of the service.
 * @return {string}         The `docker-compose` command string.
 */
const composeUp = (service) => {

    // We're bringing up just one container.
    let upCommand = 'docker-compose up -d';

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

    console.error(chalk.red(`\nThis is no '${missing}' command`));

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
 * Given an error, report it.
 * @param  {Error}  err          The Error object.
 * @param  {Object} program      The commander.js program.
 * @return {void}
 */
const reportError = (err, program) => {

    // eslint-disable-next-line no-console
    console.error(`\n${red('Error:')} ${err.message}\n`);

    /* eslint-disable padded-blocks */
    if (program) {
        program.help();
    }
    /* eslint-enable padded-blocks */

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
    missingCommand,
    npmAuthToken,
    reportError,
    throwErr,
    writeFile: promisify(writeFile),
};
