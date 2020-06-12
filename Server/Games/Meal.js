const Minesweeper_Revealed = '_';
//	burger fries cola
//	pie mash gravy
//	chicken fries gravy
//	pizza salad garlicbread
//	curry rice beer
//	pasta garlicbread wine
const Meals =
{
	'Burger Prince':		['burger','fries','cola'],
	'Babylon Pie':			['pie','mash','gravy'],
	'Kent Fried Chicken':	['chicken','fries','gravy'],
	'Curry Mouse':			['curry','rice','beer']
};
const ActionCards =
[
	'SellMeal'
];

function CreateCardDeck()
{
	const MealPacks = 3;
	const ActionPacks = 4;

	let Deck = [];
	for ( let i=0;	i<MealPacks;	i++ )
	{
		for ( let [MealName,Ingredients] of Object.entries(Meals) )
		{
			Deck.push( ...Ingredients );
		}
	}
	
	for ( let i=0;	i<ActionPacks;	i++ )
	{
		Deck.push(...ActionCards);
	}

	return Deck;
}


class TMealGame extends TGame
{
	constructor()
	{
		super(...arguments);
		
		this.State = this.InitState();
	}
	
	InitState()
	{
		const State = {};
		State.Private = {};

		State.UsedCards = [];
		State.NewCards = CreateCardDeck();
		State.NewCards = Pop.Array.Shuffled(State.NewCards);
		State.PlayerBoards = {};
		State.PlayerHands = {};
		
		return State;
	}
	
	GetPublicState()
	{
		//	get the state, but write in neighbour counts on revealed mines
		const State = Object.assign({},this.State);
		//	todo: filter per player as players need to know their own cards
		State.PlayerHands = null;
		//	hide upcoming cards
		State.NewCards = null;
		
		return super.GetPublicState(State);
	}
	
	PopNewCard()
	{
		if ( this.State.NewCards.length == 0 )
		{
			//	reshuffle the used cards
			this.State.NewCards = Pop.Array.Shuffled(this.State.UsedCards);
			this.State.UsedCards = [];
		}
		
		const NewCard = this.State.NewCards.shift();
		return NewCard;
	}
	
	async InitNewPlayer(PlayerRef)
	{
		//	no limit!
		//	deal new cards
		State.PlayerBoards[PlayerRef] = [];
		State.PlayerHands[PlayerRef] = [];
		for ( let i=0;	i<this.StartingCards;	i++ )
			State.PlayerHands[PlayerRef].push( this.PopNewCard() );
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
		
		function TryPlayCard(Card)
		{
			//	todo: player has 3 moves max
			//	todo: action may require other players to do an action
			//	todo: player can't have more than 7 cards
			
			//	play the action card,
			//	or move card from hand to board
			const EndTurn = this.PlayerPlayCard(NextPlayer,Card);
			if ( EndTurn )
				this.EndPlayerTurn(NextPlayer);	//	move to next player
			
			//	reply with move data send to all players
			const ActionRender = {};
			ActionRender.Player = NextPlayer;
			ActionRender.Debug = `Player ${NextPlayer} played ${Card}`;
			ActionRender.Card = Card;
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

		const Size = this.GetSize();
		const Width = Size[0];
		const Height = Size[1];
		const xs = CreateArrayRange(0,Width);
		const ys = CreateArrayRange(0,Height);
		Move.Actions.PickCoord = {};
		Move.Actions.PickCoord.Lambda = TryPickCoord.bind(this);
		Move.Actions.PickCoord.Arguments = [xs,ys];
		
		Move.Forfeit = ForfeitMove.bind(this);
		
		return Move;
	}
	
	//	return false, or array of players. multiple=draw
	GetWinner()
	{
		//	count mines
		const MineCount = this.GetMineCount();
		
		//	count scores
		const Scores = this.GetPlayerScores();
		let PublicMineCount = 0;
		let BestScore = 0;
		let BestPlayers = [];
		for ( let [Player,Score] of Object.entries(Scores) )
		{
			PublicMineCount += Score;
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
		
		if ( PublicMineCount < MineCount )
			return false;
		
		return BestPlayers;
	}
}
