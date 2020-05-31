Pop.Debug("PopNotPoker server booting up");

Pop.Include = function(Filename)
{
	const Source = Pop.LoadFileAsString(Filename);
	return Pop.CompileAndRun( Source, Filename );
}
Pop.Include('PopEngineCommon/PopApi.js');


function isFunction(functionToCheck)
{
	return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
}

class TGame
{
	constructor()
	{
		this.Players = [];
		
		//	keep a record of last-playing players
		//	then when we need the next player, we pick someone not in the list
		//	if all exhausted, we know the player who hasn't had a go for the longest
		this.LastPlayers = [];
		//	we still need to keep the current one as we get next player, but doesnt
		//	move along until end of turn
		this.NextPlayer = null;
	}
	
	AddPlayer(PlayerRef)
	{
		this.Players.push(PlayerRef);
		return "Some player meta for game";
	}
	
	DeletePlayer(PlayerRef)
	{
		//	cut player out
		this.Players = this.Players.filter( p => p!=PlayerRef );
	}
	
	//	this gets the next player, but does NOT move it along
	//	in case move is not completed. EndPlayerTurn() moves it along
	GetNextPlayer()
	{
		if ( !this.Players.length )
			throw `GetNextPlayer: No players to choose from`;

		//	player still pending
		if ( this.NextPlayer !== null )
			return this.NextPlayer;
		
		//	cull any players that have left from the played list
		function IsPlayer(Player)
		{
			return this.Players.some( p => p==Player );
		}
		this.LastPlayers = this.LastPlayers.filter(IsPlayer.bind(this));
		
		//	go through players to see if one hasn't played
		for ( let i=0;	i<this.Players.length;	i++ )
		{
			const Player = this.Players[i];
			//	already played
			if ( this.LastPlayers.some( p => p==Player ) )
				continue;
			//	hasn't played, set active
			this.NextPlayer = Player;
			return Player;
		}
		
		//	everyone has played, take the oldest one and return it
		const FiloPlayer = this.LastPlayers.shift();
		this.NextPlayer = FiloPlayer;
		return FiloPlayer;
	}
	
	EndPlayerTurn(ExpectedPlayer=null)
	{
		if ( this.NextPlayer === null )
			throw `EndPlayerTurn(${ExpectedPlayer}) expecting no null-nextplayer`;
		
		//	make sure we're ending the right player
		if ( this.NextPlayer != ExpectedPlayer )
			throw `EndPlayerTurn(${ExpectedPlayer}) should be ${this.NextPlayer}`;
		
		//	put this player at the end of the list
		this.LastPlayers.push(this.NextPlayer);
		this.NextPlayer = null;
	}
	
	async WaitForNextMove()			{	throw `Game has not overloaded WaitForNextMove`;	}
	async InitNewPlayer(PlayerRef)	{	throw `Game has not overloaded InitNewPlayer`;	}
}


class TPickANumberGame extends TGame
{
	constructor()
	{
		super(...arguments);
		
		this.State = this.InitState();
	}
	
	InitState()
	{
		const State = {};
		State.Numbers = new Array(10);
		State.Numbers.fill(null);
		return State;
	}
	
	GetState()
	{
		//	return copy that can't be mutated?
		return this.State;
	}
	
	async InitNewPlayer(PlayerRef)
	{
		if ( this.Players.length >= 2 )
			throw `Player limit reached`;
	}
	
	HasEnoughPlayers()
	{
		if ( this.Players.length == 0 )
			return false;
		return true;
	}
	
	async GetNextMove()
	{
		const NextPlayer = this.GetNextPlayer();
		const Move = {};
		Move.Player = NextPlayer;
		Move.Actions = {};

		function TryPickANumber(Number)
		{
			if ( !this.State.Numbers.hasOwnProperty(Number) )
				throw `Not a valid number ${Number}`;
			if ( this.State.Numbers[Number] !== null )
				throw `Number ${Number} already picked`;
			
			this.State.Numbers[Number] = NextPlayer;
			this.EndPlayerTurn(NextPlayer);	//	move to next player
			
			//	reply with move data send to all players
			const ActionRender = {};
			ActionRender.Player = NextPlayer;
			ActionRender.Debug = `Player ${NextPlayer} picked ${Number}`;
			return ActionRender;
		}
		
		function ForfeitMove(Error)
		{
			this.EndPlayerTurn(NextPlayer);	//	move to next player
			
			const ActionRender = {};
			ActionRender.Player = NextPlayer;
			ActionRender.Debug = `Move forfeigted ${Error}`;
			return ActionRender;
		}
		
		function IsFree(Index)
		{
			return this.State.Numbers[Index] === null;
		}
		let RemainingNumbers = this.State.Numbers.map( (v,i)=>i ).filter(IsFree.bind(this));
		Move.Actions.PickNumber = {};
		Move.Actions.PickNumber.Lambda = TryPickANumber.bind(this);
		Move.Actions.PickNumber.Arguments = [RemainingNumbers];
		
		Move.Forfeit = ForfeitMove.bind(this);
		
		return Move;
	}
	
	GetEndGame()
	{
		return false;
	}
}


async function GameIteration(Game,Room)
{
	//	todo: wait for enough players, but we're not doing that at the same time as the iteration...
	if ( !Game.HasEnoughPlayers() )
	{
		Pop.Debug(`Not enough players, waiting for player-join-request`);
		await Room.WaitForPlayerJoinRequest();
		return;
	}
		
	const NextMove = await Game.GetNextMove();
	{
		const State = Game.GetState();
	
		//	send state to all players
		Room.SendToAllPlayers('State',State);
	}
	
	async function WaitForMoveReply()
	{
		//	send next move to player who's move it is
		try
		{
			const NextMovePacket = NextMove;
			Pop.Debug(`SendToPlayerAndWaitForReply ${JSON.stringify(NextMovePacket)}`);
			//	wait for the reply and process it
			const Reply = await Room.SendToPlayerAndWaitForReply('Move',NextMove.Player, NextMovePacket);
			const MoveActionName = Reply.Action;
			const Lambda = NextMove.Actions[MoveActionName].Lambda;
			const Action = Lambda(...Reply.ActionArguments);
			return Action;
		}
		catch(e)
		{
			//	on error, move is forfeit'd (player timeout/disconnect etc)
			Pop.Debug(`Player move reply failed: ${e}. Try again`);
			await Pop.Yield(100);	//	in case we get stuck on code error
			//	gr: this should now be an error and go forfeited
			return NextMove.Forfeit(e);
		}
	}
	
	//	do the move, grab the resulting movement when finished
	const Action = await WaitForMoveReply();
	
	//	send something showing what their [public] move was
	{
		const State = Game.GetState();
		Room.SendToAllPlayers('State',State);
		Room.SendToAllPlayers('Action',Action);
		Pop.Debug(`On Action ${Action}`);
	}
	
	//	move occured, assume state has updated, loop around
	//	check for end of game and break out
	const EndOfGame = Game.GetEndGame();
	if ( EndOfGame )
	{
		SendToAllPlayers('EndOfGame',EndOfGame);
		return EndOfGame;
	}
}

async function RunGameLoop(Room)
{
	while(true)
	{
		Pop.Debug(`New Game!`);
		
		const Game = new TPickANumberGame();
		while(true)
		{
			//	check for new players
			await Room.EnumNewPlayers( Game.AddPlayer.bind(Game), Game.DeletePlayer.bind(Game) );
			
			//	todo: check for all players quit
			//	do a game iteration and see if it's finished
			const EndOfGame = await GameIteration(Game,Room);
			if ( !EndOfGame )
				continue;
		}
		
	}
}

let UniquePlayerRef = 1000;
function AllocPlayerRef()
{
	UniquePlayerRef++;
	return `P${UniquePlayerRef}`;
}

class LobbyPlayer
{
	constructor(Player)
	{
		this.Player = Player ? Player : AllocPlayerRef();
		this.Peer = null;
		this.ReplyWaits = {};		//	[Command] = PromiseWaiting
		this.OnJoinPromise = null;	//	this promise is resolved by the game allowing player in/out
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
		this.WaitingPlayers = [];	//	list of players who want to join
		this.Players = [];			//	players in the game LobbyPlayer
		this.DeletedPlayers = [];	//	player refs that have been kicked off (but not yet acknowledged)

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
		const ActivePeers = this.Players.map(p=>p.Peer);
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
			
			//	player specific command
			throw `Command ${Packet.Command} for player ${Player.Player} not known`;
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
	
	DisconnectPeer(Peer,Reason)
	{
		function MatchPlayer(Match)		{	return Match.Peer == Peer;	}
		function MisMatchPlayer(Match)	{	return !MatchPlayer(Match);	}

		//	player has errored in some way, (maybe socket disconnected, maybe kicked)
		Pop.Debug(`DisconnectPeer(${Peer})`);

		//	pop player(should be 1) matching peer
		const WaitingPlayers = this.WaitingPlayers.filter(MatchPlayer);
		this.WaitingPlayers = this.WaitingPlayers.filter(MisMatchPlayer);
		const ActivePlayers = this.Players.filter(MatchPlayer);
		this.Players = this.Players.filter(MisMatchPlayer);
		const WaitingPlayer = WaitingPlayers.length ? WaitingPlayers[0] : null;
		const ActivePlayer = ActivePlayers.length ? ActivePlayers[0] : null;

		Pop.Debug(`Disconnecting peer; WaitingPlayer=${WaitingPlayer} ActivePlayer=${ActivePlayer}`);

		//	reject anything waiting
		if ( WaitingPlayer )
			WaitingPlayer.RejectWaits(Reason);
		if ( ActivePlayer )
			ActivePlayer.RejectWaits(Reason);
		
		//	add to list of players that need to be cut from the game
		this.DeletedPlayers.push(WaitingPlayer||ActivePlayer);
		
		//	todo: send disconnect notify packet
		
		//	make sure its disconnected
		//this.CurrentSocket.Disconnect(Peer);
	}
	
	MovePlayerFromWaitingToActive(Player)
	{
		function MatchPlayer(Match)		{	return Match.Player == Player.Player;	}
		function MisMatchPlayer(Match)	{	return !MatchPlayer(Match);	}

		//	should be one in waiting list, take it out
		const MatchingWaitingPlayers = this.WaitingPlayers.filter(MatchPlayer);
		if ( MatchingWaitingPlayers.length != 1 )
			Pop.Debug(`There are ${MatchingWaitingPlayers.length} players ${Player.Player} in waiting list, should be 1`);
		this.WaitingPlayers = this.WaitingPlayers.filter(MisMatchPlayer);

		//	should NOT be in player list. Add it
		const MatchingActivePlayers = this.Players.filter(MatchPlayer);
		if ( MatchingActivePlayers.length != 0 )
			Pop.Debug(`There are ${MatchingActivePlayers.length} players ${Player.Player} in active list, should be 0`);
		this.Players.push(Player);
	}
	
	OnPeerTryJoin(Peer,Packet)
	{
		//	todo: allow packet to have a playerref
		//	new player who wants to join
		const Player = new LobbyPlayer();
		Player.Peer = Peer;
		Pop.Debug(`Peer ${Peer} trying to join (player=${Player.Player})`);
		this.WaitingPlayers.push(Player);
		
		//	this promise is resolved or rejected when the player is allowed into the room
		Player.OnJoinPromise = Pop.CreatePromise();
		
		//	now this player has to wait for confirmation/rejection
		async function HandleJoin(Player)
		{
			try
			{
				const SomeMetaFromGame = await Player.OnJoinPromise;
				Pop.Debug(`OnPeerJoin resolved; Peer=${Peer} is Player=${Player}`);
				//	notify player they're in
				const Notify = {};
				Notify.Command = 'JoinReply';
				Notify.Player = Player.Player;
				Notify.Debug = SomeMetaFromGame;
				this.SendToPeer(Peer,Notify);
				Pop.Debug(`Peer(${Peer}) joined ${Player}`);
			}
			catch(e)
			{
				Pop.Debug(`Join error, rejecting; ${e}`);
				//	send error, then kick
				const Notify = {};
				Notify.Command = 'JoinReply';
				Notify.Error = e;
				this.SendToPeer(Peer,Notify);
			}
		}
		HandleJoin.call(this,Player).then().catch(Pop.Debug);

		//	wake up
		this.PlayerJoinRequestPromiseQueue.Push();
	}
	
	async EnumNewPlayers(AddPlayer,DeletePlayer)
	{
		//	for any waiting player they should do a request
		function TryJoin(Player)
		{
			try
			{
				Pop.Debug(`Adding new player ${Player.Player}`);
				const NewPlayerMeta = AddPlayer(Player.Player);
				
				//	move player from waiting to player list
				this.MovePlayerFromWaitingToActive(Player);
				Player.OnJoinPromise.Resolve(NewPlayerMeta);
			}
			catch(e)
			{
				Pop.Debug(`New player rejected ${Player.Player} ${e}`);
				//	player rejected for some reason
				Player.OnJoinPromise.Reject(e);
			}
		}
		
		//	the function inside moves from the waiting list, so make a copy to iterate
		const WaitingPlayers = this.WaitingPlayers.slice();
		WaitingPlayers.forEach(TryJoin.bind(this));
		
		const DeletedPlayers = this.DeletedPlayers.splice(0);
		DeletedPlayers.forEach(DeletePlayer);
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
	
	GetPeer(Player)
	{
		function MatchPlayer(Match)	{	return Match.Player == Player;	}
		const WaitingPlayers = this.WaitingPlayers.filter(MatchPlayer);
		const ActivePlayers = this.Players.filter(MatchPlayer);
		if ( WaitingPlayers.length )
			return WaitingPlayers[0].Peer;
		if ( ActivePlayers.length )
			return ActivePlayers[0].Peer;
		return null;
	}
	
	GetPlayer(PeerOrPlayerRef)
	{
		const Peer = PeerOrPlayerRef;
		const PlayerRef = PeerOrPlayerRef;
		function MatchPeer(Player)	{	return Player.Peer == Peer || Player.Player==PlayerRef;	}
		const WaitingPlayers = this.WaitingPlayers.filter(MatchPeer);
		const ActivePlayers = this.Players.filter(MatchPeer);
		if ( WaitingPlayers.length )
			return WaitingPlayers[0];
		if ( ActivePlayers.length )
			return ActivePlayers[0];
		return null;
	}
	
	CreateRandomHash(Length=4)
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
		const Player = this.GetPlayer(PlayerRef);
		if ( !Player )
		{
			//Pop.Debug(`Players: ${JSON.stringify(this.Players)}`);
			throw `SendToPlayerAndWaitForReply: No player found for ${PlayerRef}`;
		}

		//	it's possible this is called before Player/Peer is set...
		//	so it needs to wait if we know there's a player, but peer not set
		
		const Peer = Player.Peer;//this.GetPeer(PlayerRef);
		const ReplyCommand = Command+'Response';
		const Hash = this.CreateRandomHash();
		const ReplyPromise = Player.CreateReplyWait(ReplyCommand);
		
		try
		{
			const Request = {};
			Request.Command = Command;
			Request.Hash = Hash;
			Request[Command] = Data;
			Request.ReplyCommand = ReplyCommand;	//	could swap this for hash
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
	const Ports = [10001,10002,10003,10004];
	const Room = new LobbyWebSocketServer(Ports);
	RunGameLoop(Room).catch(Pop.Debug);
}

