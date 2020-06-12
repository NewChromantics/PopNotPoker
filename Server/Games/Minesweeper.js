const Minesweeper_Revealed = '_';
const Minesweeper_Hidden = '?';
const Minesweeper_Mine = 'X';
const Minesweeper_Empty = 'E';	//	before assigning neighbour countin secret map

function CreateArrayRange(First,Last)
{
	const Length = Last - First;
	const a = Array.from({length:Length},(v,k)=>k+First);
	return a;
}

function MakeDoubleArray(Width,Height,GetInitCell)
{
	const Grid = new Array(Width);
	for ( let x=0;	x<Grid.length;	x++ )
	{
		Grid[x] = new Array(Height);
		for ( let y=0;	y<Grid[x].length;	y++ )
		{
			Grid[x][y] = GetInitCell(x,y);
		}
	}
	return Grid;
}

function GetInt2Range(Sizex,Sizey)
{
	const All = [];
	for ( let x=0;	x<Sizex;	x++ )
		for ( let y=0;	y<Sizey;	y++ )
			All.push(int2(x,y));
	return All;
}

function GetNeighbourCount(x,y,Map)
{
	const Size = GetDoubleArraySize(Map);
	const w = Size[0];
	const h = Size[1];
	let CheckedMines = [];
	function IsMine01(xoff,yoff)
	{
		const xx = x+xoff;
		const yy = y+yoff;
		if ( xx<0 || xx>=w || yy<0 || yy>=h )
			return 0;
		const Cell = Map[xx][yy];
		CheckedMines.push(Cell);
		if ( Cell !== Minesweeper_Mine )
			return 0;		
		return 1;
	}
	let MineCount = 0;
	MineCount += IsMine01(-1,-1);
	MineCount += IsMine01( 0,-1);
	MineCount += IsMine01( 1,-1);
	MineCount += IsMine01(-1, 0);
	//MineCount += IsMine01( 0, 0);
	MineCount += IsMine01( 1, 0);
	MineCount += IsMine01(-1, 1);
	MineCount += IsMine01( 0, 1);
	MineCount += IsMine01( 1, 1);
	
	//Pop.Debug(`Counted ${CheckedMines} == ${MineCount}`);
	
	return MineCount;
}

function WriteNeighbourCounts(Map)
{
	const Size = GetDoubleArraySize(Map);
	const w = Size[0];
	const h = Size[1];
	for ( let x=0;	x<w;	x++ )
	{
		for ( let y=0;	y<h;	y++ )
		{
			const Cell = Map[x][y];
			if ( Cell !== Minesweeper_Empty )
				continue;
			const Count = GetNeighbourCount(x,y,Map);
			Map[x][y] = Count;
		}
	}
}


function InitGameMap(Size,SafePosition,MineCount)
{
	//	work out mine positions
	const AllMinePositions = GetInt2Range(...Size);
	//	filter out safe ones
	let PossibleMinePositions = AllMinePositions.filter( p => !MatchInt2(p,SafePosition) );
	if ( PossibleMinePositions.length == AllMinePositions.length )
		throw `Didn't filter out safe position; ${SafePosition}`;
	//	pop random positions
	let MinePositions = [];
	for ( let i=0;	i<MineCount;	i++ )
	{
		const Index = Math.floor( Math.random() * PossibleMinePositions.length );
		const Popped = PossibleMinePositions.splice( Index, 1 )[0];
		MinePositions.push( Popped );
	}
	
	function IsMinePos(x,y)
	{
		const xy = int2(x,y);
		return MinePositions.some( Pos => MatchInt2(Pos,xy) );
	}
	
	function InitCell(x,y)
	{
		//	? = not revealed
		//	M = mine
		const IsMine = IsMinePos(x,y);
		return IsMine ? Minesweeper_Mine : Minesweeper_Empty;
	}
	
	const Map = MakeDoubleArray( Size[0], Size[1], InitCell );
	
	//	pre-calc the neighbour counts
	//	could do it live in case we bake bad data?
	WriteNeighbourCounts(Map);
	//Pop.Debug(`Map with GetNeighbourCount: ${JSON.stringify(Map,null,'\t')}`);
	return Map;
}

function DoubleArray_Map(SourceDoubleArray,Replace)
{
	function MapCol(Col,x)
	{
		function MapRow(Value,y)
		{
			return Replace(Value,x,y);
		}
		return Col.map(MapRow);
	}
	const NewDoubleArray = SourceDoubleArray.map( MapCol );
	return NewDoubleArray;
}

function GetDoubleArraySize(Array)
{
	const Width = Array.length;
	const Height = Array[0].length;
	return [Width,Height];
}

function int2(x,y)
{
	const xy = {};
	xy.x = x;
	xy.y = y;
	return xy;
}

function MatchInt2(a,b)
{
	return a.x === b.x && a.y === b.y;
}

function IsUnrevealed(Map,xy)
{
	const Cell = Map[xy.x][xy.y];
	console.log(`IsUnrevealed(${Cell})`);
	return Cell === Minesweeper_Hidden;
}

function IsMine(Map,xy)
{
	const Cell = Map[xy.x][xy.y];
	return Cell === Minesweeper_Mine;
}

//	probably should re-use clickcoord...
function FloodReveal(Map,x,y)
{
	const Cell = Map[x][y];
	//	already exposed
	if ( Cell !== Minesweeper_Hidden )
		return;
	
	//	reveal it
	Map[x][y] = Minesweeper_Revealed;
	/*
	 const SafeClick = async function(x,y)
	 {
	 try
	 {
	 await this.ClickCoord([x,y]);
	 }
	 catch(e)
	 {
	 }
	 }.bind(this);
	 
	 //	click neighbours
	 await SafeClick(x-1,y-1);
	 await SafeClick(x+0,y-1);
	 await SafeClick(x+1,y-1);
	 await SafeClick(x-1,y+0);
	 //SafeClick(x+0,y+0);
	 await SafeClick(x+1,y+0);
	 await SafeClick(x-1,y+1);
	 await SafeClick(x+0,y+1);
	 await SafeClick(x+1,y+1);
	 */
}

class TMinesweeperGame extends TGame
{
	constructor()
	{
		super(...arguments);
		
		this.State = this.InitState();
	}
	
	InitState()
	{
		const State = {};
		const Width = 10;
		const Height = 10;
		
		//	the secret map just says where unrevealed mines (M) are
		//	or the playerref of who revealed it.
		//	or a number is the neighbour count
		State.Private = {};
		State.Private.Map = null;
		
		//	the visible map shows what's known;
		//	revealed mine (PlayerId)
		//	unrevealed (?)
		//	or revealed (_)
		//	initial cell is unknown, we reveal on first move
		function GetInitCell(x,y)
		{
			return Minesweeper_Hidden;
		}
		State.Map = MakeDoubleArray(Width,Height,GetInitCell);
		
		return State;
	}
	
	GetSize()
	{
		return GetDoubleArraySize(this.State.Map);
	}

	GetMineCount()
	{
		return 10;
	}
	
	GetPublicState()
	{
		const PrivateMap = this.State.Private.Map;
		function ReplaceRevealedWithNeighbourCount(Value,x,y)
		{
			//	replace revealed cells with neighbour count
			if ( Value != Minesweeper_Revealed )
				return Value;
			const Neighbours = PrivateMap[x][y];
			return Neighbours;
		}
		
		//	get the state, but write in neighbour counts on revealed mines
		const State = Object.assign({},this.State);
		if ( PrivateMap )
			State.Map = DoubleArray_Map( State.Map, ReplaceRevealedWithNeighbourCount );
		
		//	add scores to state
		State.Scores = this.GetPlayerScores();
		
		return super.GetPublicState(State);
	}
	
	GetPlayerScores()
	{
		const Scores = {};
		function EnumCell(Cell,x,y)
		{
			if ( Cell == Minesweeper_Revealed )
				return;
			if ( Cell == Minesweeper_Hidden )
				return;
			//	else cell must be a player name
			Scores[Cell] = (Scores[Cell]||0)+1;
		}
		DoubleArray_Map( this.State.Map, EnumCell.bind(this) );
		return Scores;
	}
	
	async InitNewPlayer(PlayerRef)
	{
		//	no limit!
	}
	
	HasEnoughPlayers()
	{
		if ( this.Players.length == 0 )
			return false;
		return true;
	}
	
	//	return true if bomb clicked
	HandleClick(x,y,Player)
	{
		const Size = this.GetSize();
		const Width = Size[0];
		const Height = Size[1];
		
		if ( x < 0 || x >= Width )	throw `x:${x} out of range 0...${Width}`;
		if ( y < 0 || y >= Height )	throw `y:${y} out of range 0...${Height}`;
		const xy = int2(x,y);
		
		//	first click initialises
		if ( !this.State.Private.Map )
		{
			this.State.Private.Map = InitGameMap( GetDoubleArraySize(this.State.Map), xy, this.GetMineCount() );
		}
		
		if ( !IsUnrevealed(this.State.Map,xy) )
		{
			//	invalid move
			//	don't advance
			throw 'Clicking already revealed cell';
		}
		else if ( IsMine(this.State.Private.Map,xy) )
		{
			//	click the secret cell and update the map
			this.State.Private.Map[xy.x][xy.y] = Player;
			this.State.Map[x][y] = Player;
			return true;
		}
		else
		{
			//	reveal via floodfill
			FloodReveal(this.State.Map,x,y);
			return false;
		}
	}
	
	async RunGame(SendMoveAndWait,OnStateChanged,OnAction)
	{
		while ( !this.GetWinner() )
		{
			Pop.Debug(`Iteration`);
			OnStateChanged();
			const Player = this.GetCurrentPlayer();
			
			try
			{
				const PickedBomb = await this.WaitPlayerPickCoord(Player,SendMoveAndWait,OnAction);
				Pop.Debug(`${Player} WaitPlayerPickCoord PickedBomb = ${PickedBomb}`);
				if ( !PickedBomb )
				{
					OnStateChanged();
					this.EndPlayerTurn(Player);
					continue;
				}
				Pop.Debug(`Picked bomb!`);
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
	
	async WaitPlayerPickCoord(Player,SendMoveAndWait,OnAction)
	{
		function TryPickCoord(x,y)
		{
			const ClickedBomb = this.HandleClick(x,y,Player);
			
			//	report move
			const ActionRender = {};
			ActionRender.Player = Player;
			ActionRender.Debug = `Player ${Player} picked ${x},${y}`;
			ActionRender.Clicked = [x,y];
			OnAction(ActionRender);
			
			return ClickedBomb;
		}
		
		while(true)
		{
			const Size = this.GetSize();
			const Width = Size[0];
			const Height = Size[1];
			const xs = CreateArrayRange(0,Width);
			const ys = CreateArrayRange(0,Height);
			
			const Move = {};
			Move.Player = Player;
			Move.Actions = {};
			
			Move.Actions.PickCoord = {};
			Move.Actions.PickCoord.Lambda = TryPickCoord.bind(this);
			Move.Actions.PickCoord.Arguments = [xs,ys];
		
			//	if this throws, player cannot complete move
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
