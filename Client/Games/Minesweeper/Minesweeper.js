
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

function GetAllCoords(Width,Height)
{
	const Coords = [];
	for ( let x=0;	x<Width;	x++ )
		for ( let y=0;	y<Height;	y++ )
			Coords.push( [x,y] );
	return Coords;
}

//	returns true if mine, else neighbour count
function CountNeighbours(ThisCoord,MineCoords)
{
	let NeighbourCount = 0;
	let IsMine = false;
	function CompareCoord(MineCoord)
	{
		const xdiff = Math.abs(ThisCoord[0] - MineCoord[0]);
		const ydiff = Math.abs( ThisCoord[1] - MineCoord[1] );
		if ( xdiff == 0 && ydiff == 0 )
			IsMine = true;
		else if ( xdiff <= 1 && ydiff <= 1 )
			NeighbourCount++;
	}
	MineCoords.forEach( CompareCoord );
	
	//Pop.Debug("ThisCoord",ThisCoord[0],ThisCoord[1]," has " + NeighbourCount, "IsMine="+IsMine);
	
	if ( IsMine )
		return true;
	return NeighbourCount;
}

//	constants, as class' don't currently have static fields
const MinesweeperGridState = {};
MinesweeperGridState.Hidden = 'Hidden';
MinesweeperGridState.Revealed = 'Revealed';
//MinesweeperGridState.Flagged = 'Flagged';	//	flagged p1, flagged p2 etc

class MinesweeperGame
{
	constructor(Width,Height,MineCount)
	{
		this.Width = Width;
		this.Height = Height;
		this.MineCount = MineCount;
		this.Map = null;
	}

	CreateMap(ExcludeXy)
	{
		//	make list of mine positions by making an array of all cords and picking some out
		let AllCoords = GetAllCoords(this.Width,this.Height);
		
		if ( ExcludeXy )
		{
			function MatchExcluded(xy)
			{
				return (xy[0] == ExcludeXy[0]) && (xy[1] == ExcludeXy[1]);
			}
			AllCoords.filter( xy => !MatchExcluded(xy) );
		}
		
		let MineCoords = [];
		for ( let i=0;	i<this.MineCount;	i++ )
		{
			//	pop random coord
			const RandomIndex = Math.floor( Math.random() * AllCoords.length );
			const RandomCoord = AllCoords.splice( RandomIndex, 1)[0];
			MineCoords.push( RandomCoord );
		}

		//Pop.Debug(MineCoords);
		function InitCell(x,y)
		{
			//	work out if the cell is a number or a mine, or nothing
			const CellState = {};
			CellState.Neighbours = CountNeighbours( [x,y], MineCoords );
			CellState.State = MinesweeperGridState.Hidden;
			return CellState;
		}
		
		this.Map = MakeDoubleArray( this.Width, this.Height, InitCell );
		Pop.Debug("Map",this.Map);
	}
	
	GetGridSize()
	{
		return [this.Width,this.Height];
	}
	
	IsFinished()
	{
		return false;
	}
	
	//	probably should re-use clickcoord...
	async FloodReveal(x,y)
	{
		const Cell = this.Map[x][y];
		//	already exposed
		if ( Cell.State != MinesweeperGridState.Hidden )
			return;

		//	reveal it
		Cell.State = MinesweeperGridState.Revealed;
		
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
	}
	
	async ClickCoord(xy,OnStateChanged)
	{
		const x = xy[0];
		const y = xy[1];
		const GridSize = this.GetGridSize();

		//	check bounds
		if ( x < 0 || x >= GridSize[0] )
			throw `x clicked out of bounds ${x} / ${GridSize[0]}`;
		if ( y < 0 || y >= GridSize[1] )
			throw `y clicked out of bounds ${y} / ${GridSize[1]}`;

		//	get cell
		const Cell = this.Map[x][y];
		
		//	check can be clicked
		if ( Cell.State != MinesweeperGridState.Hidden )
			throw `Clicked cell ${x},${y} state not hidden ${Cell.State}`;
	
		//	flood fill reveal
		if ( Cell.Neighbours == 0 )
		{
			await this.FloodReveal( x,y );
		}
		else
		{
			Cell.State = MinesweeperGridState.Revealed;
		}
		
		//	todo: flood fill reveal if Cell.Neighbours == 0
		//	todo: Death if clicked mine (and 1 player)
	}
	
	//	runs one iteration of the game loop
	async Iteration(GetNextClickedCoord,OnStateChanged)
	{
		OnStateChanged(this);
		const NextCoord = await GetNextClickedCoord();
		
		//	first click initialises map but no bombs at first pos
		if ( !this.Map )
		{
			this.CreateMap(NextCoord);
			OnStateChanged(this);
		}
		
		try
		{
			await this.ClickCoord(NextCoord);
			//	if player did a go, change to next player if multiplayer etc
			OnStateChanged(this);
		}
		catch(e)
		{
			//	show errors/sound etc
			Pop.Debug(e);
		}
	}
}
