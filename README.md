PopNotPoker
==================
Async game engine.


Docker
------------------
To run the docker image of the server all you need is

`docker run  docker.pkg.github.com/newchromantics/popnotpoker/server:docker`

Local
-------------------
- Setup `.npmrc` file to get github packages
 - rename `Example.npmrc` to `.npmrc`. 
 - change `YOUR_AUTH_TOKEN` for your (any) github personal access token
- `npm install`
- `docker build . -t popnotpoker -f ./Dockerfile`
- `docker run popnotpoker`
