# @ideariym/cli

This file is a history of the changes made to @idearium/cli.

## 1.0.0-alpha.5

Minor improvements.

### Improvements

- Updated `c dc env file` to work more like the original from `c.sh`. If you pass `reset` it will reset the `COMPOSE_FILE` entry to be `docker-compose.yml`. If you pass `show` and the `docker-compose.show.yml` file exists, it will set the `COMPOSE_FILE` entry to be `docker-compose.yml:docker-compose.show.yml`.

## 1.0.0-alpha.4

Bug fix release.

### Bugs

- Fixed an issue with `package.json`.

## 1.0.0-alpha.3

First published version of the cli.
