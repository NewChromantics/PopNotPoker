PopNotPoker
==================
Async game engine.

Structure
--------------------
Lobby
------------
The lobby WILL be scalable, but not yet. This node server launches room processes, which open on whatever local port they want.
It opens a web server to serve static files.
It opens a proxy to forward websocket connections to the correct process['s port].
This means in future;
- Room process can move to another local instance (scalable horizontally), we just need the name & port of the process and can proxy to it
- Room processes could spawn anywhere and report to a middle database or single-instance to keep track (not scalable)
- Front end then just needs to serve files (scalable) and then redirect incoming websocket connections to the right internal address&port via proxy. (sniff room target from an upgrade header or something)

Room 
----------------
This is a javascript app running on popengine. (Could probably be ported to node or something else).
- Opens a listening port for clients
- Starts a game once enough players have joined. 
- Lets game iterate (async) and players join & leave. (Games can allow or reject new players)
- If game doesn't have enough players, the game is ended, and room loops around and creates a new game instance, which again waits for enough players.
- This way the "room" stays persistent with the same people until everyone has left and the process exits
- Room handles things like player name changes asynchronously to the game execution.

Game
------------------
This is just a javascript class which is executed with the async `RunGame()`, akin to a game loop.
All functionality is broken down to 
- Sending public state, public-data-per-player is filtered by the game, and sent out by the room. Private data (eg. locations of winning game pieces) is hidden. 
- Waiting for player action response
 - this is an async call so game loop waits for the reply from the client (via room), or an exception (player disconnected). 
 - The game handles the response. If it throws (ie. user submitted invalid move/params/cheated), it sends the action request back to the user with the error. The game loop doesn't get back until this response has been verified (or player disconnected)
- This action is sent to everyone so the client can show their action (+new state)
- Check winning state and return array of players who won (or tied)
The async nature means you can write all sorts of nested loops for game logic, send out multiple-action requests simultaneously and just process them when they've all been fulfilled.

Run/Deploy
====================

Docker
------------------
To run the docker image of the server all you need is

`docker run  docker.pkg.github.com/newchromantics/popnotpoker/server:docker`

Local docker
-------------------
- Setup `.npmrc` file to get github packages
 - rename `Example.npmrc` to `.npmrc`. 
 - change `YOUR_AUTH_TOKEN` for your (any) github personal access token
- `npm install`
- `docker build . -t popnotpoker -f ./Dockerfile`
- `docker run -p 8000:8000 popnotpoker`
- or `docker build . -t popnotpoker -f ./Dockerfile && docker run -p 8000:8000 popnotpoker`

Local Node
-----------------
- `node Lobby.js` (fix popengine local paths!)


Local Server Macos
----------------------
To make writing a game simpler, you can run a single room instance, which is debuggable in safari.

Run a room with a `PopEngine` executable and pass in `Server/` (or use cwd as `Server/`, normal PopEngine execution)
This will start a room (websocket server) ready for clients, and output the port to stdout.

To connect to it, we need a client, eg, a webpage. In theory you could just open the `Client.html` page but chrome will not serve various files over `file://` so you need to run a local webserver.
- `python -m SimpleHTTPServer 8000` in `/Client` folder, then browse to `http://localhost:8000/?Hostname=localhost&Port=$PortFromServer` which will connect.
- Even easier, pass in `HttpServer` to serve local files as an argument. This will auto-open the url with hostname & port
	- `HttpServer=/Volumes/Code/PopNotPoker/Client`
