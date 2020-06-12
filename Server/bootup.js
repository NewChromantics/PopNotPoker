Pop.Debug("PopNotPoker server booting up");

Pop.Include = function(Filename)
{
	const Source = Pop.LoadFileAsString(Filename);
	return Pop.CompileAndRun( Source, Filename );
}
Pop.Include('PopEngineCommon/PopApi.js');
Pop.Include('Games/Game.js');
Pop.Include('Games/Minesweeper.js');
Pop.Include('Games/MealDeal.js');
//Pop.Include('Games/PickANumber.js');


const Window = new Pop.Gui.Window("Server");

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


async function RunGameLoop(Room)
{
	while(true)
	{
		Pop.Debug(`New Game!`);

		const Game = new TMealDealGame();
		//const Game = new TMinesweeperGame();
		Room.SetGame(Game);
		//	for players still in room from a previous game
		//await Room.EnumNewGamePlayers( Game.AddPlayer.bind(Game) );
		
		
		//	gr: this func could call the lambda and retry automatically
		async function SendMoveAndWait(Player,Move)
		{
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
			await Room.WaitForPlayerJoinRequest();
		
			//	do the synchronous player update
			Room.EnumNewPlayers( Game.AddPlayer.bind(Game), Game.DeletePlayer.bind(Game) );
			OnStateChanged();
		}
		
		//	run the async game
		const GameEndPromise = Game.RunGame( SendMoveAndWait, OnStateChanged, OnAction );
		
		//	wait for the game to end, or players to join, or all players to leave and abort game
		let EndOfGameWinners = null;
		while( !EndOfGameWinners )
		{
			//	wait for something to happen, if the return of the promise is
			//	not empty, then it's the game-winners
			//	gr: if we get a game event, but lose the player request notification, that's okay
			//		as the game will exit, and we'll just check over players again on the next game
			const PlayersChangedPromise = Room.WaitForPlayerJoinRequest();
			const Events = [GameEndPromise,PlayersChangedPromise];
			
			EndOfGameWinners = await Promise.race(Events);
			
			//	do the synchronous player update
			Pop.Debug(`Room.EnumNewPlayers`);
			Room.EnumNewPlayers( Game.AddPlayer.bind(Game), Game.DeletePlayer.bind(Game) );
			
			//	if not enough players, forfeit game, or pause?
		}
		
		Room.SendToAllPlayers('EndOfGame',EndOfGameWinners);
		
		//	report generic win
		Room.IncreasePlayerWins(EndOfGameWinners);
		
		//	game exit!
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
		this.Name = CreateRandomHash(6);
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

class LobbyWebSocketServer
{
	constructor(ListenPorts)
	{
		this.GameHash = CreateRandomHash();
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
		this.WebSocketServerLoop(GetNextPort.bind(this)).then(Pop.Debug).catch(Pop.Debug);
	}
	
	SetGame(Game)
	{
		this.GameType = Game.constructor.name;
	}
	
	GetMeta()
	{
		function GetPublicMeta(Player)
		{
			const p = {};
			p.Hash = Player.Hash;
			p.Name = Player.Name;
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
	
	async WebSocketServerLoop(GetNextPort)
	{
		while(true)
		{
			try
			{
				const Port = GetNextPort();
				let Socket = new Pop.Websocket.Server(Port);
				this.CurrentSocket = Socket;
				
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
					const Packet = await Socket.WaitForMessage();
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
			
			if ( Packet.Command == 'SetName' )
			{
				//	turn to string in case of attack or future object
				Player.Name = `${Packet.Arguments}`;
				Pop.Debug(`Player name changed; ${JSON.stringify(Player)}`);
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
		return this.PlayerJoinRequestPromiseQueue.WaitForNext();
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
				Notify.Meta = Object.assign({},this.GetMeta());
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
				Notify.Meta = Object.assign({},this.GetMeta());
				this.SendToPeer(Peer,Notify);
			}
		}
		HandleJoin.call(this,Player).then().catch(Pop.Debug);

		//	wake up
		this.PlayerJoinRequestPromiseQueue.Push();
	}
	
	async EnumNewGamePlayers(AddPlayer)
	{
		const RejectedPlayers = [];
		
		function TryJoin(Player)
		{
			try
			{
				Pop.Debug(`Adding new player ${Player.Hash}`);
				const NewPlayerMeta = AddPlayer(Player.Hash);
				Player.GamePlayerMeta = NewPlayerMeta;
				//	move player from waiting to player list
				//this.MovePlayerFromWaitingToActive(Player);
				//Player.OnJoinPromise.Resolve(NewPlayerMeta);
			}
			catch(e)
			{
				Pop.Debug(`Existing player in new game rejected ${Player.Hash} ${e}`);
				const Rejection = {};
				Rejection.Exception = e;
				Rejection.Player = Player;
				RejectedPlayers.push(Rejection);
			}
		}
		this.ActivePlayers.forEach(TryJoin.bind(this));
		
		RejectedPlayers.forEach( r => this.DisconnectPeer(r.Player.Peer,r.Exception) );
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
		Notify.Meta = Object.assign({},this.GetMeta());
		const NotifyJson = JSON.stringify(Notify);
		function Send(Peer)
		{
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
			Request.Meta = Object.assign({},this.GetMeta());
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

{
	const Ports = [10001,10002,10003];
	const Room = new LobbyWebSocketServer(Ports);
	RunGameLoop(Room).catch(Pop.Debug);
}

