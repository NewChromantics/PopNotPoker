//	burger fries cola
//	pie mash gravy
//	chicken fries gravy
//	pizza salad garlicbread
//	curry rice beer
//	pasta garlicbread wine
const Meals =
{
	'Burger Prince':		['burger','fries','onion rings'],
	'Babylon Pie':			['pie','mash','gravy'],
	'Kent Fried Chicken':	['chicken','fries','gravy'],
	'Curry Mouse':			['curry','rice','poppadoms'],
	'Pizza slut':			['pizza','salad','onion rings']
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
	
	AddPlayer(Player)
	{
		const Meta = super.AddPlayer(Player);
		
		Pop.Debug(`AddPlayer ${Player} this=${this}`);
		this.State.PlayerBoards[Player] = [];
		this.State.PlayerHands[Player] = [];
		
		//	start with 5 cards
		for ( let i=0;	i<5;	i++ )
		{
			const Card = this.PopNewCard();
			this.State.PlayerHands[Player].push(Card);
		}
		
		return Meta;
	}
	
	HasEnoughPlayers()
	{
		if ( this.Players.length == 0 )
			return false;
		return true;
	}
	
	//	generic!
	async ExecuteMove(Player,SendMoveAndWait,OnAction,Move)
	{
		while(true)
		{
			//	if this throws, move couldn't be executed
			const Reply = await SendMoveAndWait(Player,Move);
			
			//	execute reply
			try
			{
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
				Error.BadMove = e;
				OnAction(Error);
				continue;
			}
		}
	}
	
	async WaitPlayerPickCard(Player,SendMoveAndWait,OnAction)
	{
		function PlayCard(Card)
		{
			//	just validate its one of their cards and return it
			const PlayerHand = this.State.PlayerHands[Player];
			const IsInPlayerHand = PlayerHand.some( c => c == Card );
			if ( !IsInPlayerHand )
				throw `Player tried to play card ${Card} they dont have (${PlayerHand})`;
			return Card;
		}
		
		const Move = {};
		Move.Player = Player;
		Move.Actions = {};
		
		Move.Actions.SkipGo = {};
		Move.Actions.SkipGo.Lambda = function(){	return false;	}
		Move.Actions.SkipGo.Arguments = [];
		
		const PlayerHand = this.State.PlayerHands[Player];
		Move.Actions.PlayCard = {};
		Move.Actions.PlayCard.Lambda = PlayCard.bind(this);
		Move.Actions.PlayCard.Arguments = [PlayerHand];
		
		const Result = await this.ExecuteMove(Player,SendMoveAndWait,OnAction,Move);
		return Result;
	}
	
	//	return the card played, just so we know if they end their turn with false
	async WaitForPlayedCard(Player,SendMoveAndWait,OnAction)
	{
		Pop.Debug(`WaitForPlayedCard ${Player}`);
		//	make player pick one of their cards
		const PickedCard = await this.WaitPlayerPickCard(Player,SendMoveAndWait,OnAction);
		
		//	skipped turn
		if ( PickedCard === false )
			return false;
			
		//	if food, place on deck
		if ( true )
		{
			this.State.PlayerBoards[Player].push(PickedCard);
			
			const Action = {};
			Action.Debug = 'Player placed card';
			OnAction(Action);
		}
		else
		{
			//	if action, run action
			//		does it need other players response
		}
	}

	async RunGame(SendMoveAndWait,OnStateChanged,OnAction)
	{
		while ( !this.GetWinner() )
		{
			const Player = this.GetCurrentPlayer();

			//	get 2 new cards
			for ( let i=0;	i<2;	i++ )
			{
				Pop.Debug(`rungame player=${Player} ${JSON.stringify(this.State.PlayerHands)}`);
				const Card = this.PopNewCard();
				this.State.PlayerHands[Player].push(Card);
			}
			{
				const Action = {};
				Action.Debug = 'Player got 2 new cards';
				OnAction(Action);
			}
			
			//	let player play 3 cards
			for ( let i=0;	i<3;	i++ )
			{
				//	get player choice
				const PlayedCard = await this.WaitForPlayedCard(Player,SendMoveAndWait,OnAction);

				//	if forfeit
				if ( !PlayedCard )
					break;
			}
			//	if player has too many cards, do a move to ditch N cards
			
			//	go to next player
			this.EndPlayerTurn(Player);
		}
		
		//	return winner
		return this.GetWinner();
	}
	
	GetWinner()
	{
		return false;
	}
	
}
