Pop.Include = function (Filename)
{
	const Source = Pop.LoadFileAsString(Filename);
	return Pop.CompileAndRun(Source,Filename);
}
Pop.Include('PopEngineCommon/PopMath.js');
Pop.Include('PopEngineCommon/PopShaderCache.js');
Pop.Include('PopEngineCommon/ParamsWindow.js');
Pop.Include('PopEngineCommon/PopFrameCounter.js');
Pop.Include('PopEngineCommon/PopApi.js');

Pop.Include('Minesweeper.js');
Pop.Include('AssetManager.js');


AssetFetchFunctions['Font'] = LoadFontTexture;

function LoadFontTexture(RenderTarget)
{
	function FontCharToPixel(Char)
	{
		switch ( Char )
		{
			case '\n':
			case '\r':
				return undefined;
			case '_':
				return 0;
			case 'X':
				return 255;
			default:
				return 128;
		}
	}
	const FontChars = Pop.LoadFileAsString('Font.txt').split('');
	let FontPixels = FontChars.map( FontCharToPixel );
	FontPixels = FontPixels.filter( x => x!==undefined );
	//Pop.Debug(FontPixels);

	const FontWidth = 4;
	const FontHeight = 5;
	const FontCharCount = 11;
	const Image = new Pop.Image();
	Image.WritePixels( FontWidth, FontHeight*FontCharCount, FontPixels, 'Greyscale' );
	return Image;
}


const RenderCounter = new Pop.FrameCounter('Render');

const BlitQuadShader = RegisterShaderAssetFilename('Blit.frag.glsl','Quad.vert.glsl');
const GridQuadShader = RegisterShaderAssetFilename('Grid.frag.glsl','Quad.vert.glsl');

var ResetGameFlag = false;
var WindowGridRect = null;

function OnParamsChanged(Params,ChangedParam)
{
	ResetGameFlag = true;
}

var Params = {};
Params.GridWidth = 12;
Params.GridHeight = 12;
Params.GridMineCount = 10;

var ParamsWindow = CreateParamsWindow(Params, OnParamsChanged);
ParamsWindow.AddParam('GridWidth',1,200,Math.floor);
ParamsWindow.AddParam('GridHeight',1,200,Math.floor);
ParamsWindow.AddParam('GridMineCount',1,500,Math.floor);


//	non-null when changed
var GridPixels = null;
var GridPixelsTexture = new Pop.Image();

function RenderTexture(RenderTarget,Texture,Rect,Uniforms={},ShaderName=BlitQuadShader)
{
	if (!Texture)
		return;

	const Quad = GetAsset('Quad',RenderTarget);
	const Shader = GetAsset(ShaderName,RenderTarget);
	function SetUniforms(Shader)
	{
		Shader.SetUniform('Texture',Texture);
		Shader.SetUniform('VertexRect',Rect);
		
		function SetUniform(Name)
		{
			Shader.SetUniform( Name, Uniforms[Name] );
		}
		Object.keys(Uniforms).forEach( SetUniform );
	}

	RenderTarget.DrawGeometry(Quad,Shader,SetUniforms);
}



//	we need some render context for openvr
const Window = new Pop.Opengl.Window("Minesweeper");
Window.OnRender = function (RenderTarget) 
{
	RenderTarget.ClearColour(0,1,1);
	RenderCounter.Add();

	//	get the game state as a texture
	if ( GridPixels )
	{
		GridPixelsTexture.WritePixels( GridPixels.Width, GridPixels.Height, GridPixels.Pixels, GridPixels.Format );
		GridPixels = null;
	}
	
	//	render game grid with a game shader
	//	in the center
	{
		const RenderTargetRect = RenderTarget.GetScreenRect();
		let w = RenderTargetRect[2];
		let h = RenderTargetRect[3];
		if (w > h)
		{
			w = h / w;
			h = 1;
		}
		else
		{
			h = w / h;
			w = 1;
		}
		let Border = 0.2;
		w -= Border * w;
		h -= Border * h;
		const Rect = [(1 - w) / 2,(1 - h) / 2,w,h];
		const Uniforms = {};
		Uniforms['FontTexture'] = GetAsset('Font',RenderTarget);
		Uniforms['GridSize'] = [Params.GridWidth,Params.GridHeight];
		RenderTexture(RenderTarget,GridPixelsTexture,Rect,Uniforms,GridQuadShader);
		WindowGridRect = Rect;
		WindowGridRect[0] *= RenderTargetRect[2];
		WindowGridRect[1] *= RenderTargetRect[3];
		WindowGridRect[2] *= RenderTargetRect[2];
		WindowGridRect[3] *= RenderTargetRect[3];
	}

	//	todo: show gui
	//	todo: show mouse interaction
		
}
Window.OnMouseMove = function () { };
Window.OnMouseDown = OnMouseDown;


function OnGameStateChanged(Game)
{
	//	turn the game grid into a pixel map
	const Grid = Game.Map;
	const GridSize = Game.GetGridSize();
	const PixelCount = GridSize[0] * GridSize[1];
	const ComponentCount = 4;
	const Pixels = new Uint8Array( new Array(ComponentCount*PixelCount) );
	GridPixels = {};
	GridPixels.Width = GridSize[0];
	GridPixels.Height = GridSize[1];
	GridPixels.Format = 'RGBA';

	const NullCell = {};
	NullCell.Neighbours = 0;
	NullCell.State = MinesweeperGridState.Hidden;
	
	for ( let x=0;	x<GridPixels.Width;	x++ )
	{
		for ( let y=0;	y<GridPixels.Height;	y++ )
		{
			let PixelIndex = (y * GridPixels.Width) + x;
			PixelIndex *= ComponentCount;
			const Cell = Grid ? Grid[x][y] : NullCell;
			const NeighbourCount = Cell.Neighbours;
			const IsMine = (NeighbourCount===true);
			const StateValue = (Cell.State == MinesweeperGridState.Hidden) ? 0 : 1;
			//	is flagged, is exploded etc
			Pixels[PixelIndex+0] = IsMine ? 255 : NeighbourCount;
			Pixels[PixelIndex+1] = StateValue;
			Pixels[PixelIndex+2] = 0;
			Pixels[PixelIndex+3] = 255;
		}
	}
	GridPixels.Pixels = Pixels;
}


//	gr: is this the wrong way around?
//		this is a list of waiting mouse requests,
//		so will only respond once the user has clicked,
//		(only clicking after requests/ready) instead of
//		catching pending ones (ie, clicking faster than logic)
//	likely there will only ever be one entry in this queue
let PendingMouseClickPromises = [];

function WindowPosToGridPos(WindowPos,ValueIfOutOfBounds=undefined)
{
	//	rescale window grid rect?
	Pop.Debug( WindowPos, "x", WindowGridRect );
	//	get normalised
	let x = Math.Range( WindowGridRect[0], WindowGridRect[0] + WindowGridRect[2], WindowPos[0] );
	let y = Math.Range( WindowGridRect[1], WindowGridRect[1] + WindowGridRect[3], WindowPos[1] );

	//	rescale to grid
	const gw = Params.GridWidth;
	const gh = Params.GridHeight;
	x = Math.floor( x * gw );
	y = Math.floor( y * gh );
	
	//	reject oob
	if ( ValueIfOutOfBounds !== undefined )
	{
		if ( x < 0 || x >= gw )	return ValueIfOutOfBounds;
		if ( y < 0 || y >= gh )	return ValueIfOutOfBounds;
	}

	return [x,y];
}

function OnMouseDown(Windowx,Windowy)
{
	const WindowPos = [Windowx,Windowy];
	
	//	if no promises, nothing is waiting for a click
	//	play an error sound
	if ( !PendingMouseClickPromises.length )
	{
		Pop.Debug("No pending click requests");
		return;
	}
	
	const GridPos = WindowPosToGridPos(WindowPos, false);
	if ( !GridPos )
	{
		Pop.Debug("Grid pos out of bounds");
		return;
	}
	
	const ClickPromise = PendingMouseClickPromises.splice(0,1)[0];
	ClickPromise.Resolve( GridPos );
}

async function GetNextClickCoord()
{
	const Promise = Pop.CreatePromise();
	PendingMouseClickPromises.push( Promise );
	return Promise;
}

async function AppLoop()
{
	while ( true )
	{
		ResetGameFlag = false;
		const Game = new MinesweeperGame( Params.GridWidth, Params.GridHeight, Params.GridMineCount );
		OnGameStateChanged( Game );
		while ( !ResetGameFlag )
		{
			await Pop.Yield(100);
			await Game.Iteration( GetNextClickCoord, OnGameStateChanged );
			if ( Game.IsFinished() )
				break;
		}
	}
}
AppLoop().then(Pop.Debug).catch(Pop.Debug);

