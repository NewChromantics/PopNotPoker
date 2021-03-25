const HazardsWeighted = {};
HazardsWeighted.Zombie = 2;
HazardsWeighted.Snake = 2;
HazardsWeighted.Ghost = 2;
HazardsWeighted.Werewolf = 2;

const RewardsWeighted = {};
RewardsWeighted.Coins1 = 4;
RewardsWeighted.Coins2 = 4;
RewardsWeighted.Coins3 = 4;
RewardsWeighted.Coins5 = 4;
RewardsWeighted.Coins10 = 1;

const Move_Stay = 'Stay';
const Move_Flee = 'Flee';

function IsHazard(Card)
{
	const HazardNames = Object.keys(HazardsWeighted);
	return HazardNames.includes(Card);
}

function GetCardValue(Card)
{
	switch(Card)
	{
		case 'Coins1':	return 1;
		case 'Coins2':	return 2;
		case 'Coins3':	return 3;
		case 'Coins5':	return 5;
		case 'Coins10':	return 10;
		default:	return 0;
	}
}

function CreateDeck()
{
	let Deck = [];
	
	for ( let Hazard of Object.keys(HazardsWeighted) )
	{
		const Count = HazardsWeighted[Hazard];
		for ( let i=0;	i<Count;	i++ )
			Deck.push(Hazard);
	}
	
	for ( let Reward of Object.keys(RewardsWeighted) )
	{
		const Count = RewardsWeighted[Reward];
		for ( let i=0;	i<Count;	i++ )
			Deck.push(Reward);
	}
	
	Pop.Array.Shuffle(Deck);
	return Deck;
}

class TLooterRules
{
	constructor()
	{
		this.GameEndPointCount = 100;
	}
};

class TPathEntry
{
	constructor(Card)
	{
		this.Card = Card;
		this.LeftoverCoins = 0;
	}
}

class TPlayerEntry
{
	constructor()
	{
		this.Coins = 0;
		this.Playing = true;
	}
}

class TLooterGame extends TGame
{
	constructor()
	{
		super(...arguments);
		
		this.Rules = new TLooterRules();
		this.State = {};
	}
	
	InitState()
	{
		const State = {};
		
		//	path of cards & leftover coins
		State.Path = [];	//	TPathEntrys
		
		State.Players = {};	//	playerhash = TPlayerEntry
		
		for ( let Player of this.Players )
		{
			State.Players[Player] = new TPlayerEntry();
		}
		
		return State;
	}
	
	GetPublicState()
	{
		const State = Object.assign({},this.State);

		//	remove .private
		return super.GetPublicState(this.State);
	}
		
	async InitNewPlayer(PlayerRef)
	{
		throw `InitNewPlayer not used any more?`;
		//this.State.Players[PlayerRef] = new TPlayerEntry();
	}
	
	HasEnoughPlayers()
	{
		if ( this.Players.length < 1 )
			return false;
		return true;
	}
	
	PathHasTwoHazards()
	{
		let HazardCounts = {};	//	[Hazard]
		for ( let PathEntry in this.State.Path )
		{
			if ( !IsHazard(PathEntry.Card) )
				continue;
			HazardCounts[PathEntry.Card] = (HazardCounts[PathEntry.Card] || 0) + 1;
			if ( HazardCounts[PathEntry.Card] >= 2 )
				return true;
		}
		return false;
	}
	
	ActivePlayersLose()
	{
		//	2x hazard on path, all active players flee and lose their coins!
		for ( let Player of Object.values(this.State.Players) )
		{
			if ( !Player.Playing )
				continue;
			
			//	player still in, lose coins
			Player.Coins = 0;
		}
	}
	
	
	async WaitForPlayerStayOrFlee(Player,SendMoveAndWait)
	{
		function HandleStayOrFlee(StayOrFlee)
		{
			Pop.Debug(`HandleStayOrFlee(${StayOrFlee})`);
			if ( StayOrFlee != Move_Stay && StayOrFlee != Move_Flee )
				throw `StayOrFlee(${StayOrFlee}) not flee or stay`;
			return StayOrFlee;
		}
		
		while(true)
		{
			const Move = {};
			Move.Player = Player;
			Move.Actions = {};
			
			Move.Actions.StayOrFlee = {};
			Move.Actions.StayOrFlee.Lambda = HandleStayOrFlee.bind(this);
			Move.Actions.StayOrFlee.Arguments = [[Move_Stay,Move_Flee]];
			
			//	if this throws, player cannot complete move
			const Reply = await SendMoveAndWait(Player,Move);
			
			//	execute reply
			try
			{
				Pop.Debug(`Executing reply; Reply=${JSON.stringify(Reply)}`);
				//	gr: add arguments if missing
				Reply.ActionArguments = Reply.ActionArguments || [];
				const MoveActionName = Reply.Action;
				const Lambda = Move.Actions[MoveActionName].Lambda;
				const Result = Lambda(...Reply.ActionArguments);
				Pop.Debug(`Move lambda result=${Result}`);
				return Result;
			}
			catch(e)	//	error with lambda
			{
				//	error executing the move lambda, so illegal move
				//	try again by resending request
				//	notify user with extra meta
				Pop.Debug(`Last move error; ${e} trying again`);
				const Error = {};
				Error.Player = Player;
				Error.BadMove = `${e}`;	//	catch typeerrors etc as strings otherwise they show as {}
				OnAction(Error);
				continue;
			}
		}
	}
	
	GetActivePlayerHashs()
	{
		Pop.Debug('GetActivePlayerHashs');
		let ActivePlayers = [];
		for ( let PlayerHash of Object.keys(this.State.Players) )
		{
			const PlayerState = this.State.Players[PlayerHash];
			if ( !PlayerState.Playing )
				continue;
			
			ActivePlayers.push(PlayerHash);
		}
		return ActivePlayers;
	}
	
	async WaitForActivePlayersToStayOrFlee(SendMoveAndWait,OnAction)
	{
		//	we want this to work simultaneously, so we could keep looping until every player decides
		//	and assume networking goes too fast to let them undecide
		//	we would need to invalidate/double check
			
		//	as this is async, we can send them all out at once, then wait for them all to finish
		const PlayerHashs = this.GetActivePlayerHashs();
		let PlayerChoicePromises = {};	//	[PlayerHash]
			
		for ( let PlayerHash of PlayerHashs )
		{
			const PlayerChoicePromise = this.WaitForPlayerStayOrFlee(PlayerHash,SendMoveAndWait);
			PlayerChoicePromises[PlayerHash] = PlayerChoicePromise;
		}
			
		//	wait for all to respond
		await Promise.allSettled( Object.values(PlayerChoicePromises) );
			
		//	make a list of anyone who leaves
		let FleeingPlayers = [];
		for ( let PlayerHash of PlayerHashs )
		{
			let StayOrFlee = Move_Flee;
			const StayOrFleePromise = PlayerChoicePromises[PlayerHash];
			try
			{
				StayOrFlee = await StayOrFleePromise;
				Pop.Debug(`choice was ${StayOrFlee} (promise=${StayOrFleePromise}) PlayerChoicePromises=${JSON.stringify(PlayerChoicePromises)}`);
			}
			catch(e)
			{
				Pop.Debug(`Player ${PlayerHash} failed to complete move (${e}), defaulting to flee`);
			}
			if ( StayOrFlee == Move_Flee )
				FleeingPlayers.push(PlayerHash);
			
			const ActionRender = {};
			ActionRender.Player = PlayerHash;
			ActionRender.Debug = `Player ${PlayerHash} chose ${StayOrFlee}`;
			ActionRender.StayOrFlee = StayOrFlee;
			OnAction(ActionRender);
		}
		return FleeingPlayers;
	}
	
	GetPathCoinCount()
	{
		//	count all the coins uncollected on the path
		let PathCoins = 0;
		for ( let PathEntry of this.State.Path )
		{
			PathCoins += PathEntry.Coins;
		}
		return PathCoins;
	}
	
	RemoveCoinsFromPath(CoinCount)
	{
		//	from oldest to newest, remove leftover coins (they're being picked up)
		let PathCoins = 0;
		for ( let PathEntry of this.State.Path )
		{
			let Remove = Math.min( CoinCount, PathEntry.Coins );
			CoinCount -= Remove;
			PathEntry.Coins -= Remove;
		}
	}	
	
	async RunGame(SendMoveAndWait,OnStateChanged,OnAction)
	{
		const Deck = CreateDeck();
		Pop.Debug(`Deck=${Deck}`);

		this.State = this.InitState();
		
		while ( !this.GetWinner() )
		{
			await Pop.Yield(0);	//	gr: we should force this with GetCurrentPlayer or GetWinner. We need this gap to allow player changes externally
			OnStateChanged();
			
			//	out of cards!
			//	need to make all players split the gold
			//	gr: does this ever happen? must hit 2 hazards before this does
			if ( Deck.length == 0 )
				break;
			
			//	check in case everyone has left
			{
				const ActivePlayers = this.GetActivePlayerHashs();
				if ( ActivePlayers.length == 0 )
				{
					Pop.Debug(`No active players, ending game`);
					break;
				}
			}
			
			//	reveal card on path
			const NextCard = Deck.shift();
			const PathEntry = new TPathEntry(NextCard);
			this.State.Path.push(PathEntry);
			OnStateChanged();
			
			//	if we have 2 of the same hazard, the game ends
			if ( this.PathHasTwoHazards() )
			{
				//	players who havent left, lose their coins
				this.ActivePlayersLoseCoins();
				OnStateChanged();
				break;
			}
			
			//	we divide up the cash on the new card between players now
			//	and save remainder on the card
			{
				let ActivePlayers = this.GetActivePlayerHashs();
				let CardValue = GetCardValue(PathEntry.Card);
				//	coins left on the path are the remainder that doesn't split
				PathEntry.Coins = CardValue % ActivePlayers.length;
				OnStateChanged();

				CardValue -= PathEntry.Coins;
				const CoinEach = Math.floor(CardValue / ActivePlayers.length);
				//	card value is now divisible by players
				//	give 0,1,2 etc to each
				for ( let Player of ActivePlayers )
				{
					Pop.Debug(`Dividing up ${CoinEach} ${Player}`);
					this.State.Players[Player].Coins += CoinEach;
				}
				OnStateChanged();
			}
				
			//	now we want to know if players leave or stay
			const FleeingPlayers = await this.WaitForActivePlayersToStayOrFlee(SendMoveAndWait,OnAction);
						
			//	flee players, but they collect & split remaining coins between them
			if ( FleeingPlayers.length > 0 )
			{
				let PathCoinCount = this.GetPathCoinCount();
				//	evenly remove
				PathCoinCount -= PathCoinCount % FleeingPlayers.length;
				let PathCoinEach = Math.floor(PathCoinCount / FleeingPlayers.length);
				//	give coins to each player and let them leave
				for ( let Player of FleeingPlayers )
				{
					Pop.Debug(`Fleeing player ${Player}`);
				
					this.State.Players[Player].Coins += PathCoinEach;
					this.State.Players[Player].Playing = false;
					this.RemoveCoinsFromPath(PathCoinEach);
					OnStateChanged();
				}
			}
			
		}
		
		Pop.Debug(`Game finished`);
		
		const Winner = this.GetWinner();
		return Winner;
	}
	
	
	//	return false, or array of players. multiple=draw
	GetWinner()
	{
		//	whilst players are playing, there's no winner
		const ActivePlayers = this.GetActivePlayerHashs();
		Pop.Debug(`GetWinner activeplayers=${ActivePlayers}`);
		if ( ActivePlayers.length > 0 )
			return false;

/*	
		//	not got any players yet! not sure how we get here
		if ( !this.HasEnoughPlayers() )
		{
			Pop.Debug(`GetWinner with !HasEnoughPlayers shouldn't reach here?`);
			return false;
		}
		*/
	
		//	count scores
		let BestScore = 0;
		let BestPlayers = [];
		for ( let Player of Object.keys(this.State.Players) )
		{
			let Score = this.State.Players[Player].Coins;
			
			if ( Score > BestScore )
			{
				BestPlayers = [Player];
				BestScore = Score;
			}
			else if ( Score == BestScore )
			{
				BestPlayers.push(Player);
			}
		}
	
		return BestPlayers;
	}
}
