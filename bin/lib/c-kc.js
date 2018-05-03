'use strict';

const fs = require('fs');
const { copy, ensureDir } = require('fs-extra');
const { join, resolve: resolvePath } = require('path');
const Mustache = require('Mustache');
const { promisify } = require('util');

const { constants } = fs;

const access = promisify(fs.access);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

/**
 * Given an array, and an async callback, pass each item in the array to the callback.
 * @param {Array} array An array to loop over.
 * @param {Function} callback An async function.
 * @returns {void}
 */
const asyncForEach = async (array, callback) => {

    for (let index = 0; index < array.length; index++) {

        // eslint-disable-next-line no-await-in-loop, callback-return
        await callback(array[index], index, array);

    }

};

/**
 * Check that a file for each service exists (either a .yaml or .tmpl.yaml file).
 * @param {String} path The path to a bunch of Kubernetes manifests.
 * @param {Array} services An array of Kubernetes location services.
 * @returns {void}
 */
const ensureServiceFilesExist = async (path = '', services = []) => {

    await asyncForEach(services, async (service) => {

        const sourceFolder = resolvePath(process.cwd(), path);
        const destinationFolder = join(sourceFolder, '.compiled');
        const sourcePath = join(sourceFolder, service.path);
        const destinationPath = join(destinationFolder, service.path);

        try {

            await access(`${sourcePath}.yaml.tmpl`, constants.R_OK);

        } catch (e) {

            try {

                await access(`${sourcePath}.yaml`, constants.R_OK);
                await ensureDir(destinationFolder);
                await copy(`${sourcePath}.yaml`, `${destinationPath}.yaml`);

            } catch (err) {

                throw new Error(new Error(`Neither ${path}/${service.path}.yaml.tmpl or ${path}/${service.path}.yaml could be found`));

            }

        }

    });

};

const renderServicesTemplates = async (path = '', services = []) => {

    await asyncForEach(services, async (service) => {

        const sourceFolder = resolvePath(process.cwd(), path);
        const sourcePath = join(sourceFolder, service.path);
        const destinationFolder = join(sourceFolder, '.compiled');
        const destinationPath = join(destinationFolder, service.path);

        try {

            const content = await readFile(`${sourcePath}.yaml.tmpl`, 'utf-8');

            await writeFile(`${destinationPath}.yaml`, Mustache.render(content, service.locals), 'utf8');

        } catch (e) {
            // Do nothing.
            // It just means we don't have a templ file to render.
        }

    });

};

/**
 * Directly mutate a services array by resolving a list of locals to pass to a template engine.
 * @param {Object} state The current state of the project.
 * @param {String} namespace The current namespace.
 * @param {String} prefix The current project prefix.
 * @param {Array} services A list of Kubernetes location services.
 * @returns {void}
 */
const setLocalsForServices = (state, namespace, prefix, services) => {

    services.forEach((service) => {

        const templateLocals = service.templateLocals || [];
        const constantLocals = {
            environment: state.env,
            namespace,
            prefix,
        };

        // Locals values will live in here.
        service.locals = {};

        templateLocals.forEach((local) => {

            if (typeof local === 'string' && Object.keys(constantLocals).includes(local)) {

                service.locals[local] = constantLocals[local];

                return;

            }

            if (typeof local === 'string' && local === 'tag') {

                service.locals[local] = state.kubernetes.build.tags[`${prefix}/${service.location}`];

                return;

            }

            if (typeof local === 'function') {

                const { label, value } = local();

                service.locals[label] = value;

                return;

            }

            throw Error(`Could not resolve '${local}' local`);

        });

    });

};

module.exports = {
    ensureServiceFilesExist,
    renderServicesTemplates,
    setLocalsForServices,
};
