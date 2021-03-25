

//	we need a server for each peer
//	and a client to connect to each peer's server
let EnableWebRtc = true;
let PeerServers = {};	//	[peerhash]
let PeerClients = {};	//	[peerhash]

//	gr: maybe need channel here
function OnMessage(Packet,FromPeerHash,FromSocket)
{
	OnChatString( Packet.Data );
	Pop.Debug(`Got packet ${Packet.Data} from ${FromPeerHash}/${FromSocket}`);
}

function CreatePeerServer(PeerHash)
{
	if ( !EnableWebRtc )
		return;
	async function Thread(Socket)
	{
		Pop.Debug(`${PeerHash} server waiting to connect`);
		await Socket.WaitForConnect();
		Pop.Debug(`${PeerHash} server Connected`);
		while ( true )
		{
			const Packet = await Socket.WaitForMessage();
			OnMessage( Packet, PeerHash, 'Server' );
		}
	}
	const Socket = new Pop.WebRtc.Server();
	PeerServers[PeerHash] = Socket;
	Thread(Socket);//.then().catch(Pop.Error);
}

function CreatePeerClient(PeerHash,ServerAddress)
{
	if ( !EnableWebRtc )
		return;
	async function Thread(Socket)
	{
		Pop.Debug(`${PeerHash} client waiting to connect`);
		await Socket.WaitForConnect();
		Pop.Debug(`${PeerHash} client Connected`);
		while ( true )
		{
			const Packet = await Socket.WaitForMessage();
			OnMessage( Packet, PeerHash, 'Client' );
		}
	}
	const Socket = new Pop.WebRtc.Client(ServerAddress);
	PeerClients[PeerHash] = Socket;
	Thread(Socket);//.then().catch(Pop.Error);
}

//	update OUR server for the peer to connect to
function UpdatePeerServer(LocalPeerHash,PeerHash,Meta)
{
	//	make sure we have a server for this peer
	if ( !PeerServers.hasOwnProperty(PeerHash) )
	{
		Pop.Debug(`Making server for peer ${PeerHash}`);
		CreatePeerServer(PeerHash);
	}
	
	//	our server for the peer to connect to
	const PeerServer = PeerServers[PeerHash];
	if ( !PeerServer )
	{
		Pop.Debug(`We have no server for ${PeerHash}`);
		return;
	}
	
	//	if this peer has a client address for our server, use it
	const PeerClientAddress = (Meta.WebRtc && Meta.WebRtc.ClientAddress) ? Meta.WebRtc.ClientAddress[LocalPeerHash] : null;
	if ( PeerClientAddress )
	{
		Pop.Debug(`Adding client address of ${PeerHash} to our server`);
		PeerServer.AddClient( PeerClientAddress );
	}
}


//	update OUR client connecting to the peer's server
function UpdatePeerClient(LocalPeerHash,PeerHash,Meta)
{
	//	does peer have a server address for us to connect to?
	const PeerServerAddress = (Meta.WebRtc && Meta.WebRtc.ServerAddress) ? Meta.WebRtc.ServerAddress[LocalPeerHash] : null;
	if ( !PeerServerAddress )
	{
		Pop.Debug(`Peer ${PeerHash} has no server address for us (${LocalPeerHash})`);
		return;
	}
	
	if ( !PeerServerAddress.OfferDescription )
	{
		Pop.Warning(`Peer ${PeerHash} Invalid server address`,PeerServerAddress);
		return;
	}
	
	//	make sure we have a client to connect to this peer
	if ( !PeerClients.hasOwnProperty(PeerHash) )
	{
		Pop.Debug(`Creating peer client to connect to ${PeerHash}`);
		CreatePeerClient(PeerHash,PeerServerAddress);
	}
}


function UpdatePeerConnections(LocalPlayerHash,Players)
{
	for ( let Player of Players )
	{
		//	we CAN actualyl connect to ourselves for loopback
		if ( Player.Hash == LocalPlayerHash )
			continue;
		UpdatePeerServer( LocalPlayerHash, Player.Hash, Player.Meta );
		UpdatePeerClient( LocalPlayerHash, Player.Hash, Player.Meta );
	}	

}

function GetPeerConnectionMeta()
{
	const Meta = {};
	Meta.ServerAddress = {};
	Meta.ClientAddress = {};
	
	//	report server address if we're waiting for peer to connect
	function AddServerMeta(PeerHash)
	{
		if ( !PeerServers.hasOwnProperty(PeerHash) )	
			return;
		const Server = PeerServers[PeerHash];
		const ServerMeta = Server.GetAddress();
		//if ( Server.IsConnected() )		return;	//	don't need meta if they're connected
		if ( !ServerMeta )
			return;

		Meta.ServerAddress[PeerHash] = ServerMeta;
	}
	Object.keys(PeerServers).forEach(AddServerMeta);
	
	
	
	//	report client address if we're still waiting for them to join
	function AddClientMeta(PeerHash)
	{
		if ( !PeerServers.hasOwnProperty(PeerHash) )	
			return;
		const Client = PeerClients[PeerHash];
		const ClientMeta = Client.GetAddress();
		//if ( Server.IsConnected() )		return;	//	don't need meta if they're connected
		if ( !ClientMeta )
			return;

		Meta.ClientAddress[PeerHash] = ClientMeta;
	}
	Object.keys(PeerClients).forEach(AddClientMeta);
	
	return Meta;
}

function OnChatString(String)
{
	if ( !String || String.length == 0 )
		return;
	const MaxLines = 20;
	const ChatContentElement = document.querySelector(`#ChatWindow #ChatContent`);
	let Content = ChatContentElement.innerText.split('\n');
	Content.push(String);
	Content = Content.slice(-MaxLines);
	ChatContentElement.innerText = Content.join('\n');
}

function SendChatString(String)
{
	if ( !String || String.length == 0 )
		return;
		
	let SendCount = 0;
	const Data = String;
	const Servers = Object.values(PeerServers);
	function Send(Server)
	{
		try
		{
			const Peer = Server.GetPeers()[0];
			Server.Send(Peer,Data);
			SendCount++;
		}
		catch(e)
		{
		}
	}
	Servers.forEach(Send);
	
	//	nothing got sent
	if ( SendCount == 0 )
		OnChatString(`${String} <-- Not connected to anyone`);
}


function SetupChatUi()
{
	const ChatInput = document.querySelector(`#ChatWindow * input`);
	function OnKeyPress(Event)
	{
		if ( Event.key == 'Escape' )
		{
			ChatInput.value = '';
			return;
		}
		if ( Event.key == 'Enter' )
		{
			SendChatString(ChatInput.value);
			ChatInput.value = '';
			return;
		}
	}
	ChatInput.onkeypress = OnKeyPress;			
}
