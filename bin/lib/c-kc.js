'use strict';

const fs = require('fs');
const { copy, ensureDir, mkdtemp, remove } = require('fs-extra');
const { tmpdir } = require('os');
const { join, resolve: resolvePath } = require('path');
const Mustache = require('mustache');
const { promisify } = require('util');
const { execFile } = require('child_process');

const { constants } = fs;

const access = promisify(fs.access);
const chmod = promisify(fs.chmod);
const execFileAsync = promisify(execFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);
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
                throw new Error(
                    new Error(
                        `Neither ${path}/${service.path}.yaml.tmpl or ${path}/${service.path}.yaml could be found`
                    )
                );
            }
        }
    });
};

/**
 * Check if a template's content contains 1Password secret references.
 * @param {String} content The content of a template file.
 * @returns {Boolean} True if the content contains secret references.
 */
const containsSecretReferences = (content) => content.includes('op://');

/**
 * Convert a stringData block (single-line values only) into a data block, with each value base64 encoded.
 * @param {String} content A rendered Kubernetes Secret manifest.
 * @returns {String} The manifest with stringData converted to base64 encoded data.
 */
const encodeSecretStringData = (content) => {
    const lines = content.split('\n');
    const output = [];
    let inStringData = false;

    lines.forEach((line) => {
        const stringData = /^(\s*)stringData:\s*$/.exec(line);

        if (stringData) {
            inStringData = true;
            output.push(`${stringData[1]}data:`);

            return;
        }

        const field = /^(\s+)([^:\s]+):\s*(.*)$/.exec(line);

        if (inStringData && field) {
            output.push(
                `${field[1]}${field[2]}: ${Buffer.from(
                    field[3].trim()
                ).toString('base64')}`
            );

            return;
        }

        if (inStringData) {
            inStringData = false;
        }

        output.push(line);
    });

    return output.join('\n');
};

const flagBuildArgs = (args = []) => args.map((arg) => `--build-arg ${arg}`);

/**
 * Pad a string with a left space, if the string has a length.
 * @param {String} str A string to pad with a left space.
 * @return {String} A string left-padded with a space.
 */
const leftSpace = (str) => {
    if (str && typeof str === 'string') {
        return ` ${str}`;
    }

    return str;
};

const formatBuildArgs = (args) => {
    if (Array.isArray(args)) {
        return args.length > 0 ? `${leftSpace(args.join(' '))}` : '';
    }

    if (typeof args === 'object' && args !== null) {
        const keys = Object.keys(args);

        if (keys.length) {
            return `${leftSpace(
                keys
                    .map(
                        (key) =>
                            `--build-arg ${key}=${
                                typeof args[key] === 'function'
                                    ? args[key]()
                                    : args[key]
                            }`
                    )
                    .join(' ')
            )}`;
        }
    }

    return '';
};

const formatBuildSecrets = (secrets) => {
    if (Array.isArray(secrets)) {
        return secrets.length > 0 ? `${leftSpace(secrets.join(' '))}` : '';
    }

    if (typeof secrets === 'object' && secrets !== null) {
        const keys = Object.keys(secrets);

        if (keys.length) {
            return `${leftSpace(
                keys
                    .map((key) => {
                        const secretId = key.toLowerCase().replace(/-/g, '_');
                        const secretValue =
                            typeof secrets[key] === 'function'
                                ? secrets[key]()
                                : secrets[key];

                        // If secretValue is provided, use it as env var name, otherwise use the key
                        const envVarName =
                            typeof secretValue === 'string' &&
                            secretValue.startsWith('$')
                                ? secretValue.slice(1)
                                : key;

                        return `--secret id=${secretId},env=${envVarName}`;
                    })
                    .join(' ')
            )}`;
        }
    }

    return '';
};

/**
 * Ensure the 1Password cli is installed and an authenticated session is
 * available, before any op command is attempted. The check is memoized: it
 * runs at most once per cli invocation.
 * @returns {Promise<void>} Rejects with a friendly error when the cli is missing or not signed in.
 */
let opAuthenticated = null;

const ensureOpAuthenticated = () => {
    if (!opAuthenticated) {
        opAuthenticated = execFileAsync('op', ['whoami']).catch((e) => {
            if (e.code === 'ENOENT') {
                throw new Error(
                    'The 1Password cli (op) is not installed. Install it to resolve secret references within templates.'
                );
            }

            throw new Error(
                'Not signed in to the 1Password cli. Run `eval $(op signin)` in this shell and try again.'
            );
        });
    }

    return opAuthenticated;
};

/**
 * Resolve any 1Password secret references within template content using the op cli.
 * Uses file mode (rather than a stdin pipe) because the op cli can miss data
 * written to a stdin pipe before it starts reading.
 * @param {String} content The content of a template file, containing secret references.
 * @returns {Promise<String>} The content with all secret references resolved to their actual values.
 */
const injectSecretReferences = async (content) => {
    await ensureOpAuthenticated();

    const tempFolder = await mkdtemp(join(tmpdir(), 'c-kc-'));
    const inPath = join(tempFolder, 'inject.yaml.tmpl');
    const outPath = join(tempFolder, 'inject.yaml');

    try {
        await writeFile(inPath, content, { mode: 0o600 });

        await execFileAsync('op', [
            'inject',
            '--in-file',
            inPath,
            '--out-file',
            outPath,
        ]);

        return await readFile(outPath, 'utf-8');
    } finally {
        await remove(tempFolder);
    }
};

const renderServicesTemplates = async (path = '', services = []) => {
    await asyncForEach(services, async (service) => {
        const sourceFolder = resolvePath(process.cwd(), path);
        const sourcePath = join(sourceFolder, service.path);
        const destinationFolder = join(sourceFolder, '.compiled');
        const destinationPath = join(destinationFolder, service.path);

        let content;

        try {
            content = await readFile(`${sourcePath}.yaml.tmpl`, 'utf-8');
        } catch (e) {
            // Do nothing.
            // It just means we don't have a template file to render.
            return;
        }

        // The template is rendered before secret references are resolved, so
        // that secret values never have the opportunity to interfere with the
        // template engine (i.e. a value containing curly braces). This is why
        // references must be bare (not {{ }} wrapped): placeholders are gone
        // by the time the references are resolved.
        let rendered = Mustache.render(content, service.locals);
        const destinationFile = `${destinationPath}.yaml`;

        if (containsSecretReferences(rendered)) {
            try {
                rendered = await injectSecretReferences(rendered);
            } catch (e) {
                throw new Error(
                    `Could not inject 1Password secret references: ${e.message}. Please ensure the 1Password cli is installed and you are signed in (eval $(op signin)).`
                );
            }
        }

        if (service.type === 'secret') {
            rendered = encodeSecretStringData(rendered);
        }

        await ensureDir(destinationFolder);
        await writeFile(destinationFile, rendered, {
            encoding: 'utf8',
            mode: service.type === 'secret' ? 0o600 : 0o644,
        });

        if (service.type === 'secret') {
            // writeFile's mode only applies at creation; chmod catches files
            // left over from a previous run with looser permissions.
            await chmod(destinationFile, 0o600);
        }
    });
};

/**
 * Remove compiled secret manifests, so that plaintext secrets don't linger on
 * disk after they've been applied to Kubernetes. Only acts on the local
 * environment; other environments are out of scope.
 * @param {Object} options
 * @param {String} options.env The current project environment.
 * @param {String} options.path The path to a bunch of Kubernetes manifests.
 * @param {Array} options.services An array of Kubernetes location services.
 * @returns {Promise<Array>} The paths of the secret files that were removed.
 */
const removeCompiledSecrets = async ({ env, path = '', services = [] }) => {
    if (env !== 'local') {
        return [];
    }

    const removed = [];

    await asyncForEach(services, async (service) => {
        if (service.type !== 'secret') {
            return;
        }

        const destinationFolder = join(
            resolvePath(process.cwd(), path),
            '.compiled'
        );
        const destinationFile = join(destinationFolder, `${service.path}.yaml`);

        try {
            await unlink(destinationFile);
            removed.push(destinationFile);
        } catch (e) {
            // Any error other than a missing file should be surfaced: failing
            // to remove a compiled secret leaves plaintext on disk.
            if (e.code !== 'ENOENT') {
                throw e;
            }
        }
    });

    return removed;
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
            if (
                typeof local === 'string' &&
                Object.keys(constantLocals).includes(local)
            ) {
                service.locals[local] = constantLocals[local];

                return;
            }

            if (typeof local === 'string' && local === 'tag') {
                service.locals[local] =
                    state.kubernetes.environments[state.env].build.tags[
                        `${prefix}/${service.location}`
                    ];

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

const validateBuildArgs = (args = []) =>
    args.filter((arg) => arg.split('=').length == 2);

module.exports = {
    ensureServiceFilesExist,
    flagBuildArgs,
    formatBuildArgs,
    formatBuildSecrets,
    renderServicesTemplates,
    removeCompiledSecrets,
    setLocalsForServices,
    validateBuildArgs,
};
