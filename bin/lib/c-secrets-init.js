'use strict';

const { readdirSync, readFileSync, statSync } = require('fs');
const { join } = require('path');

const {
    gsmDescribe,
    gsmRead,
    opRead,
    quoteIfNeeded,
    runOp,
    sha12,
} = require('./c-secrets-io');

const SKIP_DIRS = ['.compiled', '.git', 'docs', 'node_modules'];

/**
 * Walk a directory tree (bounded depth), returning file paths, skipping
 * build output and dependencies.
 * @param {Object} options
 * @param {String} options.dir The directory to walk.
 * @param {Number} [options.depth] The maximum depth.
 * @returns {Array} Absolute file paths.
 */
const walkFiles = ({ dir, depth = 4 }) => {
    let entries = [];

    try {
        entries = readdirSync(dir);
    } catch (e) {
        return [];
    }

    const files = [];

    entries.forEach((entry) => {
        if (SKIP_DIRS.includes(entry)) {
            return;
        }

        const full = join(dir, entry);

        let stats;

        try {
            stats = statSync(full);
        } catch (e) {
            return;
        }

        if (stats.isDirectory()) {
            if (depth > 0) {
                files.push(...walkFiles({ depth: depth - 1, dir: full }));
            }

            return;
        }

        files.push(full);
    });

    return files;
};

/**
 * Uppercase a kebab-case path into its environment-variable style key.
 * @param {Object} options
 * @param {String} options.path The lowercase hyphenated path.
 * @returns {String} The environment-variable style key.
 */
const pathToKey = ({ path }) => path.toUpperCase().replace(/-/g, '_');

/**
 * List the 1Password items for a project prefix, mapped by service name.
 * Best-effort: returns null when no session is available.
 * @param {Object} options
 * @param {String} options.prefix The item title prefix ({org}-{repo}/).
 * @returns {Object|null} A map of service name to item id.
 */
const opItemNames = ({ prefix }) => {
    let raw;

    try {
        raw = runOp({
            args: ['item', 'list', '--vault=Team', '--format=json'],
        });
    } catch (e) {
        return { error: e.message, names: null };
    }

    const names = {};

    JSON.parse(raw).forEach((item) => {
        if (item.title && item.title.startsWith(prefix)) {
            names[item.title.slice(prefix.length)] = item.id;
        }
    });

    return { error: null, names };
};

/**
 * Parse a GSM secret id against known envs and service names.
 * @param {Object} options
 * @param {String} options.id The GSM secret id.
 * @param {Array} options.envs The known environments.
 * @param {Object} options.serviceNames The known service names.
 * @param {String} options.repoPrefix The {org}-{repo}- prefix.
 * @returns {Object|null} { ambiguous, key, service } - service null for
 * segment-less (shared) keys.
 */
const parseId = ({ envs, id, repoPrefix, serviceNames }) => {
    if (!id.startsWith(repoPrefix)) {
        return null;
    }

    const env = envs.find((candidate) =>
        id.startsWith(`${repoPrefix}${candidate}-`)
    );

    if (!env) {
        return null;
    }

    const remainder = id.slice(`${repoPrefix}${env}-`.length);

    // Known service names (1Password items, manifest stems) win with a
    // longest-prefix match, so multi-segment names split correctly.
    const [known] = Object.keys(serviceNames)
        .filter((name) => remainder.startsWith(`${name}-`))
        .sort((a, b) => b.length - a.length);

    if (known) {
        return {
            ambiguous: false,
            key: remainder.slice(known.length + 1),
            service: known,
        };
    }

    const [head, ...rest] = remainder.split('-');

    // Without a known name, a service'd id keeps at least a two-segment
    // key; anything else is treated as segment-less.
    if (rest.length >= 2) {
        return { ambiguous: false, key: rest.join('-'), service: head };
    }

    return { ambiguous: true, key: remainder, service: null };
};

/**
 * Read a JSON file as text for scanning (raw, so scripts strings are
 * included), or null when unparseable.
 * @param {Object} options
 * @param {String} options.file The file path.
 * @returns {String|null}
 */
const safeReadJson = ({ file }) => {
    try {
        return readFileSync(file, 'utf8');
    } catch (e) {
        return null;
    }
};

/**
 * Read a text file for scanning, or null.
 * @param {Object} options
 * @param {String} options.file The file path.
 * @returns {String|null}
 */
const safeReadText = ({ file }) => {
    if (!/\.(json|ya?ml|tmpl)$/.test(file)) {
        return null;
    }

    try {
        return readFileSync(file, 'utf8');
    } catch (e) {
        return null;
    }
};

/**
 * Scan every source that declares secrets (SecretProviderClasses, local
 * secret templates, --set-secrets deploy scripts, env.*.yaml references,
 * c.js docker build args) and draft a secrets contract block for c.js.
 * The draft is for human reconciliation: ownership of shared keys and
 * borrowed keys must be reviewed.
 * @param {Object} options
 * @param {Object} options.config The full c.js configuration.
 * @returns {Object} { blockText, notes, region } - blockText is the
 * `secrets: {...},` c.js snippet.
 */
/**
 * Notes for the minimal scaffold: the no-declarations note plus the vault
 * scan status (observable either way).
 * @param {Object} options
 * @param {String} options.itemPrefix The item title prefix.
 * @param {Object} options.opScan The vault scan result.
 * @returns {Array} The notes.
 */
const minimalNotes = ({ itemPrefix, opScan }) => {
    const notes = [
        'No existing secret declarations found - drafted a minimal contract. Add services with `c secrets add <service> <env> <KEY>` (items are created and bound automatically).',
    ];

    if (!opScan.names) {
        notes.push(`1Password scan skipped (${opScan.error}).`);
    } else if (Object.keys(opScan.names).length === 0) {
        notes.push(`1Password scan found no '${itemPrefix}' items.`);
    }

    return notes;
};

const draftContract = async ({ config }) => {
    const { gcpProjectId: project, name, organisation } = config.project;
    const repoPrefix = `${organisation}-${name}-`;

    const environments =
        (config.kubernetes && config.kubernetes.environments) || {};
    const envs = Object.keys(environments);

    const itemPrefix = `${organisation}-${name}/`;
    const opScan = opItemNames({ prefix: itemPrefix });
    const nameHints = opScan.names || {};

    const ids = new Map();
    const localRefs = new Map();
    const consumerRefs = [];
    let region = null;

    const relPath = ({ file }) => file.replace(`${process.cwd()}/`, '');

    const fileService = ({ file }) => {
        const relative = relPath({ file });
        const [head] = relative.split('/');

        return relative.includes('/') ? head : null;
    };

    const recordId = ({ id, key, source }) => {
        if (!ids.has(id)) {
            ids.set(id, { key: null, sources: [] });
        }

        const entry = ids.get(id);
        entry.sources.push(source);

        if (key) {
            entry.key = key;
        }
    };

    envs.forEach((env) => {
        const kenv = environments[env] || {};
        const dir = kenv.path ? join(process.cwd(), kenv.path) : null;

        if (!dir) {
            return;
        }

        walkFiles({ depth: 1, dir }).forEach((file) => {
            const text = readFileSync(file, 'utf8');

            // SecretProviderClasses: resourceName/path pairs.
            let rest = text;
            let match =
                /resourceName:\s*'projects\/[^/]+\/(?:locations\/([^/]+)\/)?secrets\/([^'/]+)\/versions\/latest'\s*\n\s*path:\s*'([^']+)'/.exec(
                    rest
                );

            while (match) {
                region = region || match[1];

                recordId({
                    id: match[2],
                    key: pathToKey({ path: match[3] }),
                    source: file,
                });

                consumerRefs.push({
                    consumerKey: pathToKey({ path: match[3] }),
                    file: relPath({ file }),
                    fileService: file
                        .split('/')
                        .pop()
                        .replace(/\.secretproviderclass\.yaml$/, ''),
                    id: match[2],
                });

                rest = rest.slice(match.index + match[0].length);
                match =
                    /resourceName:\s*'projects\/[^/]+\/(?:locations\/([^/]+)\/)?secrets\/([^'/]+)\/versions\/latest'\s*\n\s*path:\s*'([^']+)'/.exec(
                        rest
                    );
            }

            // Local secret templates: op:// references.
            if (/\.secret\.yaml\.tmpl$/.test(file)) {
                const service = file
                    .split('/')
                    .pop()
                    .replace(/\.secret\.yaml\.tmpl$/, '');

                let tmplRest = text;
                let ref =
                    /op:\/\/Team\/([a-z0-9]+)\/([a-z-]+)\/([A-Z0-9_]+)/.exec(
                        tmplRest
                    );

                while (ref) {
                    const [, item, , key] = ref;

                    if (!localRefs.has(service)) {
                        localRefs.set(service, { item, keys: [] });
                    }

                    if (!localRefs.get(service).keys.includes(key)) {
                        localRefs.get(service).keys.push(key);
                    }

                    tmplRest = tmplRest.slice(ref.index + ref[0].length);
                    ref =
                        /op:\/\/Team\/([a-z0-9]+)\/([a-z-]+)\/([A-Z0-9_]+)/.exec(
                            tmplRest
                        );
                }
            }
        });
    });

    // Deploy scripts and env.*.yaml references across the repo.
    walkFiles({ depth: 4, dir: process.cwd() }).forEach((file) => {
        const base = file.split('/').pop();

        const text = /\.json$/.test(base)
            ? safeReadJson({ file })
            : safeReadText({ file });

        if (!text) {
            return;
        }

        let rest = text;
        let match =
            /([A-Z0-9_]+)=projects\/[^'"\s,]+\/secrets\/([a-z0-9-]+)\/versions\/latest/.exec(
                rest
            );

        while (match) {
            recordId({ id: match[2], key: match[1], source: file });
            consumerRefs.push({
                consumerKey: match[1],
                file: relPath({ file }),
                fileService: fileService({ file }),
                id: match[2],
            });

            rest = rest.slice(match.index + match[0].length);
            match =
                /([A-Z0-9_]+)=projects\/[^'"\s,]+\/secrets\/([a-z0-9-]+)\/versions\/latest/.exec(
                    rest
                );
        }

        if (/^env\.[^.]+\.ya?ml$/.test(base)) {
            let yamlRest = text;
            let yaml =
                /^([A-Z0-9_]+):\s*projects\/[^'"\s,]+\/secrets\/([a-z0-9-]+)/m.exec(
                    yamlRest
                );

            while (yaml) {
                recordId({ id: yaml[2], key: null, source: file });
                consumerRefs.push({
                    consumerKey: yaml[1],
                    file: relPath({ file }),
                    fileService: fileService({ file }),
                    id: yaml[2],
                });

                yamlRest = yamlRest.slice(yaml.index + yaml[0].length);
                yaml =
                    /^([A-Z0-9_]+):\s*projects\/[^'"\s,]+\/secrets\/([a-z0-9-]+)/m.exec(
                        yamlRest
                    );
            }
        }
    });

    // Region fallback: the kubectl context carries the zone.
    if (!region) {
        const context = (environments[envs[0]] || {}).context || '';

        if (context.startsWith('gke_')) {
            const zone = context.split('_')[2] || '';
            region = zone.split('-').slice(0, 2).join('-');
        }
    }

    if (ids.size === 0 && localRefs.size === 0) {
        // Nothing to scan: a minimal, valid scaffold so `c secrets add`
        // works immediately.
        return {
            blockText: [
                '    secrets: {',
                '        services: {},',
                '    },',
                '',
            ].join('\n'),
            notes: minimalNotes({
                itemPrefix,
                opScan,
            }),
            region,
        };
    }

    localRefs.forEach((entry, service) => {
        nameHints[service] = entry.item;
    });

    // Aggregate owned keys per service; service-less keys to shared.
    const services = {};
    const shared = { examples: {}, keys: [], opItem: null };

    [...ids.keys()].sort().forEach((id) => {
        const entry = ids.get(id);
        const parsed = parseId({
            envs,
            id,
            repoPrefix,
            serviceNames: nameHints,
        });

        if (!parsed) {
            return;
        }

        const key = entry.key || pathToKey({ path: parsed.key });

        if (!parsed.service || parsed.ambiguous) {
            if (!shared.keys.includes(key)) {
                shared.keys.push(key);
            }

            if (!shared.examples[key]) {
                shared.examples[key] = id;
            }

            return;
        }

        if (!services[parsed.service]) {
            services[parsed.service] = { keys: [], sharedKeys: [] };
        }

        if (!services[parsed.service].keys.includes(key)) {
            services[parsed.service].keys.push(key);
        }
    });

    // Local template refs add keys + the opItem for their services.
    localRefs.forEach(({ item, keys }, service) => {
        if (!services[service]) {
            services[service] = { keys: [], sharedKeys: [] };
        }

        keys.forEach((key) => {
            if (!services[service].keys.includes(key)) {
                services[service].keys.push(key);
            }
        });

        services[service].opItem = item;
    });

    // c.js docker build args reference the dev item's consumer sections.
    const devConsumers = {};
    let devItemFromArgs = null;

    const locations = (config.docker && config.docker.locations) || {};

    Object.keys(locations).forEach((location) => {
        const buildArgs = locations[location].buildArgs || {};

        Object.keys(buildArgs).forEach((arg) => {
            const source = String(buildArgs[arg]);

            const ref =
                /op:\/\/Team\/([a-z0-9]+)\/([a-z-]+)\/([A-Z0-9_]+)/.exec(
                    source
                );

            if (!ref) {
                return;
            }

            const [, item, section, key] = ref;

            devItemFromArgs = item;

            if (!devConsumers[section]) {
                devConsumers[section] = [];
            }

            if (!devConsumers[section].includes(key)) {
                devConsumers[section].push(key);
            }
        });
    });

    // Render the block.
    const quote = (value) => `'${value}'`;
    const notes = [];

    const lines = [];
    lines.push('    secrets: {');

    if (devItemFromArgs) {
        lines.push('        dev: {');
        lines.push(`            opItem: ${quote(devItemFromArgs)},`);
        lines.push('            consumers: {');
        Object.keys(devConsumers)
            .sort()
            .forEach((section) => {
                lines.push(
                    `                ${quoteIfNeeded({ name: section })}: {`
                );
                lines.push('                    keys: [');
                devConsumers[section].sort().forEach((key) => {
                    lines.push(`                        ${quote(key)},`);
                });
                lines.push('                    ],');
                lines.push('                },');
            });
        lines.push('            },');
        lines.push('        },');
    } else {
        notes.push(
            'No dev consumers found in docker build args - add secrets.dev.consumers if build args need secrets.'
        );
    }

    // Value-verified legacy dedupe: a service-owned key that is also a
    // shared key is usually the same credential seen through old
    // (service-segmented) and new (service-less) ids. When the GSM values
    // hash-match in every checkable environment, the duplicate is dropped
    // from the service; on any conflict it is kept for review.
    const deduped = [];

    await Promise.all(
        Object.keys(services).map(async (serviceName) => {
            const duplicates = services[serviceName].keys.filter((owned) =>
                shared.keys.includes(owned)
            );

            await Promise.all(
                duplicates.map(async (key) => {
                    const kebab = key.toLowerCase().replace(/_/g, '-');
                    const legacyExample = `${repoPrefix}${envs[0]}-${serviceName}-${kebab}`;

                    const checks = await Promise.all(
                        envs.map(async (env) => {
                            const unifiedId = `${repoPrefix}${env}-${kebab}`;
                            const unified = await gsmDescribe({
                                id: unifiedId,
                                project,
                            })
                                .then((secret) =>
                                    secret
                                        ? gsmRead({ id: unifiedId, project })
                                        : null
                                )
                                .catch(() => null);

                            if (!unified) {
                                return null;
                            }

                            // The legacy id is derived, not discovered:
                            // the old service-segmented id may no longer be
                            // referenced by any file.
                            const legacyId = `${repoPrefix}${env}-${serviceName}-${kebab}`;

                            const legacy = await gsmDescribe({
                                id: legacyId,
                                project,
                            })
                                .then((secret) =>
                                    secret
                                        ? gsmRead({ id: legacyId, project })
                                        : null
                                )
                                .catch(() => null);

                            if (!legacy) {
                                return null;
                            }

                            return (
                                sha12({ value: unified }) ===
                                sha12({ value: legacy })
                            );
                        })
                    );

                    const checkable = checks.filter((check) => check !== null);

                    if (checkable.length > 0 && checkable.every(Boolean)) {
                        services[serviceName].keys = services[
                            serviceName
                        ].keys.filter((owned) => owned !== key);

                        deduped.push({
                            example: legacyExample,
                            key,
                            service: serviceName,
                        });
                    }
                })
            );
        })
    );

    // Value-verified shared.opItem: find the 1Password item actually
    // holding each shared key's value (hash-compare against the shared GSM
    // secrets) and bind when exactly one item matches. Never guess.
    let boundTo = null;
    let boundEnvs = [];

    if (shared.keys.length > 0) {
        const unified = {};

        await Promise.all(
            shared.keys.map(async (key) => {
                unified[key] = {};
                const kebab = key.toLowerCase().replace(/_/g, '-');

                await Promise.all(
                    envs.map(async (env) => {
                        const id = `${repoPrefix}${env}-${kebab}`;
                        const value = await gsmDescribe({ id, project })
                            .then((secret) =>
                                secret ? gsmRead({ id, project }) : null
                            )
                            .catch(() => null);

                        if (value) {
                            unified[key][env] = sha12({ value });
                        }
                    })
                );
            })
        );

        const candidates = {};

        Object.keys(services).forEach((serviceName) => {
            const item = services[serviceName].opItem || nameHints[serviceName];

            if (item) {
                candidates[item] = serviceName;
            }
        });

        const matches = Object.keys(candidates).filter((item) =>
            shared.keys.every((key) => {
                const envsToCheck = Object.keys(unified[key]);

                if (envsToCheck.length === 0) {
                    return false;
                }

                return envsToCheck.every((env) => {
                    try {
                        const value = opRead({
                            ref: `op://Team/${item}/${env}/${key}`,
                        });

                        return (
                            sha12({ value: Buffer.from(value, 'utf8') }) ===
                            unified[key][env]
                        );
                    } catch (e) {
                        return false;
                    }
                });
            })
        );

        if (matches.length === 1) {
            // Bind by reference: the literal id already appears on the
            // owning service's entry, and a reference keeps them in step.
            [shared.opItem] = [`services.${candidates[matches[0]]}`];
            boundTo = candidates[matches[0]];
            boundEnvs = [
                ...new Set(
                    shared.keys.flatMap((key) => Object.keys(unified[key]))
                ),
            ].sort();
        }
    }

    // Author sharedKeys: references to shared (service-less) ids attribute
    // to the consuming service as a borrower, with the key moved out of its
    // owned keys (a key can't be both owned and borrowed).
    const authored = [];
    const unhandled = [];

    consumerRefs.forEach(
        ({ consumerKey, file, fileService: consumerService, id }) => {
            const parsed = parseId({
                envs,
                id,
                repoPrefix,
                serviceNames: nameHints,
            });

            if (!parsed || parsed.service) {
                return;
            }

            const ownerKey =
                (ids.get(id) || {}).key || pathToKey({ path: parsed.key });

            if (!shared.keys.includes(ownerKey) || !consumerService) {
                return;
            }

            const service = services[consumerService];

            if (!service || consumerService === 'shared') {
                unhandled.push({ file, key: ownerKey });

                return;
            }

            if (consumerKey !== ownerKey) {
                // A renamed consumer key can't be expressed by sharedKeys -
                // leave it for manual authoring.
                unhandled.push({
                    file,
                    key: `${ownerKey} (as ${consumerKey})`,
                });

                return;
            }

            service.keys = service.keys.filter((owned) => owned !== ownerKey);

            // Bare sharedKeys require a unique owner - when another
            // service still owns the key (a legacy duplicate that could
            // not be verified away), emit the dotted form.
            const stillOwnedByAService = Object.values(services).some((svc) =>
                svc.keys.includes(ownerKey)
            );
            const ref = stillOwnedByAService ? `shared.${ownerKey}` : ownerKey;

            if (!service.sharedKeys.includes(ref)) {
                service.sharedKeys.push(ref);
            }

            if (
                !authored.some(
                    (entry) =>
                        entry.key === ownerKey &&
                        entry.service === consumerService
                )
            ) {
                authored.push({ key: ownerKey, service: consumerService });
            }
        }
    );

    lines.push('        services: {');

    const renderService = ({
        indent,
        keys,
        opItem,
        segmentless,
        serviceName,
        sharedKeys = [],
    }) => {
        lines.push(`${indent}${quoteIfNeeded({ name: serviceName })}: {`);

        if (segmentless) {
            lines.push(`${indent}    gsmSegment: false,`);
        }

        // opItem only when already known (1Password scan or local template
        // refs) - unbound services resolve lazily on first use.
        if (opItem) {
            lines.push(`${indent}    opItem: ${quote(opItem)},`);
        }

        if (keys.length === 0) {
            lines.push(`${indent}    keys: [],`);
        } else {
            lines.push(`${indent}    keys: [`);

            keys.sort().forEach((key) => {
                lines.push(`${indent}        ${quote(key)},`);
            });

            lines.push(`${indent}    ],`);
        }

        if (sharedKeys.length > 0) {
            lines.push(
                `${indent}    sharedKeys: [${sharedKeys
                    .sort()
                    .map((key) => quote(key))
                    .join(', ')}],`
            );
        }

        lines.push(`${indent}},`);
    };

    Object.keys(services)
        .sort()
        .forEach((service) => {
            renderService({
                indent: '            ',
                keys: services[service].keys,
                opItem: services[service].opItem || nameHints[service] || null,
                segmentless: false,
                serviceName: service,
                sharedKeys: services[service].sharedKeys,
            });
        });

    lines.push('        },');

    if (shared.keys.length > 0) {
        lines.push('        shared: {');

        if (shared.opItem) {
            lines.push(`            opItem: ${quote(shared.opItem)},`);
        }

        lines.push('            keys: [');

        shared.keys.sort().forEach((key) => {
            lines.push(`                ${quote(key)},`);
        });

        lines.push('            ],');
        lines.push('        },');

        const keyList = shared.keys.join(', ');
        const firstExample = shared.examples[shared.keys[0]];

        if (shared.opItem) {
            notes.push(
                `Drafted 'shared' for keys whose GSM ids carry no service name: ${keyList} (ids like ${firstExample}). shared.opItem is set to the '${boundTo}' 1Password item, which already holds the value (matched by comparing value hashes across ${boundEnvs.join(
                    ', '
                )}) - nothing needs to move in 1Password. Every service that uses ${keyList} lists it under sharedKeys - not keys.`
            );
        } else {
            notes.push(
                `Drafted 'shared' for keys whose GSM ids carry no service name: ${keyList} (ids like ${firstExample}). Set shared.opItem to the 1Password item that holds the value - it is never created automatically. Every service that uses ${keyList} lists it under sharedKeys - not keys.`
            );
        }

        deduped.forEach(({ example, key, service }) => {
            notes.push(
                `'${service}' listed ${key} because old secret ids still point at it (${example}). Those values are identical to the shared ones, so it was removed from '${service}'. The old secrets stay in Google Secret Manager until they're retired.`
            );
        });

        if (authored.length > 0) {
            const byKey = {};

            authored.forEach(({ key, service }) => {
                if (!byKey[key]) {
                    byKey[key] = [];
                }

                if (!byKey[key].includes(service)) {
                    byKey[key].push(service);
                }
            });

            notes.push(
                `Shared-key consumers drafted automatically (sharedKeys): ${Object.keys(
                    byKey
                )
                    .sort()
                    .map((key) => `${byKey[key].sort().join(', ')} -> ${key}`)
                    .join('; ')} - review them.`
            );
        }
    }

    // A service owning a key that 'shared' also owns is usually a legacy-id
    // artifact - flag it for review.
    Object.keys(services)
        .sort()
        .forEach((serviceName) => {
            services[serviceName].keys
                .filter((owned) => shared.keys.includes(owned))
                .sort()
                .forEach((owned) => {
                    const example = [...ids.keys()]
                        .map((id) => ({
                            id,
                            parsed: parseId({
                                envs,
                                id,
                                repoPrefix,
                                serviceNames: nameHints,
                            }),
                        }))
                        .find(
                            ({ parsed }) =>
                                parsed &&
                                parsed.service === serviceName &&
                                pathToKey({ path: parsed.key }) === owned
                        );

                    notes.push(
                        `'${serviceName}' owns '${owned}'${
                            example ? ` (from ids like ${example.id})` : ''
                        } but 'shared' also owns it - confirm the ownership (legacy ids often cause this).`
                    );
                });
        });

    if (unhandled.length > 0) {
        const byKey = {};

        unhandled.forEach(({ file, key }) => {
            if (!byKey[key]) {
                byKey[key] = [];
            }

            if (!byKey[key].includes(file)) {
                byKey[key].push(file);
            }
        });

        notes.push(
            `Consumers that couldn't be drafted automatically: ${Object.keys(
                byKey
            )
                .sort()
                .map((key) => `${key} -> ${byKey[key].sort().join(', ')}`)
                .join('; ')} - declare sharedKeys on those services manually.`
        );
    }

    lines.push('    },');
    lines.push('');

    notes.push(
        "The draft is a starting point: review each service's keys and opItems, then run `c secrets verify <env>`."
    );

    if (!opScan.names) {
        notes.push(
            `1Password scan skipped (${opScan.error}) - services without a file-derived opItem are left unbound; they resolve (or create) their 1Password item automatically on first use via \`c op set\` / \`c secrets add\`.`
        );
    } else if (Object.keys(opScan.names).length === 0) {
        notes.push(
            `1Password scan found no '${itemPrefix}' items - services without a file-derived opItem are left unbound; they resolve (or create) their 1Password item automatically on first use via \`c op set\` / \`c secrets add\`.`
        );
    }

    return {
        blockText: lines.join('\n'),
        notes,
        region,
    };
};

module.exports = { draftContract };
