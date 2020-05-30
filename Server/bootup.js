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
	}
	
	async AddPlayer(PlayerRef)
	{
		await this.InitNewPlayer(PlayerRef);
		this.Players.push(PlayerRef);
		return PlayerRef;
	}
	
	async WaitForNextMove()			{	throw `Game has not overloaded WaitForNextMove`;	}
	async InitNewPlayer(PlayerRef)	{	throw `Game has not overloaded InitNewPlayer`;	}
}


class TPickANumberGame extends TGame
{
	constructor()
	{
		super(...arguments);
		this.CurrentPlayerIndex = 0;
		
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
		const Move = {};
		Move.Player = this.Players[this.CurrentPlayerIndex];
		Move.Actions = {};

		function TryPickANumber(Number)
		{
			if ( !this.State.Numbers.hasOwnProperty(Number) )
				throw `Not a valid number ${Number}`;
			if ( this.State.Numbers[Number] !== null )
				throw `Number ${Number} already picked`;
			
			const PickingPlayer = this.CurrentPlayerIndex
			this.State.Numbers[Number] = PickingPlayer;
			this.CurrentPlayerIndex = (this.CurrentPlayerIndex+1)%this.Players.length;
			
			//	reply with move data send to all players
			const ActionRender = {};
			ActionRender.Player = PickingPlayer;
			ActionRender.Debug = `Player ${PickingPlayer} picked ${Number}`;
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
	
	async function WaitForValidReply()
	{
		//	send next move to player who's move it is
		while ( true )
		{
			try
			{
				const NextMovePacket = NextMove;
				Pop.Debug(`SendToPlayerAndWaitForReply ${JSON.stringify(NextMovePacket)}`);
				//	wait for the reply and process it
				const Reply = await Room.SendToPlayerAndWaitForReply(NextMove.Player, NextMovePacket);
				const MoveActionName = Reply.Action;
				const Lambda = NextMove.Actions[MoveActionName].Lambda;
				const Action = Lambda(...Reply.ActionArguments);
				return Action;
			}
			catch(e)
			{
				//	on error, we could notify everyone else
				//	loop and send the move again
				//	todo: catch players disconnecting, reply timeout (ie, time limited moves)
				Pop.Debug(`Player move reply failed: ${e}. Try again`);
				await Pop.Yield(100);	//	in case we get stuck on code error
			}
		}
	}
	
	//	do the move, grab the resulting movement when finished
	const Action = await WaitForValidReply();
	
	//	send something showing what their [public] move was
	{
		const State = Game.GetState();
		Room.SendToAllPlayers('State',State);
		Room.SendToAllPlayers('Action',Action);
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
			await Room.EnumNewPlayers( Game.AddPlayer.bind(Game) );
			
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
	return UniquePlayerRef;
}

class LobbyWebSocketServer
{
	constructor(ListenPorts)
	{
		this.PlayerPeers = {};	//	PeerPlayers[Player] = Peer
		
		//	whatever abstraction this is
		this.PendingPeers = [];
		this.PeerWaitForCommandPromises = {};	//	for [Peer][Command] there's a promise waiting for it
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
	
	async WebSocketServerLoop(GetNextPort)
	{
		while(true)
		{
			try
			{
				const Port = GetNextPort();
				let Socket = new Pop.Websocket.Server(Port);
				this.CurrentSocket = Socket;
				
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

		{
			//	is there a promise waiting for this packet?
			const PeerPromises = this.PeerWaitForCommandPromises[Peer];
			if ( PeerPromises )
			{
				if ( PeerPromises.hasOwnProperty(Packet.Command) )
				{
					//	pop it off
					const ReplyPromise = PeerPromises[Packet.Command];
					delete PeerPromises[Packet.Command];
					ReplyPromise.Resolve(Packet);
					return;
				}
			}
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
		this.CurrentSocket.Send(Peer,Message);
	}
	
	DisconnectPeer(Peer)
	{
		for ( let [Player,PlayerPeer] of Object.entries(this.PlayerPeers) )
		{
			if ( PlayerPeer != Player )
				continue;
			if ( PlayerPeer == Peer )
				this.PlayerPeers[Player] = null;
		}
		this.CurrentSocket.Disconnect(Peer);
	}
	
	OnPeerTryJoin(Peer)
	{
		Pop.Debug(`Peer ${Peer} trying to join`);
		//	make a promise
		const OnJoinPromise = Pop.CreatePromise();
		async function HandleJoin()
		{
			try
			{
				const Player = await OnJoinPromise;
				Pop.Debug(`OnPeerJoin resolved; Peer=${Peer} is Player=${Player}`);
				if ( !Player )
					throw `OnJoinPromise didn't return a player handle (${Player})`;
				//	notify player they're in
				const Notify = {};
				Notify.Command = 'JoinReply';
				Notify.Player = Player;
				this.SendToPeer(Peer,Notify);
				this.PlayerPeers[Player] = Peer;
				Pop.Debug(`Peer(${Peer}) joined ${Player}`);
			}
			catch(e)
			{
				Pop.Debug(`Join error, rejecting; ${e}`);
				//	send error, then kick
				//	notify player they're in
				const Notify = {};
				Notify.Command = 'JoinReply';
				Notify.Error = e;
				this.SendToPeer(Peer,Notify);
				this.DisconnectPeer(Peer);
			}
		}
		HandleJoin.call(this).then().catch(Pop.Debug);
		this.PendingPeers.push(OnJoinPromise);
		//	wake up
		this.PlayerJoinRequestPromiseQueue.Push();
	}
	
	async EnumNewPlayers(TryAddPlayer)
	{
		while(this.PendingPeers.length)
		{
			Pop.Debug(`Enuming new peer...`);
			const NewPeerPromise = this.PendingPeers.shift();
			try
			{
				//	gr: if we're allocating the player, why have it return...
				const PlayerRef = AllocPlayerRef();
				Pop.Debug(`New Player Ref (${PlayerRef}) being added to game...`);
				const Player = await TryAddPlayer(PlayerRef);
				Pop.Debug(`TryAddPlayer result= ${Player}`);
				if ( !Player )
					throw `TryAddPlayer didn't return a player handle (${Player})`;
				Pop.Debug(`Resolving new peer promise ${Player}`);
				NewPeerPromise.Resolve(Player);
			}
			catch(e)
			{
				Pop.Debug(`new player was rejected ${e}`);
				NewPeerPromise.Reject(e);
			}
		}
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
		if ( !this.PlayerPeers.hasOwnProperty(Player) )
			throw `Room doesn't have a player called ${Player}`;
		
		const Peer = this.PlayerPeers[Player];
		if ( !Peer )
			throw `No peer(${Peer}) for player(${Player})`;
		return Peer;
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
		
		
	async SendToPlayerAndWaitForReply(Player,Move)
	{
		//	it's possible this is called before Player/Peer is set...
		//	so it needs to wait if we know there's a player, but peer not set
		
		const Peer = this.GetPeer(Player);
		const ReplyCommand = 'MoveResponse';
		const Hash = this.CreateRandomHash();
		const ReplyPromise = this.CreatePeerCommandReplyPromise(Peer,ReplyCommand);
		
		const Request = {};
		Request.Command = 'MoveRequest';
		Request.Hash = Hash;
		Request.Move = Move;
		Request.ReplyCommand = ReplyCommand;	//	could swap this for hash
		const RequestStr = JSON.stringify(Request);
		this.SendToPeer(Peer,Request);
		
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

