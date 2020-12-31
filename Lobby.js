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


const MacPopExe = '/Volumes/Code/PopEngine/build/Debug_JavascriptCore/PopEngine.app/Contents/MacOS/PopEngine';
const MacRoomAppPath = './Server';

//	fallback to mac local test settings 
//	if paths not provided by env vars (expect these to be set in dockerfile)
const RoomAppPath = process.env.RoomAppPath || MacRoomAppPath;
const PopExe = process.env.PopExe || MacPopExe;


const { spawn } = require( "child_process" );


//	returns meta
async function StartRoomProcess()
{
	const Meta = {};
	Meta.Name = 'ABCD';

	//	
	const RoomProcess = spawn( PopExe, [
		RoomAppPath,
		`Port=1`
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
			Pop.Debug(JSON.stringify(PortMatch));
			const Port = parseInt(PortMatch[1]);
			Pop.Debug(`Detected listening port: ${Port}`);
			ListeningPortPromise.Resolve(Port);
		}		
	} );

	RoomProcess.stderr.on( 'data', ( data ) =>
	{
		console.log( `stderr: ${data}` );
	} );

	RoomProcess.on( 'error', ( error ) =>
	{
		console.log( `error: ${error.message}` );
		ListeningPortPromise.Reject(error.message);
	} );

	RoomProcess.on( "close", ( code ) =>
	{
		console.log("Finished")
		ListeningPortPromise.Reject('Process closed');
	} );
		
	//	wait for app to bootup and put out port number (or process fail)
	Meta.Port = await ListeningPortPromise;
	
	return Meta;
	
}


const RoomProcesses = {};	//	[Name]

async function StartFirstRoom()
{
	const FirstMeta = await StartRoomProcess();
	RoomProcesses[FirstMeta.Name] = FirstMeta;
	Pop.Debug(`Started new room ${FirstMeta.Name} at ${FirstMeta.Port}`);
}
StartFirstRoom().catch(Pop.Debug);


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
	target: 
	{
		host: 'localhost',
		port: 1234		
	}
}
const Proxy = httpProxy.createProxyServer(ProxyOptions);
//httpProxy.createServer(ProxyOptions).listen(8000);


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
		console.log(e)
	}
	const FirstRoom = GetRoom('ABCD');
	const TargetUrl = `ws://localhost:${FirstRoom.Port}`;
	Pop.Debug(`request ${req} ${JSON.stringify(req)} TargetUrl=${TargetUrl}`);
	const NewProxyMeta = {target: TargetUrl, changeOrigin: true, ws: true}; 
	Proxy.ws(req, socket, head, NewProxyMeta, Event );
}

const HttpServer = http.createServer(OnHttpRequest);
HttpServer.on('upgrade', OnUpgradeRequest );
HttpServer.listen(8000);


// ...and a simple http server to show us our request back.
const static = require('node-static');
const FileServer = new(static.Server)('./Client/');
function OnStaticRequest(req,res)
{
	FileServer.serve(req, res);
	/*
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('request successfully proxied!' + '\n' + JSON.stringify(req.headers, true, 2));
  res.end();
  */
}
http.createServer(OnStaticRequest).listen(9000);

