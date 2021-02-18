/*
	this is the lobby nodejs server.
	

	It has a few functions
	* Create new room
		- Spin up new process and associate a name and port with it
		
	* Redirect connecting websockets to the correct room
		- Create a proxy to the correct process' port
*/

const Pop = {};
Pop.Debug = console.log;
Pop.CreatePromise = function()
{
	let Callbacks = {};
	let PromiseHandler = function(Resolve,Reject)
	{
		Callbacks.Resolve = Resolve;
		Callbacks.Reject = Reject;
	}
	let Prom = new Promise(PromiseHandler);
	Prom.Resolve = Callbacks.Resolve;
	Prom.Reject = Callbacks.Reject;
	return Prom;
}
Pop.Yield = function(Milliseconds)
{
	const Promise = PopX.CreatePromise();
	setTimeout( Promise.Resolve, Milliseconds );
	return Promise;
}
Pop.PromiseQueue = class
{
	constructor(DebugName='UnnamedPromiseQueue',Warning)
	{
		this.Warning = Warning || function(){};
		this.Name = DebugName;
		//	pending promises
		this.Promises = [];
		//	values we've yet to resolve (each is array capturing arguments from push()
		this.PendingValues = [];
	}

	async WaitForNext()
	{
		const Promise = this.Allocate();
		
		//	if we have any pending data, flush now, this will return an already-resolved value
		this.FlushPending();
		
		return Promise;
	}

	//	this waits for next resolve, but when it flushes, it returns LAST entry and clears the rest; LIFO (kinda, last in, only out)
	async WaitForLatest()
	{
		const Promise = this.Allocate();

		//	if we have any pending data, flush now, this will return an already-resolved value
		this.FlushPending(true);

		return Promise;
	}
	
	ClearQueue()
	{
		//	delete values, losing data!
		this.PendingValues = [];
	}
	
	//	allocate a promise, maybe deprecate this for the API WaitForNext() that makes more sense for a caller
	Allocate()
	{
		//	create a promise function with the Resolve & Reject functions attached so we can call them
		function CreatePromise()
		{
			let Callbacks = {};
			let PromiseHandler = function (Resolve,Reject)
			{
				Callbacks.Resolve = Resolve;
				Callbacks.Reject = Reject;
			}
			let Prom = new Promise(PromiseHandler);
			Prom.Resolve = Callbacks.Resolve;
			Prom.Reject = Callbacks.Reject;
			return Prom;
		}
		
		const NewPromise = CreatePromise();
		this.Promises.push( NewPromise );
		return NewPromise;
	}
	
	//	put this value in the queue, if its not already there (todo; option to choose oldest or newest position)
	PushUnique(Value)
	{
		const Args = Array.from(arguments);
		function IsMatch(PendingValue)
		{
			//	all arguments are now .PendingValues=[] or .RejectionValues=[]
			//	we are only comparing PendingValues, lets allow rejections to pile up as
			//	PushUnique wont be rejections. The Reject() code should have a RejectUnique() if this becomes the case
			if (!PendingValue.hasOwnProperty('ResolveValues'))
				return false;

			const a = PendingValue.ResolveValues;
			const b = Args;
			if ( a.length != b.length )	return false;
			for ( let i=0;	i<a.length;	i++ )
				if ( a[i] != b[i] )
					return false;
			return true;
		}
		//	skip adding if existing match
		if ( this.PendingValues.some(IsMatch) )
		{
			//this.Warning(`Skipping non-unique ${Args}`);
			return;
		}
		this.Push(...Args);
	}
	
	Push()
	{
		const Args = Array.from(arguments);
		const Value = {};
		Value.ResolveValues = Args;
		this.PendingValues.push( Value );
		
		if ( this.PendingValues.length > 100 )
			this.Warning(`This (${this.Name}) promise queue has ${this.PendingValues.length} pending values and ${this.Promises.length} pending promises`,this);
		
		this.FlushPending();
	}
	
	GetQueueSize()
	{
		return this.PendingValues.length;
	}
	
	HasPending()
	{
		return this.PendingValues.length > 0;
	}
	
	FlushPending(FlushLatestAndClear=false)
	{
		//	if there are promises and data's waiting, we can flush next
		if ( this.Promises.length == 0 )
			return;
		if ( this.PendingValues.length == 0 )
			return;
		
		//	flush 0 (FIFO)
		//	we pre-pop as we want all listeners to get the same value
		if (FlushLatestAndClear && this.PendingValues.length > 1)
		{
			this.Warning(`Promise queue FlushLatest dropping ${this.PendingValues.length - 1} elements`);
		}
		const Value0 = FlushLatestAndClear ? this.PendingValues.splice(0,this.PendingValues.length).pop() : this.PendingValues.shift();
		const HandlePromise = function(Promise)
		{
			if ( Value0.RejectionValues )
				Promise.Reject( ...Value0.RejectionValues );
			else
				Promise.Resolve( ...Value0.ResolveValues );
		}
		
		//	pop array incase handling results in more promises, so we avoid infinite loop
		const Promises = this.Promises.splice(0);
		//	need to try/catch here otherwise some will be lost
		Promises.forEach( HandlePromise );
	}
	
	Resolve()
	{
		throw "PromiseQueue.Resolve() has been deprecated for Push() to enforce the pattern that we're handling a queue of values";
	}
	
	//	reject all the current promises
	Reject()
	{
		const Args = Array.from(arguments);
		const Value = {};
		Value.RejectionValues = Args;
		this.PendingValues.push(Value);
		this.FlushPending();
	}
}




//	urls should be /ABCD
const RoomUrlPattern = `^/([A-Z]{4})$`;
const RoomSpawnDelayMs = 2*1000;

const MacPopExe = '/Volumes/Code/PopEngine/build/Debug_JavascriptCore/PopEngine.app/Contents/MacOS/PopEngine';

//	fallback to mac local test settings 
//	if paths not provided by env vars (expect these to be set in dockerfile)
const RoomAppPath = process.env.RoomAppPath || './Server';
const ClientPath = process.env.RoomAppPath || './Client';
const PopExe = process.env.PopExe || MacPopExe;


const { spawn } = require( "child_process" );


//	returns meta
async function StartRoomProcess(RoomName)
{
	Pop.Debug(`StartRoomProcess(${RoomName})`);
	const Meta = {};
	Meta.Name = RoomName;

	//	
	const RoomProcess = spawn( PopExe, [
		RoomAppPath
	] );
	Meta.Process = RoomProcess;
	Meta.Port = false;
	
	const ListeningPortPattern = new RegExp('Listening on ([0-9]+)\n');
	const ListeningPortPromise = Pop.CreatePromise();
	
	RoomProcess.stdout.on( "data", ( data ) =>
	{
		//	convert to string
		data = `${data}`;
		const DataClean = data.replace('\n','\\n');
		console.log( `stdout: ${DataClean}` );
		const PortMatch = data.match(ListeningPortPattern);
		if ( PortMatch )
		{
			//Pop.Debug(JSON.stringify(PortMatch));
			const Port = parseInt(PortMatch[1]);
			Pop.Debug(`Detected listening port: ${Port}`);
			ListeningPortPromise.Resolve(Port);
		}		
	} );

	RoomProcess.stderr.on( 'data', ( data ) =>
	{
		data = `${data}`;
		const DataClean = data.replace('\n','\\n');
		console.log( `stderr: ${DataClean}` );
	} );

	RoomProcess.on( 'error', ( error ) =>
	{
		console.log( `error: ${error.message}` );
		ListeningPortPromise.Reject(error.message);
	} );

	RoomProcess.on( "close", ( code ) =>
	{
		console.log(`Room process finished ${code}`)
		ListeningPortPromise.Reject('Process closed');
	} );
		
	//	wait for app to bootup and put out port number (or process fail)
	Pop.Debug(`StartRoomProcess waiting for listening port...`);
	Meta.Port = await ListeningPortPromise;
	Pop.Debug(`StartRoomProcess done, listening on port ${Meta.Port}`);
	
	return Meta;
}


const RoomProcesses = {};	//	[Name]
//	to avoid DOS have a queue of start-room requests
//	and process them with a few secs delay. user won't notice, but stops any bots flooding
const RoomSpawnRequestQueue = new Pop.PromiseQueue('RoomSpawnRequestQueue',Pop.Debug);

function CreateRandomHash(Length=4)
{
	//	generate string of X characters
	const AnArray = new Array(Length);
	const Numbers = [...AnArray];
	//	pick random numbers from a-z (skipping 0-10)
	const RandNumbers = Numbers.map( x=>Math.floor(Math.random()*26) );
	const RandAZNumbers = RandNumbers.map(i=>i+10);
	//	turn into string with base36(10+26)
	const RandomString = RandAZNumbers.map(x=>x.toString(36)).join('').toUpperCase();
	//Pop.Debug(`RandomString=${RandomString}`);
	return RandomString;
}

function GetNewRoomName()
{
	const Tried = [];
	
	//	gr: do a proper hashtable system by generating 1 random, then increment until we find a free slot
	for ( let i=0;	i<100;	i++ )
	{
		const Fourcc = CreateRandomHash();
		
		//	already exists
		if ( RoomProcesses.hasOwnProperty(Fourcc) )
		{
			Tried.push(Fourcc);
			continue;
		}
		
		return Fourcc;
	}
	
	const CurrentRoomCount = Object.keys(RoomProcesses);
	throw `Failed to generate unused room name. Current room count=${CurrentRoomCount} Tried ${Tried};`; 
}

async function SpawnRoomThread()
{
	Pop.Debug(`Starting SpawnRoomThread`);
	while ( true )
	{
		const NextRequest = await RoomSpawnRequestQueue.WaitForNext();
		
		try
		{
			Pop.Debug(`Generating new room name`);
			const NewRoomName = GetNewRoomName();
			const RoomMeta = await StartRoomProcess(NewRoomName);
			//Pop.Debug(`New room; ${JSON.stringify(RoomMeta)}`);	//	<-- meta here is circular, dont stringify
			RoomProcesses[RoomMeta.Name] = RoomMeta;
			NextRequest.Resolve(RoomMeta.Name);
		}
		catch(e)
		{
			Pop.Debug(`Error spawning room; ${e}`);
			NextRequest.Reject(e);
		}
		
		await Pop.Yield(RoomSpawnDelayMs);
	}
}
//	if this fails, let node go down
SpawnRoomThread().catch( e=>Pop.Debug(`Spawn error ${e}`));

async function SpawnNewRoom()
{
	const UseThread = false;
	
	if ( UseThread )
	{
		//	pause for dos, but lots of requests will still overwhelm
		await Pop.Yield(RoomSpawnDelayMs);
		const Request = Pop.CreatePromise();
		Pop.Debug(`pushing request`);
		RoomSpawnRequestQueue.Push(Request);
		Pop.Debug(`await request`);
		const NewRoomName = await Request;
		Pop.Debug(`done request`);
		return NewRoomName;
	}
	else
	{	
		const NewRoomName = GetNewRoomName();
		const RoomMeta = await StartRoomProcess(NewRoomName);
		//Pop.Debug(`New room; ${JSON.stringify(RoomMeta)}`);	//	<-- meta here is circular, dont stringify
		RoomProcesses[RoomMeta.Name] = RoomMeta;
		return RoomMeta.Name;
	}
}

function GetRoom(Name)
{
	if ( !RoomProcesses.hasOwnProperty(Name) )
		throw `No room named ${Name}`;
	return RoomProcesses[Name];
}





var httpProxy = require('http-proxy');
var http = require('http');

// Create a basic proxy server in one line of code...
// This listens on port 8000 for incoming HTTP requests 
// and proxies them to port 9000
const ProxyOptions = 
{
	//	gr: this shouldn't ever be requested
	target: 
	{
		host: 'localhost',
		port: 1234		
	}
}

function OnProxyWebsocketRequest(proxyReq, req, socket, options, head) 
{
	//	on sloppy.io, this json.stringify causes TypeError: Converting circular structure to JSON
	//	had this before with http proxy... doesn't happen locally with node, only inside docker.
	//console.log(`OnProxyWebsocketRequest; ${JSON.stringify(proxyReq,null,'\t')}`);
	proxyReq.setHeader('Sec-WebSocket-Extensions','');
	//proxyReq.setHeader('X-Special-Proxy-Header', 'foobar');
};

const Proxy = httpProxy.createProxyServer(ProxyOptions);
//httpProxy.createServer(ProxyOptions).listen(8000);
Proxy.on('proxyReqWs',OnProxyWebsocketRequest);

function OnHttpRequest(Request,Result)
{
	//	gr: don't really need this
	const TargetUrl = 'http://localhost:9000';
	Proxy.web(Request, Result, { target: TargetUrl });	
}


function OnUpgradeRequest(req, socket, head)
{
	function Event(e)
	{
		console.log(`websocket Event ${e}`);
	}
	
	try
	{
		//	expect user to try and connect to websocket/ROOM
		const RoomMatch = req.url.match(RoomUrlPattern);
		if ( !RoomMatch )
			throw `Request has no matching room url ${req.url}`;
		
		const RoomName = RoomMatch[1];
		//Pop.Debug(`RoomMatch = ${JSON.stringify(RoomMatch)}`);
		const FirstRoom = GetRoom(RoomName);
		
		if ( !FirstRoom )
			throw `No such room ${RoomName}`;
		if ( !FirstRoom.Port )
			throw `Room has not finished booting (no port)`;
		
		const TargetUrl = `ws://localhost:${FirstRoom.Port}`;
		//Pop.Debug(`request ${req.url} -> ${JSON.stringify(req)} TargetUrl=${TargetUrl}`);
		//	gr: don't know if we need change origin, don't seem to locally
		//const NewProxyMeta = {target: TargetUrl, changeOrigin: true, ws: true}; 
		const NewProxyMeta = {target: TargetUrl, ws: true}; 
		Proxy.ws(req, socket, head, NewProxyMeta, Event );
	}
	catch(e)
	{
		Pop.Debug(`HTTP->Websocket upgrade rejected; ${e}`);
		//	gr: no response object, so have to write directly to socket
		let Response = `HTTP/1.1 500\r\n`;
		Response += `\r\n`;
		Response += `Error: ${e}`;
		socket.write(Response);
		//socket.close();
		socket.destroy();
	}
}

const HttpServer = http.createServer(OnHttpRequest);
HttpServer.on('upgrade', OnUpgradeRequest );
HttpServer.listen(8000);

async (req, res) => {
  const data = await someAsyncFunc();
  console.log(req.url);
  console.log(data);
  res.end(JSON.stringify(data));
}


// ...and a simple http server to show us our request back.
const static = require('node-static');
const FileServer = new(static.Server)(ClientPath);

async function OnHttpRequestStatic(req,res)
{
	FileServer.serve(req, res);
}

async function OnHttpRequestNewRoom(req,res)
{
/*
	res.writeHead(200, { 'Content-Type': 'text/plain' });
	res.write('request successfully proxied!' + '\n' + JSON.stringify(req.headers, true, 2));
	res.end();
*/
	Pop.Debug(`Requested new room...`);
	const Result = {};
	try
	{
		const NewRoomName = await SpawnNewRoom();
		Pop.Debug(`Got new room [${NewRoomName}]`);
		Result.RoomName = NewRoomName;
		const StringifyTest = JSON.stringify(Result,null,'\t');
	}
	catch(e)
	{
		Pop.Debug(`Error making new room: ${e}`);
		//	try and show errors to user
		Result.Error = `${e}`;
	}
	
	const ResultJson = JSON.stringify(Result,null,'\t');
	res.statusCode = 200;
	res.setHeader('Content-Type','text/json');
	res.end(ResultJson);
}

async function OnHttpRequest(req,res)
{
	try
	{
		if ( req.url == '/NewRoom' )
		{
			return await OnHttpRequestNewRoom(req,res);
		}
		else
		{
			return await OnHttpRequestStatic(req,res);
		}
	}
	catch(e)
	{
		Pop.Debug(`OnHttpRequest Error ${e}`);
		//	send back error
		res.statusCode = 500;
		res.setHeader('Content-Type','text/plain');
		res.end(`Error ${e}`);
	}
}


http.createServer(
async function (req, res) 
{
	Pop.Debug(`async request`);
	await OnHttpRequest(req,res);
}
).listen(9000);

