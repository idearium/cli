'use strict';

const VAULT = 'Team';

const SERVICE_PROPERTIES = ['keys', 'opItem', 'sharedKeys'];
const CONSUMER_PROPERTIES = ['keys', 'sharedKeys'];

const isPlainObject = ({ value }) =>
    Object.prototype.toString.call(value) === '[object Object]';

const isNonEmptyString = ({ value }) =>
    typeof value === 'string' && value.length > 0;

const assertPlainObject = ({ message, value }) => {
    if (!isPlainObject({ value })) {
        throw new Error(message);
    }

    return value;
};

/**
 * Lowercase a key and convert underscores to hyphens, matching the GSM
 * secret id and SecretProviderClass path conventions.
 * @param {Object} options
 * @param {String} options.key The environment-variable style key.
 * @returns {String} The key, lowercase and hyphenated.
 */
const kebabCase = ({ key }) => key.toLowerCase().replace(/_/g, '-');

/**
 * Assert an object declares no properties outside an allowed list. Catches
 * typos like `key` instead of `keys` at load time.
 * @param {Object} options
 * @param {Array} options.allowed The allowed property names.
 * @param {String} options.message The error prefix naming what is checked.
 * @param {Object} options.object The object to check.
 * @returns {Void}
 */
const assertKnownProperties = ({ allowed, message, object }) => {
    Object.keys(object).forEach((property) => {
        if (!allowed.includes(property)) {
            throw new Error(
                `${message}: unknown property '${property}' (allowed: ${allowed
                    .map((p) => `'${p}'`)
                    .join(', ')})`
            );
        }
    });
};

/**
 * Validate an array of key names.
 * @param {Object} options
 * @param {Boolean} options.allowDotted Whether dotted 'owner.KEY' entries
 * are valid.
 * @param {String} options.message The error prefix naming what is checked.
 * @param {Array} options.value The value to validate.
 * @returns {Array} The validated array of key names.
 */
const assertKeyArray = ({ allowDotted, message, value }) => {
    if (!value) {
        return [];
    }

    if (!Array.isArray(value)) {
        throw new Error(`${message}: must be an array`);
    }

    value.forEach((entry) => {
        if (!isNonEmptyString({ value: entry })) {
            throw new Error(`${message}: entries must be non-empty strings`);
        }

        if (entry.includes('/') || entry.includes(' ')) {
            throw new Error(`${message}: entries must not contain '/' or ' '`);
        }

        if (entry.includes('.') && !allowDotted) {
            throw new Error(`${message}: dotted entries are not valid here`);
        }
    });

    if (new Set(value).size !== value.length) {
        throw new Error(`${message}: duplicate entries`);
    }

    return [...value];
};

/**
 * Validate the shape of a service or consumer entry (same shape: owned
 * keys, borrowed sharedKeys). Consumers have no GSM presence and no opItem
 * of their own - their owned keys live in the dev item.
 * @param {Object} options
 * @param {Object} options.entry The raw service/consumer configuration.
 * @param {Boolean} options.hasGsm Whether the entry has a GSM presence.
 * @param {String} options.name The service/consumer name.
 * @returns {Object} The shape-validated entry.
 */
const validateEntry = ({ entry, hasGsm, name }) => {
    assertPlainObject({
        message: `secrets entry '${name}' must be an object`,
        value: entry,
    });

    assertKnownProperties({
        allowed: hasGsm ? SERVICE_PROPERTIES : CONSUMER_PROPERTIES,
        message: `secrets.${name}`,
        object: entry,
    });

    const keys = assertKeyArray({
        message: `secrets.${name}.keys`,
        value: entry.keys,
    });

    // opItem is optional: an unbound service resolves (or creates) its
    // 1Password item lazily on first use.
    const validated = {
        keys,
        name,
        sharedKeys: assertKeyArray({
            allowDotted: true,
            message: `secrets.${name}.sharedKeys`,
            value: entry.sharedKeys,
        }),
    };

    if (hasGsm) {
        // Internal only: services derive service-segmented GSM ids; the
        // shared entry is the only segment-less owner.
        validated.gsmSegment = true;

        if (isNonEmptyString({ value: entry.opItem })) {
            validated.opItem = entry.opItem;
        }
    }

    return validated;
};

/**
 * Validate the secrets.shared block (a sibling of services, not a service):
 * keys whose GSM ids carry no service segment, stored in a 1Password item
 * of the author's choosing (shared.opItem).
 * @param {Object} options
 * @param {Object} options.rawShared The raw secrets.shared configuration.
 * @returns {Object} The normalised shared entry.
 */
const validateShared = ({ rawShared }) => {
    assertPlainObject({
        message: "'secrets.shared' must be an object",
        value: rawShared,
    });

    assertKnownProperties({
        allowed: ['keys', 'opItem'],
        message: 'secrets.shared',
        object: rawShared,
    });

    const shared = {
        gsmSegment: false,
        keys: assertKeyArray({
            message: 'secrets.shared.keys',
            value: rawShared.keys,
        }),
        name: 'shared',
        sharedKeys: [],
    };

    if (isNonEmptyString({ value: rawShared.opItem })) {
        shared.opItem = rawShared.opItem;
    }

    return shared;
};

/**
 * Resolve a sharedKeys entry to its owning service and key name. A bare
 * name must resolve to exactly one owning service; a dotted 'owner.KEY'
 * names the owner explicitly for keys owned by more than one service.
 * @param {Object} options
 * @param {String} options.consumerName The name of the borrowing
 * service/consumer, for error messages.
 * @param {String} options.entry The sharedKeys entry (bare or dotted).
 * @param {Object} options.services The normalised services map.
 * @returns {Object} The owning service and the key name.
 */
const resolveSharedKeyEntry = ({ consumerName, entry, services }) => {
    if (entry.includes('.')) {
        const [dottedOwner, dottedKey] = entry.split('.');
        const owner = services[dottedOwner];

        if (!owner) {
            throw new Error(
                `sharedKeys entry '${entry}' of '${consumerName}': service '${dottedOwner}' does not exist`
            );
        }

        if (!owner.keys.includes(dottedKey)) {
            throw new Error(
                `sharedKeys entry '${entry}' of '${consumerName}': service '${dottedOwner}' does not own '${dottedKey}'`
            );
        }

        return { key: dottedKey, owner };
    }

    const owners = Object.values(services).filter((service) =>
        service.keys.includes(entry)
    );

    if (owners.length === 0) {
        throw new Error(
            `sharedKeys entry '${entry}' of '${consumerName}': no service owns it`
        );
    }

    if (owners.length > 1) {
        throw new Error(
            `sharedKeys entry '${entry}' of '${consumerName}': ambiguous (owned by ${owners
                .map((owner) => owner.name)
                .join(', ')}) - use the dotted 'owner.KEY' form`
        );
    }

    return { key: entry, owner: owners[0] };
};

/**
 * Resolve the sharedKeys of an entry now that the full services map is
 * known: each entry gains its owner, self-borrows and double-declarations
 * are rejected.
 * @param {Object} options
 * @param {Object} options.entry The shape-validated service/consumer entry.
 * @param {Object} options.services The normalised services map.
 * @returns {Void}
 */
const resolveSharedKeys = ({ entry, services }) => {
    entry.sharedKeys = entry.sharedKeys.map((shared) =>
        resolveSharedKeyEntry({
            consumerName: entry.name,
            entry: shared,
            services,
        })
    );

    entry.sharedKeys.forEach(({ key, owner }) => {
        if (owner.name === entry.name) {
            throw new Error(
                `secrets.${entry.name}.sharedKeys: '${key}' is already owned by '${entry.name}'`
            );
        }

        if (entry.keys.includes(key)) {
            throw new Error(
                `secrets.${entry.name}: '${key}' is both owned and borrowed`
            );
        }
    });
};

const OP_ITEM_REFERENCE = /^(services\.[a-z0-9-]+|dev)$/;

const isOpItemReference = ({ value }) =>
    typeof value === 'string' && OP_ITEM_REFERENCE.test(value);

/**
 * Resolve opItem references to literal 1Password item ids: a value of
 * 'services.<name>' or 'dev' points at another entry's opItem, so every
 * item id appears exactly once in the contract. One hop only - a reference
 * must point at an entry holding a literal id.
 * @param {Object} options
 * @param {Object|null} options.dev The normalised dev block.
 * @param {Object} options.services The normalised services map.
 * @param {Object|null} options.shared The normalised shared block.
 * @returns {Void}
 */
const resolveOpItemReferences = ({ dev, services, shared }) => {
    const entries = Object.values(services).concat(shared || []);

    if (dev) {
        entries.push(dev);
    }

    entries.forEach((entry) => {
        if (!isOpItemReference({ value: entry.opItem })) {
            return;
        }

        const reference = entry.opItem;
        const target =
            reference === 'dev'
                ? dev
                : services[reference.slice('services.'.length)];

        if (!target) {
            throw new Error(
                `opItem reference '${reference}' of '${entry.name}' does not exist`
            );
        }

        if (target === entry) {
            throw new Error(
                `opItem reference '${reference}' of '${entry.name}' points at itself`
            );
        }

        if (!target.opItem || isOpItemReference({ value: target.opItem })) {
            throw new Error(
                `opItem reference '${reference}' of '${entry.name}' cannot resolve: '${target.name}' has no literal opItem`
            );
        }

        entry.opItem = target.opItem;
    });
};

/**
 * Load and validate the secrets contract from a c.js configuration object.
 * Returns null when no contract is present, so callers can fall back to
 * legacy file behaviour.
 * @param {Object} options
 * @param {Object} options.config The full c.js configuration.
 * @returns {Object|null} The normalised contract.
 */
const getSecretsContract = ({ config = {} }) => {
    if (!config.secrets) {
        return null;
    }

    assertPlainObject({
        message: "'secrets' must be an object",
        value: config.secrets,
    });

    assertKnownProperties({
        allowed: ['dev', 'services', 'shared'],
        message: 'secrets',
        object: config.secrets,
    });

    const project = assertPlainObject({
        message: "'project' configuration is required by the secrets contract",
        value: config.project,
    });

    ['gcpProjectId', 'name', 'organisation'].forEach((property) => {
        if (!isNonEmptyString({ value: project[property] })) {
            throw new Error(
                `'project.${property}' is required by the secrets contract`
            );
        }
    });

    const gcloud = assertPlainObject({
        message: "'gcloud' configuration is required by the secrets contract",
        value: config.gcloud,
    });

    if (!isNonEmptyString({ value: gcloud.region })) {
        throw new Error("'gcloud.region' is required by the secrets contract");
    }

    const rawServices = assertPlainObject({
        message: "'secrets.services' must be an object",
        value: config.secrets.services,
    });

    const shared = config.secrets.shared
        ? validateShared({ rawShared: config.secrets.shared })
        : null;

    // Shape-validate every service first, so bare sharedKeys entries can
    // find owners declared later in the map. Owners live in services or in
    // the shared block.
    const services = {};
    const owners = {};

    if (shared) {
        owners.shared = shared;
    }

    Object.keys(rawServices).forEach((name) => {
        services[name] = validateEntry({
            entry: rawServices[name],
            hasGsm: true,
            name,
        });
        owners[name] = services[name];
    });

    // A service may not call itself 'shared'.
    if (services.shared) {
        throw new Error(
            "'shared' is reserved for the secrets.shared block - remove it from secrets.services"
        );
    }

    Object.values(services).forEach((service) => {
        resolveSharedKeys({ services: owners, entry: service });
    });

    let dev = null;

    if (config.secrets.dev) {
        assertPlainObject({
            message: "'secrets.dev' must be an object",
            value: config.secrets.dev,
        });

        assertKnownProperties({
            allowed: ['consumers', 'opItem'],
            message: 'secrets.dev',
            object: config.secrets.dev,
        });

        if (!isNonEmptyString({ value: config.secrets.dev.opItem })) {
            throw new Error("secrets.dev: 'opItem' must be a non-empty string");
        }

        const rawConsumers = assertPlainObject({
            message: "'secrets.dev.consumers' must be an object",
            value: config.secrets.dev.consumers,
        });

        const consumers = {};
        Object.keys(rawConsumers).forEach((name) => {
            consumers[name] = validateEntry({
                entry: rawConsumers[name],
                hasGsm: false,
                name,
            });
        });
        Object.values(consumers).forEach((consumer) => {
            resolveSharedKeys({ services: owners, entry: consumer });
        });

        dev = { consumers, name: 'dev', opItem: config.secrets.dev.opItem };
    }

    resolveOpItemReferences({ dev, services, shared });

    return {
        dev,
        name: project.name,
        organisation: project.organisation,
        project: project.gcpProjectId,
        region: gcloud.region,
        services,
        shared,
        vault: VAULT,
    };
};

/**
 * Derive the GSM secret id for an owned key of a service.
 * @param {Object} options
 * @param {Object} options.contract The normalised contract.
 * @param {String} options.env The environment (local, beta, production...).
 * @param {String} options.key The environment-variable style key.
 * @param {Object} options.owner The owning service.
 * @returns {String} The GSM secret id.
 */
const gsmId = ({ contract, env, key, owner }) =>
    owner.gsmSegment === false
        ? `${contract.organisation}-${contract.name}-${env}-${kebabCase({
              key,
          })}`
        : `${contract.organisation}-${contract.name}-${env}-${
              owner.name
          }-${kebabCase({ key })}`;

/**
 * Derive the global-format resource name for a GSM secret id.
 * @param {Object} options
 * @param {Object} options.contract The normalised contract.
 * @param {String} options.id The GSM secret id.
 * @returns {String} The resource name.
 */
const gsmResourceName = ({ contract, id }) =>
    `projects/${contract.project}/secrets/${id}/versions/latest`;

/**
 * Derive a 1Password reference.
 * @param {Object} options
 * @param {Object} options.contract The normalised contract.
 * @param {String} options.env The environment section.
 * @param {String} options.key The field label.
 * @param {String} options.opItem The 1Password item id.
 * @returns {String} The op:// reference.
 */
const opRef = ({ contract, env, key, opItem }) =>
    `op://${contract.vault}/${opItem}/${env}/${key}`;

/**
 * Resolve one key of one service to its full identity: owning service (for
 * borrowed keys), GSM id, resource name, SecretProviderClass path and
 * 1Password reference.
 * @param {Object} options
 * @param {Object} options.contract The normalised contract.
 * @param {String} options.env The environment.
 * @param {String} options.key The key to resolve.
 * @param {Object} options.service The consuming service.
 * @returns {Object} The resolved key identity.
 */
const resolveServiceKey = ({ contract, env, key, service }) => {
    const borrowed = service.sharedKeys.find((shared) => shared.key === key);
    const owned = service.keys.includes(key);

    if (!owned && !borrowed) {
        throw new Error(
            `'${key}' is neither owned nor borrowed by service '${service.name}'`
        );
    }

    const owner = owned ? service : borrowed.owner;
    const id = gsmId({ contract, env, key, owner });

    return {
        gsmId: id,
        key,
        opItem: owner.opItem || null,
        opRef: owner.opItem
            ? opRef({ contract, env, key, opItem: owner.opItem })
            : null,
        owner,
        path: kebabCase({ key }),
        resourceName: gsmResourceName({ contract, id }),
    };
};

/**
 * Resolve one key of one dev consumer. Dev consumers answer only to env
 * local and have no GSM presence: owned keys resolve into the dev item's
 * consumer section, borrowed keys into the owning service's local section.
 * @param {Object} options
 * @param {Object} options.consumer The dev consumer.
 * @param {Object} options.contract The normalised contract.
 * @param {String} options.key The key to resolve.
 * @returns {Object} The resolved key identity.
 */
const resolveConsumerKey = ({ consumer, contract, key }) => {
    const borrowed = consumer.sharedKeys.find((shared) => shared.key === key);

    if (consumer.keys.includes(key)) {
        return {
            key,
            opItem: contract.dev.opItem,
            opRef: opRef({
                contract,
                env: consumer.name,
                key,
                opItem: contract.dev.opItem,
            }),
            owner: null,
        };
    }

    if (!borrowed) {
        throw new Error(
            `'${key}' is neither owned nor borrowed by consumer '${consumer.name}'`
        );
    }

    return {
        key,
        opItem: borrowed.owner.opItem || null,
        opRef: borrowed.owner.opItem
            ? opRef({
                  contract,
                  env: 'local',
                  key,
                  opItem: borrowed.owner.opItem,
              })
            : null,
        owner: borrowed.owner,
    };
};

/**
 * Resolve every key of a service for an environment (owned and borrowed,
 * sorted alphabetically) - the complete key list for manifest generation,
 * ls and verify.
 * @param {Object} options
 * @param {Object} options.contract The normalised contract.
 * @param {String} options.env The environment.
 * @param {Object} options.service The service.
 * @returns {Array} Resolved key identities, sorted by key.
 */
const serviceKeys = ({ contract, env, service }) =>
    service.keys
        .concat(service.sharedKeys.map((shared) => shared.key))
        .sort()
        .map((key) => resolveServiceKey({ contract, env, key, service }));

/**
 * Look up a service by name, with a helpful error.
 * @param {Object} options
 * @param {Object} options.contract The normalised contract.
 * @param {String} options.name The service name.
 * @returns {Object} The service.
 */
const getService = ({ contract, name }) => {
    const service = contract.services[name];

    if (!service) {
        throw new Error(
            `No service '${name}' in the secrets contract (services: ${Object.keys(
                contract.services
            )
                .sort()
                .join(', ')})`
        );
    }

    return service;
};

/**
 * Look up a dev consumer by name, with a helpful error.
 * @param {Object} options
 * @param {Object} options.contract The normalised contract.
 * @param {String} options.name The consumer name.
 * @returns {Object} The consumer.
 */
const getConsumer = ({ contract, name }) => {
    if (!contract.dev) {
        throw new Error('The secrets contract has no dev consumers');
    }

    const consumer = contract.dev.consumers[name];

    if (!consumer) {
        throw new Error(
            `No dev consumer '${name}' in the secrets contract (consumers: ${Object.keys(
                contract.dev.consumers
            )
                .sort()
                .join(', ')})`
        );
    }

    return consumer;
};

/**
 * Resolve a <service> <env> identity against the contract: a contract
 * service (any env) or a dev consumer (local only, no GSM presence).
 * @param {Object} options
 * @param {Object} options.contract The normalised contract.
 * @param {String} options.env The environment.
 * @param {String} options.name The service or consumer name.
 * @returns {Object} The identity: { kind, service } or { kind, consumer }.
 */
const resolveIdentity = ({ contract, env, name }) => {
    const service = contract.services[name];

    if (service) {
        return { kind: 'service', service };
    }

    // The shared block behaves like a service for identity resolution (it
    // owns GSM secrets), except its 1Password item is never auto-created.
    if (name === 'shared' && contract.shared) {
        return { kind: 'service', service: contract.shared };
    }

    const consumer = contract.dev && contract.dev.consumers[name];

    if (consumer) {
        if (env !== 'local') {
            throw new Error(
                `Dev consumers answer only to env local ('${name}' was given env '${env}')`
            );
        }

        return { consumer, kind: 'consumer' };
    }

    throw new Error(
        `No service or dev consumer '${name}' in the secrets contract (services: ${Object.keys(
            contract.services
        )
            .sort()
            .join(', ')}${
            contract.dev
                ? `; consumers: ${Object.keys(contract.dev.consumers)
                      .sort()
                      .join(', ')}`
                : ''
        })`
    );
};

/**
 * Validate a positional env argument against the environments the project
 * declares in its Kubernetes configuration (when it declares any).
 * @param {Object} options
 * @param {Object} options.config The full c.js configuration.
 * @param {String} options.env The environment.
 * @returns {Void}
 */
const assertKnownEnv = ({ config, env }) => {
    const environments =
        config.kubernetes && config.kubernetes.environments
            ? Object.keys(config.kubernetes.environments)
            : [];

    if (environments.length > 0 && !environments.includes(env)) {
        throw new Error(
            `Unknown env '${env}' (known: ${environments.sort().join(', ')})`
        );
    }
};

module.exports = {
    assertKnownEnv,
    getConsumer,
    getSecretsContract,
    getService,
    gsmId,
    gsmResourceName,
    kebabCase,
    opRef,
    resolveConsumerKey,
    resolveIdentity,
    resolveServiceKey,
    serviceKeys,
};
