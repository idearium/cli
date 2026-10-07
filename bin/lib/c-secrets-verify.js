'use strict';

const getPropertyPath = require('get-value');

const { formatProjectPrefix } = require('./c-project');
const { serviceKeys } = require('./c-secrets');
const {
    assertKubectl,
    gcfList,
    gsmDescribe,
    gsmRead,
    k8sReadKey,
    k8sSecretKeys,
    opFindItemByTitle,
    opItemFields,
    opReadSha,
    sha12,
    spcList,
} = require('./c-secrets-io');

/**
 * The Kubernetes environment configuration for an env (context, locations),
 * or null when the project declares none.
 * @param {Object} options
 * @param {Object} options.config The full c.js configuration.
 * @param {String} options.env The environment.
 * @returns {Object|null}
 */
const kubernetesEnv = ({ config, env }) =>
    getPropertyPath(config, `kubernetes.environments.${env}`) || null;

/**
 * The services the env's Kubernetes locations synchronise (those with a
 * secretsync location entry).
 * @param {Object} options
 * @param {Object} options.config The full c.js configuration.
 * @param {String} options.env The environment.
 * @returns {Array} Service names with a secretsync location.
 */
const syncServiceNames = ({ config, env }) => {
    const kenv = kubernetesEnv({ config, env });

    if (!kenv) {
        return [];
    }

    const names = [];

    Object.values(kenv.locations || {}).forEach((entries) => {
        (entries || []).forEach((entry) => {
            if (entry.type === 'secretsync' && entry.path) {
                names.push(entry.path.replace(/\.secretsync$/, ''));
            }
        });
    });

    return [...new Set(names)].sort();
};

/**
 * Verify one environment: contract-derived GSM secrets exist, their values
 * hash-match 1Password, Kubernetes Secrets (for synced services) match
 * structure and hashes, and deployed Cloud Functions reference only
 * contract-derived secret ids. Values are compared by hash only.
 * @param {Object} options
 * @param {Object} options.config The full c.js configuration.
 * @param {Object} options.contract The normalised contract.
 * @param {String} options.env The environment.
 * @returns {Promise} Resolves with { lines, ok }.
 */
const verifyEnv = ({ config, contract, env }) => {
    const lines = [];
    const problems = [];

    const report = ({ message, ok }) => {
        lines.push(`${ok ? 'OK      ' : 'PROBLEM '} ${message}`);

        if (!ok) {
            problems.push(message);
        }
    };

    const entries = Object.values(contract.services)
        .concat(contract.shared ? [contract.shared] : [])
        .sort((a, b) => a.name.localeCompare(b.name));

    const repoPrefix = `${contract.organisation}-${contract.name}-`;

    // Derived ids per env, so function references (which may belong to any
    // env - the env is encoded in the secret id, not the function name)
    // can be routed to the right contract set.
    const envs = Object.keys(
        getPropertyPath(config, 'kubernetes.environments') || {}
    );

    const derivedByEnv = {};
    envs.forEach((candidate) => {
        derivedByEnv[candidate] = new Set();

        entries.forEach((service) => {
            serviceKeys({ contract, env: candidate, service }).forEach(
                (resolved) => {
                    derivedByEnv[candidate].add(resolved.gsmId);
                }
            );
        });
    });

    // Lazily resolved op items per owner (reads never create).
    const opItems = {};
    const opItemFor = (owner) => {
        if (!(owner.name in opItems)) {
            opItems[owner.name] = owner.opItem
                ? owner.opItem
                : opFindItemByTitle({
                      title: `${contract.organisation}-${contract.name}/${owner.name}`,
                  });
        }

        return opItems[owner.name];
    };

    // Reverse mapping for readable storage notes: which entry owns an item.
    const itemOwners = {};

    entries.forEach((entry) => {
        if (entry.opItem) {
            itemOwners[entry.opItem] = entry.name;
        }
    });

    // GSM value hashes per secret id, recorded in phase 1 and compared
    // against the Kubernetes values in phase 2.
    const gsmShas = {};

    // 1. GSM existence + op/GSM value hashes.
    return entries
        .reduce(
            (promise, service) =>
                promise.then(() =>
                    serviceKeys({ contract, env, service }).reduce(
                        (keyPromise, resolved) =>
                            keyPromise.then(() =>
                                gsmDescribe({
                                    id: resolved.gsmId,
                                    project: contract.project,
                                }).then((secret) => {
                                    if (!secret) {
                                        return report({
                                            message: `${service.name}/${resolved.key} gsm ${resolved.gsmId} MISSING`,
                                            ok: false,
                                        });
                                    }

                                    return gsmRead({
                                        id: resolved.gsmId,
                                        project: contract.project,
                                    }).then((gsmValue) => {
                                        const gsmSha = sha12({
                                            value: gsmValue,
                                        });

                                        gsmShas[resolved.gsmId] = gsmSha;

                                        const opItem = opItemFor(
                                            resolved.owner
                                        );

                                        if (!opItem) {
                                            return report({
                                                message: `${service.name}/${resolved.key} op:UNBOUND (no 1Password item '${contract.organisation}-${contract.name}/${resolved.owner.name}') gsm:${gsmSha}`,
                                                ok: false,
                                            });
                                        }

                                        const storedIn = itemOwners[opItem]
                                            ? ` (stored in the ${itemOwners[opItem]} item)`
                                            : '';

                                        try {
                                            const opSha = opReadSha({
                                                ref: `op://${contract.vault}/${opItem}/${env}/${resolved.key}`,
                                            });

                                            return report({
                                                message: `${service.name}/${resolved.key} op:${opSha}${storedIn} gsm:${gsmSha}`,
                                                ok: opSha === gsmSha,
                                            });
                                        } catch (e) {
                                            return report({
                                                message: `${service.name}/${
                                                    resolved.key
                                                } op:${
                                                    resolved.opRef
                                                } READ-ERROR ${e.message.slice(
                                                    0,
                                                    60
                                                )} gsm:${gsmSha}`,
                                                ok: false,
                                            });
                                        }
                                    });
                                })
                            ),
                        Promise.resolve()
                    )
                ),
            Promise.resolve()
        )
        .then(() => {
            // 2. Kubernetes structure + hashes for synced services.
            const kenv = kubernetesEnv({ config, env });

            if (!kenv) {
                return null;
            }

            const namespace = formatProjectPrefix(
                contract.organisation,
                contract.name,
                env,
                true,
                true
            );

            return syncServiceNames({ config, env }).reduce(
                (promise, name) =>
                    promise.then(() => {
                        const service = contract.services[name];

                        if (!service) {
                            return report({
                                message: `k8s ${name}: secretsync location but no contract service`,
                                ok: false,
                            });
                        }

                        const expected = serviceKeys({
                            contract,
                            env,
                            service,
                        });

                        try {
                            const liveKeys = k8sSecretKeys({
                                context: kenv.context,
                                namespace,
                                secret: name,
                            }).sort();

                            const expectedKeys = expected
                                .map((resolved) => resolved.key)
                                .sort();

                            const structureOk =
                                JSON.stringify(liveKeys) ===
                                JSON.stringify(expectedKeys);

                            report({
                                message: `k8s ${name}: ${liveKeys.length} keys${
                                    structureOk
                                        ? ''
                                        : ` (expected ${
                                              expectedKeys.length
                                          }: ${expectedKeys.join(', ')})`
                                }`,
                                ok: structureOk,
                            });

                            if (!structureOk) {
                                return null;
                            }

                            return expected.reduce(
                                (keyPromise, resolved) =>
                                    keyPromise.then(() => {
                                        const k8sValue = Buffer.from(
                                            k8sReadKey({
                                                context: kenv.context,
                                                key: resolved.key,
                                                namespace,
                                                secret: name,
                                            }),
                                            'base64'
                                        );

                                        const k8sSha = sha12({
                                            value: k8sValue,
                                        });
                                        const gsmSha = gsmShas[resolved.gsmId];

                                        if (!gsmSha) {
                                            return report({
                                                message: `k8s ${name}/${resolved.key} ${k8sSha} (no GSM hash to compare - the GSM secret was missing above)`,
                                                ok: false,
                                            });
                                        }

                                        return report({
                                            message: `k8s ${name}/${
                                                resolved.key
                                            } ${k8sSha} gsm:${gsmSha}${
                                                k8sSha === gsmSha
                                                    ? ''
                                                    : ' (value drift, or the SecretSync has not caught up yet)'
                                            }`,
                                            ok: k8sSha === gsmSha,
                                        });
                                    }),
                                Promise.resolve()
                            );
                        } catch (e) {
                            return report({
                                message: `k8s ${name}: READ-ERROR ${e.message.slice(
                                    0,
                                    80
                                )}`,
                                ok: false,
                            });
                        }
                    }),
                Promise.resolve()
            );
        })
        .then(() => {
            // 3. Stale 1Password fields: fields present in known sections
            // (environment sections on service items, consumer sections on
            // the dev item) that the contract does not assign anywhere.
            const expected = new Set();
            const note = (item, section, field) =>
                `${item}|${section}|${field}`;

            entries.forEach((entry) => {
                const item = opItemFor(entry);

                if (!item) {
                    return;
                }

                entry.keys.forEach((key) => {
                    envs.forEach((entryEnv) => {
                        expected.add(note(item, entryEnv, key));
                    });
                });
            });

            const itemsToScan = new Set();

            entries.forEach((entry) => {
                const item = opItemFor(entry);

                if (item) {
                    itemsToScan.add(item);
                }
            });

            const consumerSections = new Set(
                contract.dev ? Object.keys(contract.dev.consumers) : []
            );

            if (contract.dev) {
                itemsToScan.add(contract.dev.opItem);

                consumerSections.forEach((consumerName) => {
                    contract.dev.consumers[consumerName].keys.forEach((key) => {
                        expected.add(
                            note(contract.dev.opItem, consumerName, key)
                        );
                    });
                });
            }

            const scanned = [...itemsToScan].map((item) =>
                Promise.resolve()
                    .then(() => opItemFields({ item }))
                    .then((fields) => ({ fields, item }))
                    .catch(() => null)
            );

            return Promise.all(scanned).then((results) => {
                results.filter(Boolean).forEach(({ fields, item }) => {
                    const ownerName = itemOwners[item] || 'dev';
                    const isDevItem =
                        contract.dev && contract.dev.opItem === item;

                    fields.forEach(({ field, section }) => {
                        const knownSection = isDevItem
                            ? consumerSections.has(section)
                            : envs.includes(section);

                        if (
                            knownSection &&
                            !expected.has(note(item, section, field))
                        ) {
                            report({
                                message: `op:EXTRA ${ownerName}/${section}/${field} (in 1Password but not the contract)`,
                                ok: false,
                            });
                        }
                    });
                });
            });
        })
        .then(() =>
            // 4. Deployed-functions drift: every repo-prefixed secret id a
            // function references must be in the contract-derived set for
            // the env encoded in the id (function names don't carry the
            // env - beta has an infix, production doesn't).
            gcfList({
                project: contract.project,
                region: contract.region,
                repoPrefix,
            }).then((functions) => {
                functions.forEach((fn) => {
                    fn.secrets.forEach((id) => {
                        if (!id.startsWith(repoPrefix)) {
                            return;
                        }

                        const refEnv = envs.find((candidate) =>
                            id.startsWith(`${repoPrefix}${candidate}-`)
                        );

                        if (refEnv && derivedByEnv[refEnv].has(id)) {
                            lines.push(`OK      function ${fn.name} -> ${id}`);

                            return;
                        }

                        report({
                            message: `STALE   function ${fn.name} -> ${id}${
                                refEnv ? '' : ' (unknown env)'
                            } (not in contract)`,
                            ok: false,
                        });
                    });
                });

                return {
                    lines,
                    ok: problems.length === 0,
                    problems,
                };
            })
        );
};

/**
 * Find everything referencing a GSM secret id: contract consumers, the
 * environment's SecretProviderClasses and deployed Cloud Functions.
 * @param {Object} options
 * @param {Object} options.config The full c.js configuration.
 * @param {Object} options.contract The normalised contract.
 * @param {String} options.secretId The GSM secret id.
 * @returns {Promise} Resolves with { contract, env, functions, k8s }.
 */
const findConsumers = ({ config, contract, secretId }) => {
    const prefix = `${contract.organisation}-${contract.name}-`;

    if (!secretId.startsWith(prefix)) {
        throw new Error(
            `'${secretId}' does not carry this project's prefix (${prefix})`
        );
    }

    const envs = Object.keys(
        getPropertyPath(config, 'kubernetes.environments') || {}
    );

    const env = envs.find((candidate) =>
        secretId.startsWith(`${prefix}${candidate}-`)
    );

    if (!env) {
        throw new Error(
            `Could not parse an environment out of '${secretId}' (known envs: ${
                envs.join(', ') || 'none'
            })`
        );
    }

    const result = {
        contract: [],
        env,
        functions: [],
        k8s: [],
    };

    // 1. Contract consumers (services and the shared block deriving this
    // id for this env).
    Object.values(contract.services)
        .concat(contract.shared ? [contract.shared] : [])
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((service) => {
            serviceKeys({ contract, env, service }).forEach((resolved) => {
                if (resolved.gsmId === secretId) {
                    result.contract.push({
                        borrowed: resolved.owner.name !== service.name,
                        key: resolved.key,
                        owner: resolved.owner.name,
                        service: service.name,
                    });
                }
            });
        });

    const kenv = kubernetesEnv({ config, env });
    const namespace = formatProjectPrefix(
        contract.organisation,
        contract.name,
        env,
        true,
        true
    );

    // 2 + 3. Live consumers (k8s SecretProviderClasses, functions).
    if (kenv && kenv.context) {
        assertKubectl({ context: kenv.context });
    }

    const live = kenv
        ? Promise.all([
              spcList({ context: kenv.context, namespace }),
              gcfList({
                  project: contract.project,
                  region: contract.region,
                  repoPrefix: `${contract.organisation}-${contract.name}-`,
              }),
          ])
        : Promise.resolve([[], []]);

    return live.then(([spcs, functions]) => {
        spcs.forEach((spc) => {
            if (spc.ids.includes(secretId)) {
                result.k8s.push({ name: spc.name, namespace });
            }
        });

        functions.forEach((fn) => {
            if (fn.secrets.includes(secretId)) {
                result.functions.push({ name: fn.name });
            }
        });

        return result;
    });
};

module.exports = {
    findConsumers,
    kubernetesEnv,
    syncServiceNames,
    verifyEnv,
};
