#!/usr/bin/env node

'use strict';

const { exec } = require('shelljs');

// Use "" to stop the order of arguments being altered
exec(
    `/usr/local/bin/c sdp ssh "docker run --name section-bootstrap --rm --net=host -v /var/lib/minikube:/var/lib/minikube:ro sectionio/section-init"`
);
