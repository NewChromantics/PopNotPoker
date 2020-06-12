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


class TMealDealGame extends TGame
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
		this.State.PlayerBoards[PlayerRef] = [];
		this.State.PlayerHands[PlayerRef] = [];
	}
	
	HasEnoughPlayers()
	{
		if ( this.Players.length == 0 )
			return false;
		return true;
	}
	
	
	async RunGame(SendMoveAndWait,OnStateChanged,OnAction)
	{
		Pop.Debug(`RunGame this=${JSON.stringify(this)}`);
		while(true)
		{
			const Player = this.GetCurrentPlayer();

			//	get 2 new cards
			for ( let i=0;	i<2;	i++ )
			{
				const Card = this.PopNewCard();
				this.State.PlayerHands[Player].push(Card);
				OnStateChanged();
			}
			
			//	let player play 3 cards
			for ( let i=0;	i<3;	i++ )
			{
				//	get player choice
				//	if food, place
				//	if action, run action
				//		does it need other players response
				//	if forfeit, break;
			}
			//	if player has too many cards, do a move to ditch N cards
			
			//	check if theyve won
			//	go to next player
		}
		
		//	return winner
	}
	
	
	
}
