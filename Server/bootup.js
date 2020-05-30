Pop.Debug("PopNotPoker server booting up");

Pop.Include = function(Filename)
{
	const Source = Pop.LoadFileAsString(Filename);
	return Pop.CompileAndRun( Source, Filename );
}
Pop.Include('PopEngineCommon/PopApi.js');


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
		Move.Commands = [];

		function TryPickANumber(Number)
		{
			if ( !this.State.hasOwnProperty(Number) )
				throw `Not a valid number ${Number}`;
			if ( this.State[Number] !== null )
				throw `Number ${Number} already picked`;
			
			const PickingPlayer = this.CurrentPlayerIndex
			this.State[Number] = PickingPlayer;
			this.CurrentPlayerIndex = (this.CurrentPlayerIndex+1)%this.Players.length;
			
			//	reply with move data send to all players
			const ActionRender = {};
			ActionRender.Player = PickingPlayer;
			ActionRender = `Player ${PickingPlayer} picked ${Number}`;
			return ActionRender;
		}
		
		Move.Commands.PickNumber = TryPickANumber.bind(this);
		return Move;
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
	const State = Game.GetState();
	
	//	send state to all players
	Room.SendToAllPlayers('State',StateNotify);

	async function WaitForValidReply()
	{
		//	send next move to player who's move it is
		while ( true )
		{
			try
			{
				//	wait for the reply and process it
				const Reply = await SendToPlayerAndWaitForReply(NextMove.Player, NextMove);
				const Action = NextMove.Commands[Reply.Commands](...Reply.CommandArgs);
				return Action;
			}
			catch(e)
			{
				//	on error, we could notify everyone else
				//	loop and send the move again
				//	todo: catch players disconnecting, reply timeout (ie, time limited moves)
				Pop.Debug(`Player move reply failed: ${e}. Try again`);
			}
		}
	}
	
	//	do the move, grab the resulting movement when finished
	const Action = await WaitForValidReply();
	
	//	send something showing what their [public] move was
	{
		SendToAllPlayers('State',NewState);
		SendToAllPlayers('Action',ActionNotify);
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
			await Room.EnumNewPlayers( Game.AddPlayer );
			
			//	todo: check for all players quit
			//	do a game iteration and see if it's finished
			const EndOfGame = await GameIteration(Game,Room);
			if ( !EndOfGame )
				continue;
		}
		
	}
}

class LobbyWebSocketServer
{
	constructor(ListenPorts)
	{
		//	whatever abstraction this is
		this.PendingPlayers = [];
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
					this.OnPacket(Packet.Peer,Packet.Data);
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
		
		if ( Packet.Command )
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
					return ReplyPromise;
				}
			}
		}
		
		throw `Unhandled packet ${Data}`;
	}
	
	async WaitForPlayerJoinRequest()
	{
		return this.PlayerJoinRequestPromiseQueue.WaitForNext();
	}
	
	async EnumNewPlayers(TryAddPlayer)
	{
		while(this.PendingPlayers.length)
		{
			const NewPlayer = this.PendingPlayers.shift();
			try
			{
				const Something = await TryAddPlayer();
				NewPlayer.Resolve(Something);
			}
			catch(e)
			{
				Pop.Debug(`new player was rejected ${e}`);
				NewPlayer.Reject(e);
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
		throw `Todo; get peer from player ${Player}`;
	}
	
	CreateRandomHash(Length=4)
	{
		//	generate string of X characters
		const AnArray = new Array(Length);
		const Numbers = [...AnArray];
		//	pick random numbers from a-z (skipping 0-10)
		const RandNumbers = Numbers.map( Math.floor(Math.random()*26) );
		const RandAZNumbers = RandNumbers.map(i=>i+10);
		//	turn into string with base36(10+26)
		const RandomString = RandAZNumbers.toString(36).toUpperCase();
		return RandomString;
	}
	
	CreatePeerCommandReplyPromise(Peer,Command)
	{
		if ( !this.PeerWaitForCommandPromises.hasOwnProperty(Peer) )
		{
			this.PeerWaitForCommandPromises[Peer] = {};
		}
		const PeerPromises = this.PeerWaitForCommandPromises[Peer];
		if ( PeerPromises.hasOwnProperty(ReplyCommand) )
		{
			throw `Peer (${Peer}) command(${ReplyCommand}) reply promise already exists`;
		}
		const NewPromise = Pop.CreatePromise();
		this.PeerWaitForCommandPromises[Peer][ReplyCommand] = NewPromise
		return NewPromise;
	}
		
		
	async SendToPlayerAndWaitForReply(Player,Move)
	{
		const Peer = this.GetPeer(Player);
		const ReplyCommand = 'MoveResponse';
		const Hash = this.CreateRandomHash();
		const ReplyPromise = this.CreatePeerCommandReplyPromise(Peer,ReplyCommand);
		
		const Request = {};
		Request.Command = 'MoveRequest';
		Request.Hash = Hash;
		Request.Move = Move;
		const RequestStr = JSON.stringify(Request);
		
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

