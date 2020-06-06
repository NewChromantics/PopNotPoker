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
		try
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
		catch(e)
		{
			RenderTarget.ClearColour(1,0,0);
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

class PlayerWindow
{
	constructor(OnLocalNameChanged)
	{
		this.Window = new Pop.Gui.Window('Players',['20vmin','80vmin','30vmin','50vmin']);
		this.MovePlayer = null;
		this.PlayerLabels = {};
		this.LastState = null;
		
		//	add an edit box for your name
		const Rect = this.GetTextBoxRect(0);
		this.LocalName = new Pop.Gui.TextBox(this.Window,Rect);
		this.LocalName.SetValue('Your name');
		this.LocalName.OnChanged = OnLocalNameChanged;
		
		//	add labels for other players as they come & go
	}
	
	GetTextBoxRect(Index)
	{
		const Border = 5;
		const Width = 100;
		const Height = 20;
		const x = Border;
		const y = Border + ((Border+Height)*Index);
		return [x,y,Width,Height];
	}
	
	
	UpdatePlayerList(Players)
	{
		const CurrentPlayer = this.LastState ? this.LastState.NextPlayer : null;
		
		//	create/update labels
		function UpdatePlayerLabel(Player)
		{
			const Hash = Player.Hash;
			if ( !this.PlayerLabels.hasOwnProperty(Hash) )
				this.PlayerLabels[Hash] = new Pop.Gui.Label(this.Window,[0,0,40,20]);

			const Label = this.PlayerLabels[Hash];

			let LabelText = `${Player.Name} (<b>${Player.Score}</b>)`;
			if ( Player.State == 'Waiting' )	LabelText += ' joining...';
			if ( Player.State == 'Ghost' )		LabelText += ' &#9760;';	//	skull
			if ( Player.Hash == CurrentPlayer )	LabelText += ' &larr;';	//	left arrow
			for ( let i=0;	i<Player.Wins;	i++ )
				LabelText += '&#11088;';	//	star
			Label.SetValue(LabelText);
		}
		Players.forEach(UpdatePlayerLabel.bind(this));
		
		//	re-set all positions
		function SetLabelRect(Hash,Index)
		{
			const Label = this.PlayerLabels[Hash];
			//	+1 as we're using 0 for our name atm
			const Rect = this.GetTextBoxRect(Index+1);
			Label.SetRect(Rect);
		}
		Object.keys(this.PlayerLabels).forEach(SetLabelRect.bind(this));
		
	}
	
	Update(Packet)
	{
		//Pop.Debug(`Extract players from`,Packet);
		if ( Packet.State )
			this.LastState = Packet.State;
	
		if ( !Packet.Meta )
			return;
		
		//	server should send this struct
		const Players = [];
		const PushPlayer = function(Player,State)
		{
			Player.State = State;
			Player.Score = 0;
			Players.push(Player);
		}.bind(this);
		
		function GetPlayer(Hash)
		{
			return Players.filter(p=>p.Hash==Hash)[0];
		}
		
		Packet.Meta.ActivePlayers.forEach( p => PushPlayer(p,'Active') );
		Packet.Meta.WaitingPlayers.forEach( p => PushPlayer(p,'Waiting') );
		Packet.Meta.DeletedPlayers.forEach( p => PushPlayer(p,'Ghost') );
		Packet.Meta.DeletingPlayers.forEach( p => PushPlayer(p,'Ghost') );

		//	look for ghosts in the score list
		//	plus set their scores
		if ( this.LastState && this.LastState.Scores )
		{
			for ( let [Hash,Score] of Object.entries(this.LastState.Scores))
			{
				if ( !GetPlayer(Hash) )
				{
					const GhostPlayer = {};
					GhostPlayer.Hash = Hash;
					GhostPlayer.Name = `${Hash} Ghost`;	//	we don't know their name any more
					PushPlayer(GhostPlayer,'Ghost');
				}
				const Player = GetPlayer(Hash);
				Player.Score = Score;
			}
		}
		
		//	look for ghosts who have labels but no score
		//	(don't need this once we can delete labels)
		function MarkLabelDead(Hash)
		{
			if ( GetPlayer(Hash) )
				return;
			const GhostPlayer = {};
			GhostPlayer.Hash = Hash;
			GhostPlayer.Name = `${Hash} Ghost`;	//	we don't know their name any more
			PushPlayer(GhostPlayer,'Ghost');
		}
		Object.keys(this.PlayerLabels).forEach(MarkLabelDead.bind(this));
		

		this.UpdatePlayerList(Players);
	}
}

class TMinesweeperClient
{
	constructor(SendCommand)
	{
		this.SendCommand = SendCommand;
		this.RenderWindow = new TMinesweeperWindow();
		this.PlayerWindow = new PlayerWindow( this.OnLocalNameChanged.bind(this) );
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
		const Rect = ['5vmin','5vmin','60vmin','60vmin'];
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
	
	UpdateState(State,Packet)
	{
		try
		{
			this.PlayerWindow.Update(Packet);
		}
		catch(e)
		{
			Pop.Debug(`Error updating player window ${e}`);
		}
		
		//	has this interrupted our move?
		async function Run()
		{
			//	anim change of graphics
			Pop.Debug(`Show state change`);
			
			this.RenderWindow.SetState(State);
		}
		this.UpdateQueue.Push(Run.bind(this));
	}
	
	OnLocalNameChanged(NewName)
	{
		//	send back to server
		Pop.Debug(`Set name ${NewName}`);
		this.SendCommand('SetName',NewName);
	}
	
	OnAction(Packet)
	{
		this.PlayerWindow.Update(Packet);
		
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
		this.PlayerWindow.Update(Move);
		
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
	
	OnOtherMessage(Message)
	{
		this.PlayerWindow.Update(Message);
	}
}
