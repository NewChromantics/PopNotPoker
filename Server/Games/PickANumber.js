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
	
	GetPublicState()
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
