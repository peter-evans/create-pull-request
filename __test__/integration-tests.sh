#!/usr/bin/env bash
set -euo pipefail

IMAGE="cpr-integration-tests:latest"
ARG1=${1:-}

if [[ "$(docker images -q $IMAGE 2> /dev/null)" == "" || $ARG1 == "build" ]]; then
    echo "Building Docker image $IMAGE ..."

    cat > Dockerfile << EOF
FROM node:12-alpine
RUN apk --no-cache add git git-daemon
RUN npm install jest --global
WORKDIR /cpr
COPY __test__/entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
EOF

    docker build -t $IMAGE .
    rm Dockerfile
fi

docker run -v $PWD:/cpr $IMAGE
