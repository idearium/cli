'use strict';

const { readFile, writeFile } = require('fs');
const { homedir } = require('os');
const { join } = require('path');
const { compile } = require('handlebars');
const { promisify } = require('util');

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
 * Given an error, throw it.
 * @param  {error} err The error to through.
 * @return {void}
 */
const throwErr = (err) => {

    throw err;

};

module.exports = {
    executeTemplate,
    npmAuthToken,
    throwErr,
    writeFile: promisify(writeFile),
};
