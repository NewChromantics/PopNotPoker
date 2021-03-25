Pop.Debug("PopNotPoker room booting up");


//	from webapi, move this into native 
//	gr: I thought I already did this
function GetExeArgs()
{
	const UrlArgs = Pop.GetExeArguments();
	
	//	turn into keys & values - gr: we're not doing this in engine! fix so they match!
	const UrlParams = {};
	function AddParam(Argument)
	{
		let [Key,Value] = Argument.split('=',2);
		if ( Value === undefined )
			Value = true;
		
		//	attempt some auto conversions
		if ( typeof Value == 'string' )
		{
			const NumberValue = Number(Value);
			if ( !isNaN(NumberValue) )
				Value = NumberValue;
			else if ( Value == 'true' )
				Value = true;
			else if ( Value == 'false' )
				Value = false;
		}
		UrlParams[Key] = Value;
	}
	UrlArgs.forEach(AddParam);
	return UrlParams;
}


Pop.Include = function(Filename)
{
	const Source = Pop.LoadFileAsString(Filename);
	return Pop.CompileAndRun( Source, Filename );
}
Pop.Include('PopEngineCommon/PopApi.js');
Pop.Include('Games/Game.js');
Pop.Include('Games/Minesweeper.js');
Pop.Include('Games/MealDeal.js');
Pop.Include('Games/Boggle.js');
Pop.Include('Games/Looter.js');
//Pop.Include('Games/PickANumber.js');

/*
try {
	const Window = new Pop.Gui.Window("Server");
} catch (e) {
	console.error(e)
}
*/
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


async function RunGameRoomLoop(Room,GameClass)
{
	while(true)
	{
		Pop.Debug(`New Game!`);

		const Game = new GameClass();
		Room.OnStartGame(Game.constructor.name);
		//	for players still in room from a previous game, turn them back into waiting
		//	players so they go through the same joining routine
		Room.DeactivatePlayers();
		
		
		//	gr: this func could call the lambda and retry automatically
		async function SendMoveAndWait(Player,Move)
		{
			//	gr: todo: verify Move's Actions here
			//	need;	.Lambda
			//			.Arguments = array of arrays(options) for each param to lambda
			//	eg;		.Lambda = Pick(Number,Animal) .Arguments = [ [0,1,2], [cat,dog] ]
			const Reply = await Room.SendToPlayerAndWaitForReply('Move', Player, Move );
			return Reply;
		}
		
		function OnStateChanged()
		{
			//	send state to all players
			const State = Game.GetPublicState();
			Room.SendToAllPlayers('State',State);
		}
		
		function OnAction(Action)
		{
			Pop.Debug(`On Action ${JSON.stringify(Action)}`);
			OnStateChanged();
			Room.SendToAllPlayers('Action',Action);
		}
		
		//	auto wait-for-enough players before we start the loop
		//	so every game starts with enough players and doesnt need extra code
		while ( !Game.HasEnoughPlayers() )
		{
			Pop.Debug(`Game waiting for players. WaitForPlayerJoinRequest`);
			await Room.WaitForPlayerJoinRequest();
		
			//	do the synchronous player update
			Room.EnumNewPlayers( Game.AddPlayer.bind(Game), Game.DeletePlayer.bind(Game) );
			OnStateChanged();
		}
		
		Pop.Debug(`Starting game ${Game.Players}`);
		
		//	run the async game
		const GameEndPromise = Game.RunGame( SendMoveAndWait, OnStateChanged, OnAction );
		
		//	wait for the game to end, or players to join, or all players to leave and abort game
		let EndOfGameWinners = undefined;
		while( !EndOfGameWinners )
		{
			//	wait for something to happen, if the return of the promise is
			//	not empty, then it's the game-winners
			//	gr: if we get a game event, but lose the player request notification, that's okay
			//		as the game will exit, and we'll just check over players again on the next game
			const PlayersChangedPromise = Room.WaitForPlayerJoinRequest();
			const Events = [GameEndPromise,PlayersChangedPromise];
			
			EndOfGameWinners = await Promise.race(Events);
			Pop.Debug(`GameEnd/PlayersChanged race=${EndOfGameWinners}`);

			//	do the synchronous player update
			Pop.Debug(`Room.EnumNewPlayers`);
			Room.EnumNewPlayers( Game.AddPlayer.bind(Game), Game.DeletePlayer.bind(Game) );
			
			//	if not enough players, forfeit game, or pause?
			if ( !Game.HasEnoughPlayers() )
			{
				Pop.Debug(`Game doesn't have enough players, breaking game loop`);
				break;
			}
		}
		
		Pop.Debug(`Game finished; EndOfGameWinners=${EndOfGameWinners}`);

		//	game exited with no winner (ie, game aborted)
		if ( !EndOfGameWinners )
			EndOfGameWinners = [];
		
		Room.SendToAllPlayers('EndOfGame',EndOfGameWinners);
		
		//	report generic win
		Room.IncreasePlayerWins(EndOfGameWinners);
		
		//	game exit! 
		//	let room loop around so same players can start a new game
		//	if everyone has quit, then exit (and exit process)
		/*
		if ( Game.Players.length == 0 )
		{
			Pop.Debug(`All players left. Exiting`);
			return;
		}
		*/
	}
}

let UniquePlayerRef = 1000;
function AllocPlayerHash()
{
	UniquePlayerRef++;
	return `P${UniquePlayerRef}P`;
}

class LobbyPlayer
{
	constructor(Hash)
	{
		this.Hash = Hash ? Hash : AllocPlayerHash();
		this.Meta = {};
		this.Meta.Name = CreateRandomHash(6);
		this.Peer = null;
		this.ReplyWaits = {};		//	[Command] = PromiseWaiting
		this.OnJoinPromise = null;	//	this promise is resolved by the game allowing player in/out
		this.Wins = 0;
	}
	
	RejectWaits(Reason)
	{
		if ( this.OnJoinPromise )
			this.OnJoinPromise.Reject(Reason);
		
		const ReplyWaitPromises = Object.values(this.ReplyWaits);
		ReplyWaitPromises.forEach( p => p.Reject(Reason) );
	}
	
	CreateReplyWait(Command)
	{
		if ( this.ReplyWaits.hasOwnProperty(Command) )
			throw `CreateReplyWait: Player already waiting for ${Command} reply`;
		const Promise = Pop.CreatePromise();
		this.ReplyWaits[Command] = Promise;
		return Promise;
	}
}

//	todo: seperate socket from Lobby & Lobby I/O
class LobbyWebSocketServer
{
	constructor(ListenPorts,OnListening)
	{
		//	game hash is for the client to differentiate 
		this.GameType = null;
		this.GameHash = null;
		
		this.WaitingPlayers = [];	//	list of players who want to join
		this.ActivePlayers = [];	//	players in the game LobbyPlayer
		this.DeletingPlayers = [];	//	player refs that have been kicked off (but not yet acknowledged)
		this.DeletedPlayers = [];	//	stored old players for scores

		//	semaphore to notify there are new players
		this.PlayerJoinRequestPromiseQueue = new Pop.PromiseQueue();

		this.Ports = ListenPorts.slice();
		let CurrentPort = null;
		function GetNextPort()
		{
			CurrentPort = (CurrentPort===null) ? 0 : (CurrentPort+1)%this.Ports.length;
			return this.Ports[CurrentPort];
		}
		this.CurrentSocket = null;
		this.WebSocketServerLoop(GetNextPort.bind(this),OnListening).then(Pop.Debug).catch(Pop.Debug);
	}
	
	OnStartGame(GameType)
	{
		this.GameType = GameType;
		this.GameHash = CreateRandomHash();
	}
	
	
	GetMeta(Peer)
	{
		function GetPublicMeta(Player)
		{
			const p = {};
			p.Hash = Player.Hash;
			p.Meta = Player.Meta;
			p.Wins = Player.Wins;
			return p;
		}
		
		//	add player info
		const Meta = {};
		Meta.GameHash = this.GameHash;
		Meta.GameType = this.GameType;
		Meta.ActivePlayers = this.ActivePlayers.map(GetPublicMeta);
		Meta.WaitingPlayers = this.WaitingPlayers.map(GetPublicMeta);
		Meta.DeletingPlayers = this.DeletingPlayers.map(GetPublicMeta);
		Meta.DeletedPlayers = this.DeletedPlayers.map(GetPublicMeta);
		
		//	don't error if this peer has lost a player (after disconnection?)
		const PeerPlayer = this.GetPlayer(Peer);
		Meta.YourPlayerHash = PeerPlayer ? PeerPlayer.Hash : null;
		
		return Meta;
	}
	
	SendPings(Socket)
	{
		const Ping = {};
		Ping.Command = 'Ping';
		function SendPing(Peer)
		{
			try
			{
				this.SendToPeer(Peer,Ping);
			}
			catch(e)
			{
				Pop.Debug(`Ping to ${Peer} error ${e}`);
			}
		}
		//	gr: don't ping peers, ping the peers we've ever seen
		const WaitingPeers = this.WaitingPlayers.map(p=>p.Peer);
		const ActivePeers = this.ActivePlayers.map(p=>p.Peer);
		//Pop.Debug(`PingLoop x${WaitingPeers} x${ActivePeers}`);
		//const Peers = Socket.GetPeers();
		WaitingPeers.forEach(SendPing.bind(this));
		ActivePeers.forEach(SendPing.bind(this));
	}
	
	async WebSocketServerLoop(GetNextPort,OnListening)
	{
		while(true)
		{
			try
			{
				const Port = GetNextPort();
				let Socket = new Pop.Websocket.Server(Port);
				this.CurrentSocket = Socket;
				
				//	get & report the port we're actually listening on
				{
					const Addresses = Socket.GetAddress();
					OnListening(Addresses);
				}
				
				//	regularly send a ping to catch if a peer has disconnected (todo: use websocket ping!)
				async function PingLoop()
				{
					while(Socket)
					{
						await Pop.Yield(2000);
						this.SendPings(Socket);
					}
				}
				PingLoop.call(this).catch(e=>Pop.Debug(`PingLoop error ${e}`));
				
				//	do we need to check joining states? we do care about disconnections...
				//	we should also seperate players from rooms
				while(Socket)
				{
					Pop.Debug(`Socket waiting for next message`);
					const Packet = await Socket.WaitForMessage();
					//Pop.Debug(`Socket got packet: ${JSON.stringify(Packet)}`);
					const Peers = Socket.GetPeers();
					//Pop.Debug(`Socket all peers: ${Peers}`);
					
					//	handle join request
					try
					{
						this.OnPacket(Packet.Peer,Packet.Data);
					}
					catch(e)
					{
						Pop.Debug(`OnPacket error; ${e}`);
						const Response = {};
						Response.Error = e;
						Socket.Send(Packet.Peer,JSON.stringify(Response));
					}
				}
			}
			catch(e)
			{
				Pop.Debug(`Socket error ${e}`);
				this.CurrentSocket = null;
			}
		}
	}
	
	
	OnPacket(Peer,Data)
	{
		//	currently assuming always json
		const Packet = JSON.parse(Data);
		const DataDebug = `${Data}`.substring(0,30);
		Pop.Debug(`OnPacket Peer=${Peer};${DataDebug}`);
		
		if ( !Packet.Command )
			throw `Packet has no command`;

		const Player = this.GetPlayer(Peer);

		//	if there is a player, see if this is a reply
		if ( Player )
		{
			//	promise to respond to
			if ( Player.ReplyWaits.hasOwnProperty(Packet.Command) )
			{
				const Promise = Player.ReplyWaits[Packet.Command];
				Promise.Resolve(Packet);
				delete Player.ReplyWaits[Packet.Command];
				return;
			}
			
			if ( Packet.Command == 'SetMeta' )
			{
				//	assume this is an object
				Pop.Debug(`SetMeta; ${Packet.Arguments}`);
				Player.Meta = Packet.Arguments;
				
				Pop.Debug(`Player meta changed; ${JSON.stringify(Player)}`);
				this.OnPlayersChanged(Player);
				return;
			}
			
			//	player specific command
			throw `Command ${Packet.Command} for player ${Player.Hash} not known`;
		}
		
		if ( Packet.Command == 'Join' )
		{
			this.OnPeerTryJoin(Peer,Packet);
			return;
		}
		
		throw `Unhandled packet ${Data}`;
	}
	
	async WaitForPlayerJoinRequest()
	{
		//	gr: this function is expected to return undefined
		//	just use the queue to wake
		await this.PlayerJoinRequestPromiseQueue.WaitForNext();
		return;
	}
	
	SendToPeer(Peer,Message)
	{
		if ( typeof Message != 'string' )
			Message = JSON.stringify(Message);
		try
		{
			this.CurrentSocket.Send(Peer,Message);
		}
		catch(e)
		{
			//	error sending, client gone!
			Pop.Debug(`SendToPeer Socket error ${e}`);
			this.DisconnectPeer(Peer);
			throw e;
		}
	}
	
	OnPlayersChanged(Player)
	{
		//	send out updated meta
		this.SendToAllPlayers('MetaChanged',{});
	}
	
	DisconnectPeer(Peer,Reason)
	{
		function MatchPlayer(Match)		{	return Match.Peer == Peer;	}
		function MisMatchPlayer(Match)	{	return !MatchPlayer(Match);	}

		//	player has errored in some way, (maybe socket disconnected, maybe kicked)
		Pop.Debug(`DisconnectPeer(${Peer})`);

		//	pop player(should be 1) matching peer
		const WaitingPlayers = this.WaitingPlayers.filter(MatchPlayer);
		this.WaitingPlayers = this.WaitingPlayers.filter(MisMatchPlayer);
		const ActivePlayers = this.ActivePlayers.filter(MatchPlayer);
		this.ActivePlayers = this.ActivePlayers.filter(MisMatchPlayer);
		const WaitingPlayer = WaitingPlayers.length ? WaitingPlayers[0] : null;
		const ActivePlayer = ActivePlayers.length ? ActivePlayers[0] : null;

		Pop.Debug(`Disconnecting peer; WaitingPlayer=${WaitingPlayer} ActivePlayer=${ActivePlayer}`);

		//	reject anything waiting
		if ( WaitingPlayer )
			WaitingPlayer.RejectWaits(Reason);
		if ( ActivePlayer )
			ActivePlayer.RejectWaits(Reason);
		
		//	add to list of players that need to be cut from the game
		if ( WaitingPlayer )
			this.DeletingPlayers.push(WaitingPlayer);
		if ( ActivePlayer )
			this.DeletingPlayers.push(ActivePlayer);
	
		//	todo: send disconnect notify packet
		this.OnPlayersChanged();
		
		//	wake up anything that's waiting for new players (todo: rename this to "players-change request"
		Pop.Debug(`Disconnect peer wake up`);
		this.PlayerJoinRequestPromiseQueue.Push();
		
		//	make sure its disconnected
		//this.CurrentSocket.Disconnect(Peer);
	}
	
	MovePlayerFromWaitingToActive(Player)
	{
		function MatchPlayer(Match)		{	return Match.Hash == Player.Hash;	}
		function MisMatchPlayer(Match)	{	return !MatchPlayer(Match);	}

		//	should be one in waiting list, take it out
		const MatchingWaitingPlayers = this.WaitingPlayers.filter(MatchPlayer);
		if ( MatchingWaitingPlayers.length != 1 )
			Pop.Debug(`There are ${MatchingWaitingPlayers.length} players ${Player.Hash} in waiting list, should be 1`);
		this.WaitingPlayers = this.WaitingPlayers.filter(MisMatchPlayer);

		//	should NOT be in player list. Add it
		const MatchingActivePlayers = this.ActivePlayers.filter(MatchPlayer);
		if ( MatchingActivePlayers.length != 0 )
			Pop.Debug(`There are ${MatchingActivePlayers.length} players ${Player.Hash} in active list, should be 0`);
		this.ActivePlayers.push(Player);
		
		this.OnPlayersChanged(Player);
	}
	
	OnPeerTryJoin(Peer,Packet)
	{
		//	todo: allow packet to have a playerref
		//	new player who wants to join
		const Player = new LobbyPlayer();
		Player.Peer = Peer;
		Pop.Debug(`Peer ${Peer} trying to join (player=${Player.Hash})`);
		this.WaitingPlayers.push(Player);
		this.OnPlayersChanged(Player);
		
		//	this promise is resolved or rejected when the player is allowed into the room
		Player.OnJoinPromise = Pop.CreatePromise();
		
		//	now this player has to wait for confirmation/rejection
		async function HandleJoin(Player)
		{
			try
			{
				const SomeMetaFromGame = await Player.OnJoinPromise;
				Pop.Debug(`OnPeerJoin resolved; Peer=${Peer} is Player=${JSON.stringify(Player)}`);
				//	notify player they're in
				const Notify = {};
				Notify.Command = 'JoinReply';
				Notify.Player = Player.Hash;
				Notify.Debug = SomeMetaFromGame;
				Notify.Meta = this.GetMeta(Peer);
				this.SendToPeer(Peer,Notify);
				Pop.Debug(`Peer(${Peer}) joined ${JSON.stringify(Player)}`);
			}
			catch(e)
			{
				Pop.Debug(`Join error, rejecting; ${e}`);
				//	send error, then kick
				const Notify = {};
				Notify.Command = 'JoinReply';
				Notify.Error = e;
				Notify.Meta = this.GetMeta(Peer);
				this.SendToPeer(Peer,Notify);
			}
		}
		HandleJoin.call(this,Player).then().catch(Pop.Debug);

		//	wake up
		this.PlayerJoinRequestPromiseQueue.Push();
	}
	
	DeactivatePlayers()
	{
		const PoppedPlayers = this.ActivePlayers.splice( 0, this.ActivePlayers.length );
		//	put previously active players to the FRONT of the queue
		this.WaitingPlayers.splice( 0, 0, ...PoppedPlayers );

		Pop.Debug(`Cut ${PoppedPlayers.length} active players and added to waiting list (${this.WaitingPlayers.length})`);
		
		//	notify changes
		this.PlayerJoinRequestPromiseQueue.Push();
	}
	
	async EnumNewPlayers(AddPlayer,DeletePlayer)
	{
		//	for any waiting player they should do a request
		function TryJoin(Player)
		{
			try
			{
				Pop.Debug(`Adding new player ${Player.Hash}`);
				const NewPlayerMeta = AddPlayer(Player.Hash);
				Player.GamePlayerMeta = NewPlayerMeta;
				
				//	move player from waiting to player list
				this.MovePlayerFromWaitingToActive(Player);
				Player.OnJoinPromise.Resolve(NewPlayerMeta);
			}
			catch(e)
			{
				Pop.Debug(`New player rejected ${Player.Hash} ${e}`);
				//	player rejected for some reason
				Player.OnJoinPromise.Reject(e);
			}
		}
		
		//	the function inside moves from the waiting list, so make a copy to iterate
		Pop.Debug(`EnumNewPlayers waiting=${this.WaitingPlayers.length} deleting=${this.DeletingPlayers.length}`);
		const WaitingPlayers = this.WaitingPlayers.slice();
		WaitingPlayers.forEach(TryJoin.bind(this));
		
		const DeletingPlayers = this.DeletingPlayers.splice(0);
		this.DeletedPlayers.push(...DeletingPlayers);
		DeletingPlayers.forEach( p => DeletePlayer(p.Hash) );
		
		this.OnPlayersChanged();
	}
	
	SendToAllPlayers(Thing,ThingObject)
	{
		//	todo: Save last Thing for when socket restarts or players join
		const Socket = this.CurrentSocket;
		if ( !Socket )
			throw `Todo: need to save ${Thing} and re-send when socket restarts`;
		
		//	todo: turn ThingObject function members into something static
		const Notify = {};
		Notify[Thing] = ThingObject;
		function Send(Peer)
		{
			Notify.Meta = this.GetMeta(Peer);
			const NotifyJson = JSON.stringify(Notify);
			try
			{
				Socket.Send(Peer,NotifyJson);
			}
			catch(e)
			{
				Pop.Debug(`Error sending to ${Peer}. disconnect player?`);
				this.OnPlayerDisconnected(Peer);
			}
		}
		const Peers = this.CurrentSocket.GetPeers();
		Peers.forEach(Send.bind(this));
	}
	
	GetPeer(PlayerHash)
	{
		function MatchPlayer(Match)	{	return Match.Hash == PlayerHash;	}
		const WaitingPlayers = this.WaitingPlayers.filter(MatchPlayer);
		const ActivePlayers = this.ActivePlayers.filter(MatchPlayer);
		if ( WaitingPlayers.length )
			return WaitingPlayers[0].Peer;
		if ( ActivePlayers.length )
			return ActivePlayers[0].Peer;
		return null;
	}
	
	IncreasePlayerWins(PlayerHashs)
	{
		function Increase(PlayerHash)
		{
			const Player = this.GetPlayer(PlayerHash);
			if ( !Player )
				return;
			Player.Wins++;
			this.OnPlayersChanged(Player);
		}
		PlayerHashs.forEach(Increase.bind(this));
	}
	
	GetPlayer(PeerOrPlayerHash,ActiveOnly=false)
	{
		const Peer = PeerOrPlayerHash;
		const PlayerHash = PeerOrPlayerHash;
		function MatchPeer(Player)	{	return Player.Peer == Peer || Player.Hash==PlayerHash;	}
		const WaitingPlayers = this.WaitingPlayers.filter(MatchPeer);
		const ActivePlayers = this.ActivePlayers.filter(MatchPeer);
		const DeletedPlayers = this.DeletedPlayers.filter(MatchPeer);
		const DeletingPlayers = this.DeletingPlayers.filter(MatchPeer);

		if ( ActivePlayers.length )		return ActivePlayers[0];
		if ( !ActiveOnly )
		{
			if ( WaitingPlayers.length )	return WaitingPlayers[0];
			if ( DeletedPlayers.length )	return DeletedPlayers[0];
			if ( DeletingPlayers.length )	return DeletingPlayers[0];
		}
		return null;
	}
	

	
	CreatePeerCommandReplyPromise(Peer,Command)
	{
		if ( !this.PeerWaitForCommandPromises.hasOwnProperty(Peer) )
		{
			this.PeerWaitForCommandPromises[Peer] = {};
		}
		const PeerPromises = this.PeerWaitForCommandPromises[Peer];
		if ( PeerPromises.hasOwnProperty(Command) )
		{
			throw `Peer (${Peer}) command(${Command}) reply promise already exists`;
		}
		const NewPromise = Pop.CreatePromise();
		this.PeerWaitForCommandPromises[Peer][Command] = NewPromise
		return NewPromise;
	}
		
		
	async SendToPlayerAndWaitForReply(Command,PlayerRef,Data)
	{
		const Player = this.GetPlayer(PlayerRef,true);
		if ( !Player )
		{
			//Pop.Debug(`Players: ${JSON.stringify(this.ActivePlayers)}`);
			throw `SendToPlayerAndWaitForReply: No player found for ${PlayerRef}`;
		}

		//	it's possible this is called before Player/Peer is set...
		//	so it needs to wait if we know there's a player, but peer not set
		
		const Peer = Player.Peer;//this.GetPeer(PlayerRef);
		const ReplyCommand = Command+'Response';
		const Hash = CreateRandomHash();
		const ReplyPromise = Player.CreateReplyWait(ReplyCommand);
		
		try
		{
			const Request = {};
			Request.Command = Command;
			Request.Hash = Hash;
			Request[Command] = Data;
			Request.ReplyCommand = ReplyCommand;	//	could swap this for hash
			Request.Meta = this.GetMeta(Peer);
			const RequestStr = JSON.stringify(Request);
			this.SendToPeer(Peer,Request);
		}
		catch(e)
		{
			ReplyPromise.Reject(e);
			return;
		}
		Pop.Debug(`waiting on ReplyPromise ${ReplyPromise}`);
		const Reply = await ReplyPromise;
		if ( Reply.Hash != Hash )
			throw `Got MoveResponse with wrong hash (${Hash}) ${JSON.stringify(Reply)}`;
		return Reply;
	}
}


function CreateClientHttpServer(ServePath,Port=0)
{
	function HandleVirtualFile(Response)
	{
		//	return a filename to redirect
		const Filename = Response.Url;
		return `${ServePath}/${Filename}`;
	}
	const Http = new Pop.Http.Server(Port,HandleVirtualFile);
	return Http;
}


const Args = GetExeArgs();
Pop.Debug(`Args=${JSON.stringify(Args)}`);
//	need a global to stop server being garbage collected
let ClientHttpServer = null;


function StartClientHttpServer(ServerHost,ServerPort,ServerRoom)
{
	if ( !Args.HttpServer )
		return;
	
	if ( !ClientHttpServer )
	{
		const ServePath = Args.HttpServer;
		ClientHttpServer = CreateClientHttpServer(ServePath);
	
		//	don't keep popping this up in case we get stuck in a loop	
		const HttpAddress = ClientHttpServer.GetAddress()[0].Address;
		const Url = `http://${HttpAddress}/Room.html?Hostname=${ServerHost}&Port=${ServerPort}&Room=${ServerRoom}`;
		Pop.Debug(`Show url ${JSON.stringify(HttpAddress)}`);
		Pop.Debug(Url);
		Pop.ShowWebPage(Url);
	}
}


function OnListening(Addresses)
{
	const Address0 = Addresses[0].Address;
	const AddressAndPort = Address0.split(':');					
	const ListeningPort = AddressAndPort[1];

	Pop.StdOut(`Listening on ${ListeningPort}`);
	
	try
	{
		//Pop.ShowWebPage(`http://localhost:${ListeningPort}`);
	}
	catch(e)
	{
	}
	
	StartClientHttpServer('localhost',ListeningPort,'No room name');
}

async function RunGameLoop()
{
	//const GameClass = TMinesweeperGame;
	//const GameClass = TBoggleGame;
	const GameClass = TLooterGame;

	const Ports = [0];
	const Room = new LobbyWebSocketServer(Ports,OnListening);
	try
	{
		await RunGameRoomLoop(Room,GameClass);
		Pop.ExitApplication(0);		
	}
	catch(e)
	{
		Pop.Debug(`Error in RunGameLoop; ${e}`);
		Pop.ExitApplication(1);
	}
}
RunGameLoop();

