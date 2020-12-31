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

const PopExe = '/home/app/node_modules/@newchromantics/popengine/ubuntu-latest/PopEngineTestApp';
const PopAppPath = '/home/app';

//	returns meta
async function StartRoomProcess()
{
	const Meta = {};
	Meta.Name = 'ABCD';

	//	
	const RoomProcess = spawn( PopExe, [
		PopAppPath,
		`RayDataFilename=${RayDataFilename}`,
		`ObjFilename=${SceneObjFilename}`,
		`ZipSaveLocation=${ZipSaveLocation}`,
		`TimeOfRun=${Date()}`,
		`ServerVersion=${pjson.version}`,
		`SeverDependencies=${pjson.dependencies}`,
		`NodeVersion=${process.versions.node}`
	] );
	Meta.Process = RoomProcess;
	Meta.Port = 10001;
	
	return Meta;
	/*
	log = "";
	let ZipFile = "";
	RoomProcess.stdout.on( "data", ( data ) =>
	{
		console.log( `stdout: ${data}` );
		log += data;
		let StringData = data.toString();

		if ( StringData.startsWith( "Zipname" ) )
		{
			var Regex = /\w+.zip/
			let RegexArray = Regex.exec( StringData );
			console.log( RegexArray[ 0 ] )
			ZipFile = RegexArray[ 0 ];
		}
	} );

	RoomProcess.stderr.on( 'data', ( data ) =>
	{
		console.log( `stderr: ${data}` );
		log += data;

		let StringData = data.toString();

		if ( StringData.startsWith( "Zipname" ) )
		{
			console.log(StringData)
			var Regex = /\w+.zip/
			let RegexArray = Regex.exec( StringData );
			console.log( RegexArray[ 0 ] )
			ZipFile = RegexArray[ 0 ];
		}
	} );

	RoomProcess.on( 'error', ( error ) =>
	{
		console.log( `error: ${error.message}` );
		log += error.message;

		ServerResponse(res, 'error')
	} );

	RoomProcess.on( "close", ( code ) =>
	{
		console.log("Finished")

		res.download( ZipSaveLocation, e =>
			{
				if(e)
				{
					console.log(e);
					ServerResponse(res, 'error')
				}
			})

	} );
	*/
	
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
var proxy = httpProxy.createProxyServer(options);

var server = http.createServer(function(req, res) 
{
	// You can define here your custom logic to handle the request
	// and then proxy the request.
	proxy.web(req, res, { target: 'http://127.0.0.1:5060' });
});

function OnUpgrade(req, socket, head)
{
	function Event(e)
	{
		console.log(e)
	}
	const FirstRoom = GetRoom('ABCD');
	const TargetUrl = `ws://localhost:${FirstRoom.Port}`;
	Pop.Debug(`request ${req} ${JSON.stringify(req)} TargetUrl=${TargetUrl}`);
	const NewProxyMeta = {target: TargetUrl, changeOrigin: true, ws: true}; 
	proxy.ws(req, socket, head, NewProxyMeta, Event );
}

server.on('upgrade', OnUpgrade );
