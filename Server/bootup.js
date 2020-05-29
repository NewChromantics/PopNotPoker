Pop.Debug("PopNotPoker server booting up");

Pop.Include = function(Filename)
{
	const Source = Pop.LoadFileAsString(Filename);
	return Pop.CompileAndRun( Source, Filename );
}
Pop.Include('PopEngineCommon/PopApi.js');



class TGame
{
	this.Players = [];
	
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
	constructor()
	{
		//	whatever abstraction this is
		this.PendingPlayers = [];
		this.PlayerJoinRequestPromiseQueue = new Pop.PromiseQueue();
	}
	
	async WaitForPlayerJoinRequest()
	{
		return PlayerJoinRequestPromiseQueue.WaitForNext();
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
		throw `todo`;
	}
	
	async SendToPlayerAndWaitForReply(Player,Move)
	{
		throw `todo`;
	}
}

{
	const Room = new LobbyWebSocketServer();
	RunGameLoop(Room).catch(Pop.Debug);
}

