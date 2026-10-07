'use strict';

const { resolve: resolvePath, join } = require('path');
const { access, chmod, ensureDir, writeFile } = require('fs-extra');

const { formatProjectPrefix } = require('./c-project');
const { getSecretsContract, getService, serviceKeys } = require('./c-secrets');
const { encodeSecretStringData, injectSecretReferences } = require('./c-kc');

/**
 * Render a SecretProviderClass for a contract service: one entry per key
 * (owned and borrowed, alphabetical), global-format resource names.
 * @param {Object} options
 * @param {Array} options.entries Resolved key identities.
 * @param {String} options.namespace The target namespace.
 * @param {String} options.service The service name.
 * @returns {String} The manifest content.
 */
const renderSecretProviderClass = ({ entries, namespace, service }) =>
    [
        'apiVersion: secrets-store.csi.x-k8s.io/v1',
        'kind: SecretProviderClass',
        'metadata:',
        '    labels:',
        `        svc: ${service}`,
        '        type: secretproviderclass',
        `    name: ${service}`,
        `    namespace: ${namespace}`,
        'spec:',
        '    provider: gke',
        '    parameters:',
        '        secrets: |',
    ]
        .concat(
            entries.map(
                (resolved) =>
                    `            - resourceName: '${resolved.resourceName}'\n              path: '${resolved.path}'`
            )
        )
        .concat([''])
        .join('\n');

/**
 * Render a SecretSync for a contract service: sourcePath is the key
 * lowercase-hyphenated, targetKey the canonical environment-variable name.
 * @param {Object} options
 * @param {Array} options.entries Resolved key identities.
 * @param {String} options.namespace The target namespace.
 * @param {String} options.service The service name.
 * @returns {String} The manifest content.
 */
const renderSecretSync = ({ entries, namespace, service }) =>
    [
        'apiVersion: secret-sync.gke.io/v1',
        'kind: SecretSync',
        'metadata:',
        '    labels:',
        `        svc: ${service}`,
        '        type: secretsync',
        `    name: ${service}`,
        `    namespace: ${namespace}`,
        'spec:',
        '    serviceAccountName: secret-sync',
        `    secretProviderClassName: ${service}`,
        '    secretObject:',
        '        type: Opaque',
        '        data:',
    ]
        .concat(
            entries.map(
                (resolved) =>
                    `            - sourcePath: '${resolved.path}'\n              targetKey: '${resolved.key}'`
            )
        )
        .concat([''])
        .join('\n');

/**
 * Render the secret-sync ServiceAccount for the namespace.
 * @param {Object} options
 * @param {String} options.namespace The target namespace.
 * @returns {String} The manifest content.
 */
const renderSecretSyncServiceAccount = ({ namespace }) =>
    [
        'apiVersion: v1',
        'kind: ServiceAccount',
        'metadata:',
        '    labels:',
        '        svc: secretsync',
        '        type: serviceaccount',
        '    name: secret-sync',
        `    namespace: ${namespace}`,
        '',
    ].join('\n');

/**
 * Render a local Secret manifest (pre-injection) for a contract service:
 * stringData entries carry bare op:// references resolved from the
 * contract, injected and base64-encoded by the same pipeline as committed
 * templates.
 * @param {Object} options
 * @param {Array} options.entries Resolved key identities.
 * @param {String} options.namespace The target namespace.
 * @param {String} options.service The service name.
 * @returns {String} The manifest content (with op:// references).
 */
const renderLocalSecret = ({ entries, namespace, service }) => {
    // An unbound owner resolves no op:// reference: rendering would embed
    // a literal null as the secret value, so fail the generation instead.
    const unbound = entries.find((resolved) => !resolved.opRef);

    if (unbound) {
        const remedy =
            unbound.owner && unbound.owner.name === 'shared'
                ? 'set shared.opItem in c.js (the item that stores the shared values)'
                : `run \`c op set ${service} local ${unbound.key}\` (it binds the service's item)`;

        throw new Error(
            `Cannot render the local Secret for service '${service}': key '${unbound.key}' has no op:// reference (its owner is unbound) - ${remedy}, then re-run.`
        );
    }

    return [
        'apiVersion: v1',
        'kind: Secret',
        'metadata:',
        '    labels:',
        `        svc: ${service}`,
        '        type: secret',
        `    name: ${service}`,
        `    namespace: ${namespace}`,
        'type: Opaque',
        'stringData:',
    ]
        .concat(
            entries.map((resolved) => `    ${resolved.key}: ${resolved.opRef}`)
        )
        .concat([''])
        .join('\n');
};

/**
 * Generate every secret-shaped manifest declared by the contract for the
 * environment's locations: SecretProviderClasses, SecretSyncs and the
 * secret-sync ServiceAccount for deployed environments, and local Secrets
 * (op references) for the local environment. Generated output is written
 * straight to the compiled folder - a conflicting committed source file is
 * a hard error (one true source). No contract, no generation: legacy file
 * behaviour is untouched.
 * @param {Object} options
 * @param {Object} options.config The full c.js configuration.
 * @param {String} options.env The environment being compiled.
 * @param {String} [options.namespace] The target namespace (derived when
 * omitted).
 * @param {String} options.path The manifests path for the environment.
 * @param {Array} options.services The environment's location services.
 * @returns {Promise} Resolves with the array of generated file names.
 */
const generateSecretManifests = async ({
    config,
    env,
    namespace,
    path = '',
    services = [],
}) => {
    const contract = getSecretsContract({ config });

    if (!contract) {
        return [];
    }

    const targetNamespace =
        namespace ||
        formatProjectPrefix(
            contract.organisation,
            contract.name,
            env,
            true,
            true
        );

    const sourceFolder = resolvePath(process.cwd(), path);
    const destinationFolder = join(sourceFolder, '.compiled');
    const generated = [];

    await ensureDir(destinationFolder);

    const assertNoCommittedFile = async ({ servicePath }) => {
        const base = join(sourceFolder, servicePath);

        const conflicts = await Promise.all(
            [`${base}.yaml`, `${base}.yaml.tmpl`].map(async (candidate) => {
                try {
                    await access(candidate);

                    return candidate;
                } catch (e) {
                    return null;
                }
            })
        );

        const conflict = conflicts.find((candidate) => candidate);

        if (conflict) {
            throw new Error(
                `${conflict.replace(
                    `${sourceFolder}/`,
                    ''
                )} conflicts with the secrets contract - the contract generates this file (delete the committed file; the contract is the one true source)`
            );
        }
    };

    const writeCompiled = async ({ content, mode, servicePath }) => {
        await writeFile(
            join(destinationFolder, `${servicePath}.yaml`),
            content,
            {
                encoding: 'utf8',
                mode,
            }
        );

        generated.push(`${servicePath}.yaml`);
    };

    // Group the location entries by shape and name: 'site' ->
    // { secret: ..., secretproviderclass: ..., secretsync: ... }.
    const shapes = {
        secret: {},
        secretproviderclass: {},
        secretsync: {},
        serviceaccount: {},
    };

    services.forEach((service) => {
        const [name, shape] = service.path.split('.');

        if (!shapes[shape]) {
            shapes[shape] = {};
        }

        shapes[shape][name] = service;
    });

    const entriesFor = ({ name }) => {
        const service = getService({ contract, name });

        return serviceKeys({ contract, env, service });
    };

    const shapesInOrder = [
        'secretproviderclass',
        'secretsync',
        'serviceaccount',
    ];

    await Promise.all(
        shapesInOrder.map(async (shape) => {
            const names = Object.keys(shapes[shape]).sort();

            await Promise.all(
                names.map(async (name) => {
                    if (shape === 'serviceaccount' && name !== 'secretsync') {
                        return;
                    }

                    const service = shapes[shape][name];

                    await assertNoCommittedFile({
                        servicePath: service.path,
                    });

                    if (shape === 'serviceaccount') {
                        return writeCompiled({
                            content: renderSecretSyncServiceAccount({
                                namespace: targetNamespace,
                            }),
                            mode: 0o644,
                            servicePath: service.path,
                        });
                    }

                    const entries = entriesFor({ name });

                    if (shape === 'secretproviderclass') {
                        return writeCompiled({
                            content: renderSecretProviderClass({
                                entries,
                                namespace: targetNamespace,
                                service: name,
                            }),
                            mode: 0o644,
                            servicePath: service.path,
                        });
                    }

                    return writeCompiled({
                        content: renderSecretSync({
                            entries,
                            namespace: targetNamespace,
                            service: name,
                        }),
                        mode: 0o644,
                        servicePath: service.path,
                    });
                })
            );
        })
    );

    // Local Secrets: generate with op references, then run the exact
    // pipeline committed templates follow (inject, base64, 0600).
    await Promise.all(
        Object.keys(shapes.secret)
            .sort()
            .map(async (name) => {
                const service = shapes.secret[name];
                const entries = entriesFor({ name });

                await assertNoCommittedFile({ servicePath: service.path });

                let content = renderLocalSecret({
                    entries,
                    namespace: targetNamespace,
                    service: name,
                });

                content = await injectSecretReferences(content);

                const destinationFile = join(
                    destinationFolder,
                    `${service.path}.yaml`
                );

                await writeFile(
                    destinationFile,
                    encodeSecretStringData(content),
                    { encoding: 'utf8', mode: 0o600 }
                );

                await chmod(destinationFile, 0o600);

                generated.push(`${service.path}.yaml`);
            })
    );

    return generated;
};

module.exports = {
    generateSecretManifests,
    renderLocalSecret,
    renderSecretProviderClass,
    renderSecretSync,
    renderSecretSyncServiceAccount,
};
