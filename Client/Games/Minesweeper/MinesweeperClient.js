function GetDoubleArraySize(Array)
{
	const Width = Array.length;
	const Height = Array[0].length;
	return [Width,Height];
}

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
	const FilenamePrefix = 'Games/Minesweeper/';
	const FontChars = Pop.LoadFileAsString(FilenamePrefix+'Font.txt').split('');
	let FontPixels = FontChars.map( FontCharToPixel );
	FontPixels = FontPixels.filter( x => x!==undefined );
	FontPixels = new Uint8Array(FontPixels);
	//Pop.Debug(FontPixels);
	
	const FontWidth = 4;
	const FontHeight = 5;
	const FontCharCount = 11;
	const Image = new Pop.Image();
	Image.WritePixels( FontWidth, FontHeight*FontCharCount, FontPixels, 'Greyscale' );
	Image.SetLinearFilter(false);
	return Image;
}


function RenderTexture(RenderTarget,Texture,Rect,Uniforms,ShaderName)
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


class TMinesweeperWindow
{
	constructor()
	{
		this.NewGridPixels = null;
		this.GridPixelsTexture = new Pop.Image();
		this.Window = null;
		this.PendingClicks = new Pop.PromiseQueue();
	}
	
	async WaitForClick()
	{
		//	clear out pending clicks
		//	update ui to tell player to click
		this.PendingClicks.ClearQueue();
		return this.PendingClicks.WaitForNext();
	}
	
	async LoadAssets()
	{
		const FilenamePrefix = 'Games/Minesweeper/';
		//	load shaders etc
		await Pop.LoadFileAsStringAsync(FilenamePrefix+'Quad.vert.glsl');
		await Pop.LoadFileAsStringAsync(FilenamePrefix+'Blit.frag.glsl');
		await Pop.LoadFileAsStringAsync(FilenamePrefix+'Grid.frag.glsl');
		await Pop.LoadFileAsStringAsync(FilenamePrefix+'Font.txt');
		
		//	setup assets
		//Pop.Include('AssetManager.js');
		AssetFetchFunctions['Font'] = LoadFontTexture;
		this.BlitQuadShader = RegisterShaderAssetFilename(FilenamePrefix+'Blit.frag.glsl',FilenamePrefix+'Quad.vert.glsl');
		this.GridQuadShader = RegisterShaderAssetFilename(FilenamePrefix+'Grid.frag.glsl',FilenamePrefix+'Quad.vert.glsl');
		
	}
	
	Show(ParentWindow)
	{
		this.ParentWindow = ParentWindow;
		const WindowName = 'Minesweeper';
		const WindowContainer = ParentWindow.GetContainerElement();
		this.Window = new Pop.Opengl.Window(WindowName,WindowContainer);
		this.Window.OnRender = this.Render.bind(this);
		this.Window.OnMouseDown = this.OnMouseDown.bind(this);
	}
	
	SetState(State)
	{
		//	turn the game grid into a pixel map
		//	todo: reformat grid to expose numbers
		const Grid = State.Map;
		const GridSize = GetDoubleArraySize(Grid);
		const PixelCount = GridSize[0] * GridSize[1];
		const ComponentCount = 4;
		const Pixels = new Uint8Array( new Array(ComponentCount*PixelCount) );
		this.NewGridPixels = {};
		const GridPixels = this.NewGridPixels;
		GridPixels.Width = GridSize[0];
		GridPixels.Height = GridSize[1];
		GridPixels.Format = 'RGBA';
		
		const MinesweeperGridState_Hidden = '?';
		
		const NullCell = {};
		NullCell.Neighbours = 0;
		NullCell.State = MinesweeperGridState_Hidden;
		
		for ( let x=0;	x<GridPixels.Width;	x++ )
		{
			for ( let y=0;	y<GridPixels.Height;	y++ )
			{
				let PixelIndex = (y * GridPixels.Width) + x;
				PixelIndex *= ComponentCount;
				const Cell = Grid[x][y];
				
				const IsHidden = (Cell=='?');
				const NeighbourCount = Number.isInteger(Cell) ? Cell : false;
				const IsMine = (!IsHidden && NeighbourCount===false);
				const StateValue = (IsHidden) ? 0 : 255;
				//	is flagged, is exploded etc
				Pixels[PixelIndex+0] = IsMine ? 255 : (NeighbourCount);
				Pixels[PixelIndex+1] = StateValue;
				Pixels[PixelIndex+2] = 0;
				Pixels[PixelIndex+3] = 255;
			}
		}
		GridPixels.Pixels = new Uint8Array(Pixels);
		Pop.Debug(`New GridPixels; ${GridPixels.Pixels}`);
		this.State = State;
	}
	
	GetGridSize()
	{
		if ( !this.State )
			return null;
		return GetDoubleArraySize(this.State.Map);
	}
	
	Render(RenderTarget)
	{
		RenderTarget.ClearColour(0,1,1);
		
		//	get the game state as a texture
		if ( this.NewGridPixels )
		{
			this.GridPixelsTexture.WritePixels( this.NewGridPixels.Width, this.NewGridPixels.Height, this.NewGridPixels.Pixels, this.NewGridPixels.Format );
			this.NewGridPixels = null;
		}
		
		//	render game grid with a game shader
		//	in the center
		{
			const RenderTargetRect = RenderTarget.GetScreenRect();
			let w = RenderTargetRect[2];
			let h = RenderTargetRect[3];
			const KeepAspect = false;
			if ( KeepAspect )
			{
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
			}
			else
			{
				w = 1;
				h = 1;
			}
			//	apply border & center
			const Border = 0.0;
			w -= Border * w;
			h -= Border * h;
			const Rect = [(1 - w) / 2,(1 - h) / 2,w,h];
			const Uniforms = {};
			const GridSize = [this.GridPixelsTexture.GetWidth(),this.GridPixelsTexture.GetHeight()];
			Uniforms['FontTexture'] = GetAsset('Font',RenderTarget);
			Uniforms['GridSize'] = GridSize;
			RenderTexture(RenderTarget,this.GridPixelsTexture,Rect,Uniforms,this.GridQuadShader);
			
			//	update the clickable rect
			this.WindowGridRect = Rect;
			this.WindowGridRect[0] *= RenderTargetRect[2];
			this.WindowGridRect[1] *= RenderTargetRect[3];
			this.WindowGridRect[2] *= RenderTargetRect[2];
			this.WindowGridRect[3] *= RenderTargetRect[3];
		}
	}
	
	OnMouseDown(Windowx,Windowy)
	{
		if ( !this.WindowGridRect )
		{
			Pop.Debug(`Mouse click ${Windowx},${Windowy} ignored as no grid render yet`);
			return;
		}
		
		const GridSize = this.GetGridSize();
		if ( !GridSize )
		{
			Pop.Debug(`Mouse click ${Windowx},${Windowy} ignored as no grid size yet`);
			return;
		}
		
		let x = Math.Range( this.WindowGridRect[0], this.WindowGridRect[0] + this.WindowGridRect[2], Windowx );
		let y = Math.Range( this.WindowGridRect[1], this.WindowGridRect[1] + this.WindowGridRect[3], Windowy );
		
		//	scale to grid
		x = Math.floor( x * GridSize[0] );
		y = Math.floor( y * GridSize[1] );

		//	skip out of bounds
		if ( x < 0 || x >= GridSize[0] || y < 0 || y >= GridSize[1] )
		{
			Pop.Debug(`Mouse click ${x},${y} ignored as out of bounds`);
			return;
		}
		
		this.PendingClicks.Push([x,y]);
	}
}


class TMinesweeperClient
{
	constructor()
	{
		this.RenderWindow = new TMinesweeperWindow();
		this.UpdateQueue = new Pop.PromiseQueue();
		this.Update();
	}
	
	async LoadAssets()
	{
		//	load what we need
		await this.RenderWindow.LoadAssets();
	}
	
	async Init()
	{
		//	create stuff
		//	we want this to fill really
		const Rect = ['10vmin','10vmin','80vmin','80vmin'];
		//const Rect = 'GameWindow';
		this.Window = new Pop.Gui.Window('MinesweeperGuiWindow',Rect);
		this.Window.EnableScrollbars(false,false);
		this.RenderWindow.Show(this.Window);
	}
	
	async Update()
	{
		await this.LoadAssets();
		await this.Init();
		while(true)
		{
			const Job = await this.UpdateQueue.WaitForNext();
			await Job();
		}
	}
	
	UpdateState(State)
	{
		//	has this interrupted our move?
		async function Run()
		{
			//	anim change of graphics
			Pop.Debug(`Show state change`);
			
			this.RenderWindow.SetState(State);
		}
		this.UpdateQueue.Push(Run.bind(this));
	}
	
	OnAction(Packet)
	{
		//	has this interrupted our move?
		//	a move was made!
		async function Run()
		{
			//	anim change of graphics
			Pop.Debug(`Show action`);
		}
		this.UpdateQueue.Push(Run.bind(this));
	}
	
	OnMoveRequest(Move,SendReplyAction)
	{
		//	need to update ui to do move,
		//	but needs to be a promise we can cancel in case
		//	server, say, times us out
		if ( Object.keys(Move.Actions).includes('PickCoord') )
		{
			async function Run()
			{
				//	update graphics
				//	indiciate its your turn
				this.Window.Flash(true);
				//	wait for user to click
				const ClickPos = await this.RenderWindow.WaitForClick();
				//	taken interaction
				this.Window.Flash(false);
				SendReplyAction('PickCoord',ClickPos);
			}
			this.UpdateQueue.Push(Run.bind(this));
		}
		else
		{
			throw `Minesweeper doesn't know move ${Move}`;
		}
	}
}
