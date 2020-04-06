'use strict';

const { join, resolve } = require('path');
const debug = require('debug')('idearium-cli:workflow');

// The defined workflows.
const workflows = [
    {
        description:
            'Use this to initialise the cli (generally after changing into a project directory with a new terminal tab/window).',
        name: 'cli',
    },
    {
        description:
            "Use this to initialise the project (generally after 'git clone').",
        name: 'init',
    },
    {
        description: 'Use this to build a project.',
        name: 'build',
    },
    {
        description:
            "Use this to start a project (generally after 'c workflow init').",
        name: 'start',
    },
    {
        description:
            "Use this to stop and restart the project (generally after 'gco <pull-request-branch>').",
        name: 'restart',
    },
    {
        description: 'Use this to run tests against the entire project.',
        name: 'test',
    },
];

/**
 * Determine the workflow directory relative to `process.cwd()`.
 * @return {String} The workflow directory.
 */
const dir = () => resolve(process.cwd(), 'devops', 'workflows');

/**
 * Determine if a particular workflow has been defined.
 * @param {String} name The workflow to check.
 * @returns {Boolean} `true` or `false`.
 */
const defined = (name) =>
    typeof workflows.find((workflow) => workflow.name === name) !== 'undefined';

/**
 * Load a particular workflow if it exists.
 * @param {String} name='' The name of the workflow.
 * @return {Object|null} Return the workflow function, and `name` and `description`.
 */
const get = (name = '') => {
    const directory = dir();
    const file = join(directory, name);

    let error;
    let fn;
    let status = 'ok';
    let include = true;

    debug(`Trying to load ${file}`);

    // Does this workflow exist?
    try {
        // eslint-disable-next-line global-require
        fn = require(file);
    } catch (e) {
        // Do nothing, we'll just return null.
        if (e.code === 'MODULE_NOT_FOUND') {
            include = false;
        }

        status = 'error';
        error = e;
    }

    // This workflow exists.
    return { error, fn, include, status };
};

// Try and load the workflow
const getAll = () =>
    workflows.map((workflow) => Object.assign(workflow, get(workflow.name)));

module.exports = { defined, dir, get, getAll, workflows };
