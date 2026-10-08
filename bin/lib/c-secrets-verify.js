'use strict';

const getPropertyPath = require('get-value');

const { formatProjectPrefix } = require('./c-project');
const { serviceKeys } = require('./c-secrets');
const {
    assertKubectl,
    gcfList,
    gsmList,
    gsmRead,
    k8sReadSecret,
    opItemValues,
    opListItems,
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
 * contract-derived secret ids that exist in GSM. Values are compared by
 * hash only. Data is prefetched in bulk, then every check reports as it
 * runs.
 * @param {Object} options
 * @param {Object} options.config The full c.js configuration.
 * @param {Object} options.contract The normalised contract.
 * @param {String} options.env The environment.
 * @returns {Promise} Resolves with { ok, problems }.
 */
const verifyEnv = ({ config, contract, env }) => {
    const problems = [];

    // Report as checks run: the pass takes a while, so progress beats
    // buffering everything for the end.
    const report = ({ message, ok }) => {
        process.stdout.write(`${ok ? 'OK      ' : 'PROBLEM '} ${message}\n`);

        if (!ok) {
            problems.push(message);
        }
    };

    const section = ({ detail, title }) => {
        process.stdout.write(`\n== ${title} ==\n${detail}\n\n`);
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

    // Reverse mapping for readable storage notes: which entry owns an item.
    const itemOwners = {};

    entries.forEach((entry) => {
        if (entry.opItem) {
            itemOwners[entry.opItem] = entry.name;
        }
    });

    // Bulk prefetch, so the checks below run from local data: one item
    // list resolves every owner's item id (reads never create), one item
    // fetch per distinct item carries the values (phase 1) and labels
    // (phase 3), one GSM list covers existence, and one secret fetch per
    // synced service carries the cluster values (phase 2). GSM values
    // have no batch-access API, so they read with bounded concurrency.
    const itemByTitle = new Map(
        opListItems().map((item) => [item.title, item.id])
    );

    const opItemFor = (owner) =>
        owner.opItem ||
        itemByTitle.get(
            `${contract.organisation}-${contract.name}/${owner.name}`
        ) ||
        null;

    const itemIds = new Set();

    entries.forEach((entry) => {
        const item = opItemFor(entry);

        if (item) {
            itemIds.add(item);
        }
    });

    if (contract.dev) {
        itemIds.add(contract.dev.opItem);
    }

    const opData = {};

    itemIds.forEach((item) => {
        try {
            opData[item] = opItemValues({ item });
        } catch (e) {
            opData[item] = { error: e };
        }
    });

    const resolvedKeys = entries.map((service) => ({
        keys: serviceKeys({ contract, env, service }),
        service,
    }));

    // GSM value hashes per secret id, recorded in phase 1 and compared
    // against the Kubernetes values in phase 2.
    const gsmShas = {};
    const gsmValues = {};

    // Run promise-returning work over items with bounded concurrency.
    const pool = ({ items, limit, run }) => {
        let index = 0;

        const worker = () => {
            if (index >= items.length) {
                return Promise.resolve();
            }

            const item = items[index++];

            return run(item).then(worker);
        };

        return Promise.all(
            Array.from({ length: Math.min(limit, items.length) }, worker)
        );
    };

    return gsmList({ project: contract.project })
        .then((existing) => {
            const existingIds = new Set(existing);

            const toRead = [
                ...new Set(
                    resolvedKeys
                        .flatMap(({ keys }) => keys.map((r) => r.gsmId))
                        .filter((id) => existingIds.has(id))
                ),
            ];

            return pool({
                items: toRead,
                limit: 6,
                run: (id) =>
                    gsmRead({ id, project: contract.project }).then((value) => {
                        gsmValues[id] = value;
                    }),
            }).then(() => existingIds);
        })
        .then((existingIds) => {
            // 1. GSM existence + op/GSM value hashes.
            section({
                detail: 'Every contract key exists in GSM and its value hash-matches 1Password.',
                title: '1Password + GSM (contract secrets)',
            });

            resolvedKeys.forEach(({ service, keys }) =>
                keys.forEach((resolved) => {
                    if (!existingIds.has(resolved.gsmId)) {
                        report({
                            message: `${service.name}/${resolved.key} gsm ${resolved.gsmId} MISSING`,
                            ok: false,
                        });

                        return;
                    }

                    const gsmSha = sha12({
                        value: gsmValues[resolved.gsmId],
                    });

                    gsmShas[resolved.gsmId] = gsmSha;

                    const opItem = opItemFor(resolved.owner);

                    if (!opItem) {
                        report({
                            message: `${service.name}/${resolved.key} op:UNBOUND (no 1Password item '${contract.organisation}-${contract.name}/${resolved.owner.name}') gsm:${gsmSha}`,
                            ok: false,
                        });

                        return;
                    }

                    const storedIn = itemOwners[opItem]
                        ? ` (stored in the ${itemOwners[opItem]} item)`
                        : '';

                    const data = opData[opItem];

                    if (!data || data.error) {
                        report({
                            message: `${service.name}/${
                                resolved.key
                            } op:READ-ERROR ${
                                data && data.error
                                    ? String(data.error.message).slice(0, 60)
                                    : 'item not prefetched'
                            } gsm:${gsmSha}`,
                            ok: false,
                        });

                        return;
                    }

                    const value = data.values[`${env}/${resolved.key}`];

                    if (value === undefined) {
                        report({
                            message: `${service.name}/${resolved.key} op:READ-ERROR field '${env}/${resolved.key}' not found in the '${resolved.owner.name}' item gsm:${gsmSha}`,
                            ok: false,
                        });

                        return;
                    }

                    const opSha = sha12({
                        value: Buffer.from(value, 'utf8'),
                    });

                    report({
                        message: `${service.name}/${resolved.key} op:${opSha}${storedIn} gsm:${gsmSha}`,
                        ok: opSha === gsmSha,
                    });
                })
            );

            // 2. Kubernetes structure + hashes for synced services.
            const kenv = kubernetesEnv({ config, env });

            if (kenv) {
                section({
                    detail: 'Synced cluster Secrets carry exactly the contract keys, with values hash-matching GSM.',
                    title: 'Kubernetes Secrets (synced services)',
                });

                const namespace = formatProjectPrefix(
                    contract.organisation,
                    contract.name,
                    env,
                    true,
                    true
                );

                syncServiceNames({ config, env }).forEach((name) => {
                    const service = contract.services[name];

                    if (!service) {
                        report({
                            message: `k8s ${name}: secretsync location but no contract service`,
                            ok: false,
                        });

                        return;
                    }

                    const expected = serviceKeys({
                        contract,
                        env,
                        service,
                    });

                    let secret;

                    try {
                        secret = k8sReadSecret({
                            context: kenv.context,
                            namespace,
                            secret: name,
                        });
                    } catch (e) {
                        report({
                            message: `k8s ${name}: READ-ERROR ${e.message.slice(
                                0,
                                80
                            )}`,
                            ok: false,
                        });

                        return;
                    }

                    const liveKeys = [...secret.keys].sort();
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
                        return;
                    }

                    expected.forEach((resolved) => {
                        const k8sSha = sha12({
                            value: secret.values[resolved.key],
                        });
                        const gsmSha = gsmShas[resolved.gsmId];

                        if (!gsmSha) {
                            report({
                                message: `k8s ${name}/${resolved.key} ${k8sSha} (no GSM hash to compare - the GSM secret was missing above)`,
                                ok: false,
                            });

                            return;
                        }

                        report({
                            message: `k8s ${name}/${
                                resolved.key
                            } ${k8sSha} gsm:${gsmSha}${
                                k8sSha === gsmSha
                                    ? ''
                                    : ' (value drift, or the SecretSync has not caught up yet)'
                            }`,
                            ok: k8sSha === gsmSha,
                        });
                    });
                });
            }

            // 3. Stale 1Password fields: fields present in known sections
            // (environment sections on service items, consumer sections on
            // the dev item) that the contract does not assign anywhere.
            section({
                detail: 'Fields in known item sections (per environment on service items, per consumer on the dev item) that the contract assigns nowhere.',
                title: '1Password stale fields',
            });

            const expected = new Set();
            const note = (item, sectionName, field) =>
                `${item}|${sectionName}|${field}`;

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

            itemsToScan.forEach((item) => {
                const data = opData[item];

                if (!data || data.error) {
                    return;
                }

                const ownerName = itemOwners[item] || 'dev';
                const isDevItem = contract.dev && contract.dev.opItem === item;

                data.fields.forEach(({ field, section: fieldSection }) => {
                    const knownSection = isDevItem
                        ? consumerSections.has(fieldSection)
                        : envs.includes(fieldSection);

                    if (
                        knownSection &&
                        !expected.has(note(item, fieldSection, field))
                    ) {
                        report({
                            message: `op:EXTRA ${ownerName}/${fieldSection}/${field} (in 1Password but not the contract)`,
                            ok: false,
                        });
                    }
                });
            });

            // 4. Deployed-functions drift: every repo-prefixed secret id a
            // function references must be in the contract-derived set for
            // the env encoded in the id (function names don't carry the
            // env - beta has an infix, production doesn't), and must
            // reference a GSM secret that exists.
            return gcfList({
                project: contract.project,
                region: contract.region,
                repoPrefix,
            }).then((functions) => {
                section({
                    detail: 'Secret bindings of each deployed function must match ids the c.js contract computes and reference GSM secrets that exist. STALE = an old id the contract no longer computes; MISSING = the referenced GSM secret is gone.',
                    title: 'Deployed functions (secret references)',
                });

                functions.forEach((fn) => {
                    fn.secrets.forEach((id) => {
                        if (!id.startsWith(repoPrefix)) {
                            return;
                        }

                        const refEnv = envs.find((candidate) =>
                            id.startsWith(`${repoPrefix}${candidate}-`)
                        );

                        const inContract =
                            refEnv && derivedByEnv[refEnv].has(id);

                        if (inContract) {
                            if (existingIds.has(id)) {
                                report({
                                    message: `function ${fn.name} -> ${id}`,
                                    ok: true,
                                });

                                return;
                            }

                            report({
                                message: `MISSING  function ${fn.name} -> ${id} (contract id, but the GSM secret does not exist)`,
                                ok: false,
                            });

                            return;
                        }

                        report({
                            message: `STALE   function ${fn.name} -> ${id}${
                                refEnv ? '' : ' (unknown env)'
                            } (not in contract${
                                existingIds.has(id)
                                    ? ''
                                    : ', and the GSM secret no longer exists'
                            })`,
                            ok: false,
                        });
                    });
                });

                return {
                    ok: problems.length === 0,
                    problems,
                };
            });
        });
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
