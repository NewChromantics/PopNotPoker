# This is the version needs to match what was used in the build in Github Workflows so the package versions match
FROM ubuntu:18.04

# To avoid "tzdata" asking for geographic area
ARG DEBIAN_FRONTEND=noninteractive

# tsdk: have to update gcc to avoid the error /usr/lib/x86_64-linux-gnu/libstdc++.so.6: version `GLIBCXX_3.4.26' not found
# is there an simpler way to do this?
RUN apt update -qq && \
    apt install -qq -y software-properties-common && \
    add-apt-repository -y ppa:ubuntu-toolchain-r/test && \
    apt install -qq -y npm libx264-dev libjavascriptcoregtk-4.0-dev gcc-10 g++-10

# Node/npm packages
COPY ./package.json /home/app/package.json 
WORKDIR /home/app/

RUN --mount=type=secret,id=npmrc,dst=/home/app/.npmrc \
    npm install

RUN chmod +x node_modules/@newchromantics/popengine/ubuntu-latest/PopEngineTestApp

COPY ./Server /home/app

CMD [ "node_modules/@newchromantics/popengine/ubuntu-latest/PopEngineTestApp", "./" ] 