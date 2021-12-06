import Game from './Game.js'
import {ShuffleArray} from '../PopEngineCommon/PopApi.js'

function CreateArrayRange(First,Last)
{
	const Length = Last - First;
	const a = Array.from({length:Length},(v,k)=>k+First);
	return a;
}


class TDictionary
{
	constructor()
	{
		//	load dictionary json
		const DictionaryJsonString = Pop.LoadFileAsString('Games/Boggle/Dictionary_EnglishUk.json');
		const DictionaryJson = JSON.parse(DictionaryJsonString);
		this.Dictionary = DictionaryJson;
	}
	
	IsWord(Word)
	{
		const Key = Word.toLowerCase();
		if ( !this.Dictionary.hasOwnProperty(Key) )
			return false;
			
		return true;
	}
}


//	weight letters that appear.
//	todo: allow alteration via rules
const WeightedAlphabet = 
{
"aeiou":4,
"bcdfghiklmnprstvwy":3,
"jqxz":1
};
function GetWeightedAlphabetLetterPool(WeightedAlphabet)
{
	let Pool = [];	//	total jumble of letters
	
	function EnumLetter(Letter,Multiply)
	{
		for ( let i=0;	i<Multiply;	i++ )
			Pool.push(Letter);
	}
	
	function EnumLetterSet(LetterSet)
	{
		const Multiply = WeightedAlphabet[LetterSet];
		const Letters = LetterSet.split('');
		Letters.forEach( l => EnumLetter(l,Multiply) );
	}
	
	const LetterSets = Object.keys(WeightedAlphabet);
	LetterSets.forEach( EnumLetterSet );
	
	return Pool;
}

class TBoggleRules
{
	constructor()
	{
		this.GameEndWordCount = 100;
		this.GameEndPointCount = 100;
		this.MinWordLength = 3;
		this.Dictionary = new TDictionary();
	}
	
	GetBoardAlphabet(LetterCount)
	{
		const LetterPool = GetWeightedAlphabetLetterPool(WeightedAlphabet);
		//	todo; scale weights here? or just generate more pools...
		if ( LetterCount > LetterPool.length )
			throw `Alphabet pool ${LetterPool} too small for LetterCount=${LetterCount}`;
		ShuffleArray(LetterPool);
		return LetterPool.slice(0,LetterCount);
	}
	
	IsValidWord(Word)
	{
		if ( Word.length < this.MinWordLength )
			throw `Word length (${Word.length}) Must be at least ${this.MinWordLength} long`;
			
		if ( !this.Dictionary.IsWord(Word) )
			throw `Word ${Word} not in dictionary`;
			
		return true;
	}
	
	GetWordScore(Word)
	{
		//	could be more sophisticated/bonus giving here
		return Word.length;
	}
}


class BoggleGame extends Game
{
	constructor()
	{
		super(...arguments);
		
		this.Rules = new TBoggleRules();
		this.State = this.InitState();
	}
	
	get GameTypeName()
	{
		return `Boggle`;
	}
	
	InitState()
	{
		const State = {};
		const Width = 6;
		const Height = 6;
		
		State.Private = {};

		//	forbid duplicate words
		State.FoundWords = {};	//	[playedword] = playerhash
		
		//	x*y map
		State.Map = this.Rules.GetBoardAlphabet(Width*Height);
		State.MapWidth = Width;
		
		return State;
	}
	
	GetPublicState()
	{
		const State = Object.assign({},this.State);
		
		//	add scores to state
		State.Scores = this.GetPlayerScores();

		//	remove .private
		return super.GetPublicState(this.State);
	}
	
	GetPlayerScores()
	{
		//	calc player scores
		const Scores = {};
		for ( let [Word,PlayerHash] of Object.entries(this.State.FoundWords) )
		{
			const WordScore = this.Rules.GetWordScore( Word );
			if ( !Scores.hasOwnProperty(PlayerHash) )
				Scores[PlayerHash] = 0;
			Scores[PlayerHash] += WordScore;
		}
		
		return Scores;
	}
	
	async InitNewPlayer(PlayerRef)
	{
	}
	
	HasEnoughPlayers()
	{
		if ( this.Players.length == 0 )
			return false;
		return true;
	}
	
	MapIndexToCoord(Index)
	{
		const x = Index % this.State.MapWidth;
		const y = Math.floor( Index / this.State.MapWidth);
		return [x,y];
	}
	
	CheckMapSequence(MapSequence)
	{
		if ( MapSequence.length < 2 )
			throw `Sequence must be at least 2 indexes`;

		//	check the input sequence
		//	make sure no selections are outside of the map
		{
			const MaxIndex = this.State.Map.length-1; 
			function IsOutOfBounds(Index)
			{
				if ( Index < 0 )		return true;
				if ( Index > MaxIndex )	return true;
				return false;
			}
			if ( MapSequence.some(IsOutOfBounds) )
				throw `A map index is out of bounds ${MapSequence} 0...${MaxIndex}`;
		}

		//	no reusing tiles
		{
			for ( let a=0;	a<MapSequence.length;	a++ )
			{
				for ( let b=a+1;	b<MapSequence.length;	b++ )
				{
					const Indexa = MapSequence[a];
					const Indexb = MapSequence[b];
					if ( Indexa != Indexb )
						continue;
					const TileLetter = this.State.Map[Indexa];
					throw `Tile ${TileLetter} used more than once (${Indexa} & ${Indexb})`;
				}
			}
		}		
	
		//	check indexes need to be next to each other in the map
		const Coords = MapSequence.map( this.MapIndexToCoord.bind(this) );
		for ( let b=1;	b<Coords.length;	b++ )
		{
			const Prev = Coords[b-1];
			const Next = Coords[b];
			const Deltax = Math.abs(Prev[0] - Next[0]);
			const Deltay = Math.abs(Prev[1] - Next[1]);
			
			if ( Deltax == 0 && Deltay == 0 )
				throw `Move ${Prev}...${Next} doesn't move (${Deltax},${Deltay}`;
			if ( Deltax > 1 || Deltay > 1 )
				throw `Move ${Prev}...${Next} moves more than 1 space (${Deltax},${Deltay}`;
		}	
	}
	
	//	return word or throw on error
	HandleMapSequence(MapSequence,PlayerHash)
	{
		this.CheckMapSequence(MapSequence);
		//	extract word
		const Word = MapSequence.map( Index => this.State.Map[Index] ).join('');
		Pop.Debug(`HandleMapSequence word=${Word} (type: ${typeof Word}`);
		
		//	check word is valid
		this.Rules.IsValidWord(Word);
		
		//	check word hasnt been used
		if ( this.State.FoundWords.hasOwnProperty(Word) )
		{
			const ExistingPlayer = this.State.FoundWords[Word];
			throw `${ExistingPlayer} has already found ${Word}`;
		}
		
		//	add player score/found words
		this.State.FoundWords[Word] = PlayerHash;
		return Word;
	}		
		
	async RunGame(SendMoveAndWait,OnStateChanged,OnAction)
	{
		while ( !this.GetWinner() )
		{
			await Pop.Yield(0);	//	gr: we should force this with GetCurrentPlayer or GetWinner. We need this gap to allow player changes externally
			OnStateChanged();
			const Player = this.GetCurrentPlayer();
			
			//	todo: do a "round" so if everyone skips, we reset the board, or end game			
			try
			{
				const LetterSequence = await this.WaitPlayerPickLetterSequenceOrSkip(Player,SendMoveAndWait,OnAction);
				Pop.Debug(`${Player} LetterSequence=${LetterSequence}`);

				OnStateChanged();
				this.EndPlayerTurn(Player);
				continue;
			}
			catch(e)
			{
				//	move can not be completed (eg. player left)
				Pop.Debug(`Move not completed: ${e}`);
				this.EndPlayerTurn(Player);
				continue;
			}
		}
		
		const Winner = this.GetWinner();
		return Winner;
	}
	
	async WaitPlayerPickLetterSequenceOrSkip(Player,SendMoveAndWait,OnAction)
	{
		function TryPickMapSequence(MapSequence0)
		{
			const MapSequence = Array.from(arguments);
			Pop.Debug(`TryPickMapSequence ${JSON.stringify(MapSequence)}`);
			//	validate input
			{
				//	remove trailing empty entries in the sequence (or disallow)
				//	check all inputs are ints
				if ( MapSequence.some( i => Number.isNaN(i) ) )
					throw `An entry in map sequence ${MapSequence} is nan`;
				if ( MapSequence.some( i => !Number.isInteger(i) ) )
					throw `An entry in map sequence ${MapSequence} is non integer`;
			}
			
			const Word = this.HandleMapSequence(MapSequence,Player);
			
			//	report move
			const ActionRender = {};
			ActionRender.Player = Player;
			ActionRender.Debug = `Player ${Player} found ${Word}`;
			ActionRender.MapSequence = MapSequence;
			OnAction(ActionRender);
			
			//	anything but false
			return Word;
		}
		
		function SkipTurn()
		{
			Pop.Debug(`SkipTurn`);
			//	report move
			const ActionRender = {};
			ActionRender.Player = Player;
			ActionRender.Debug = `Player ${Player} skipped turn`;
			OnAction(ActionRender);
			
			return false;
		}
		
		while(true)
		{
			const Move = {};
			Move.Player = Player;
			Move.Actions = {};
			
			Move.Actions.SkipTurn = {};
			Move.Actions.SkipTurn.Lambda = SkipTurn.bind(this);
			Move.Actions.SkipTurn.Arguments = [];
			
			const MapIndexes = CreateArrayRange(0,this.State.Map.length);
			Move.Actions.PickMapSequence = {};
			Move.Actions.PickMapSequence.Lambda = TryPickMapSequence.bind(this);
			//	gr: this array can essentially be WxH length, but just sending some args as a guide for debug UI
			//		should at least send min-word length 
			Move.Actions.PickMapSequence.Arguments = [MapIndexes,MapIndexes,MapIndexes,MapIndexes,MapIndexes,MapIndexes];
		
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
	
	//	return false, or array of players. multiple=draw
	GetWinner()
	{
		let GameFinished = false;
	
		//	have we done the max words?
		const WordsFoundCount = Object.keys(this.State.FoundWords).length;
		if ( WordsFoundCount >= this.Rules.GameEndWordCount )
			GameFinished = true;
			
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
		
		if ( BestScore >= this.Rules.GameEndPointCount )
			GameFinished = true;
		
		if ( !GameFinished )
			return false;
			
		return BestPlayers;
	}
}

export default BoggleGame;
