'use strict';

const { exec } = require('shelljs');

// Use "" to stop the order of arguments being altered
exec(
    `yarn c sdp ssh "docker run --name section-bootstrap --rm --net=host -v /var/lib/minikube:/var/lib/minikube:ro sectionio/section-init"`
);
