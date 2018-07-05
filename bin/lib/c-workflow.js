'use strict';

const { join, resolve } = require('path');

// The defined workflows.
const workflows = [
    {
        description: 'Use this to initialise the cli (generally after changing into a project directory with a new terminal tab/window)',
        name: 'cli-init',
    },
    {
        description: 'Use this to initialise the project (generally after \'git clone\').',
        name: 'project-init',
    },
    {
        description: 'Use this to run tests against the entire project',
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
const defined = name => typeof workflows.find(workflow => workflow.name === name) !== 'undefined';

/**
 * Load a particular workflow if it exists.
 * @param {String} name='' The name of the workflow.
 * @return {Object|null} Return the workflow function, and `name` and `description`.
 */
const get = (name = '') => {

    const directory = dir();
    let fn = null;

    // Does this workflow exist?
    try {
        // eslint-disable-next-line global-require
        fn = require(join(directory, name));
    } catch (e) {
        // Do nothing, we'll ust return null.
    }

    // This workflow exists.
    return fn;

};

const getAll = () => workflows
    // Try and load the workflow
    .map(workflow => Object.assign(workflow, { fn: get(workflow.name) }))
    // Filter out anything that doesn't exist.
    .filter(workflow => (workflow.fn !== null));

module.exports = { defined, dir, get, getAll, workflows };
