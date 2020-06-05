class TMinesweeperWindow
{
	constructor(WindowName,Rect)
	{
		this.Window = new Pop.Opengl.Window(WindowName,Rect);
		this.Window.OnRender = this.Render.bind(this);
	}
	
	Render(RenderTarget)
	{
		RenderTarget.ClearColour(0,1,1);
	}
}


class TMinesweeperClient
{
	constructor()
	{
		this.UpdateQueue = new Pop.PromiseQueue();
		this.Update();
	}
	
	async LoadAssets()
	{
		//	load what we need
	}
	
	async Init()
	{
		//	create stuff
		//	we want this to fill really
		const Rect = 'GameWindow';
		this.Window = new Pop.Gui.Window('MinesweeperGuiWindow',Rect);
		
		//	put a canvas inside that the game can render to
		const WindowContainer = this.Window.GetContainerElement();
		this.RenderWindow = new TMinesweeperWindow('MinesweeperRenderWindow',WindowContainer);
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
	
	OnMoveRequest(Move,SendReply)
	{
		//	need to update ui to do move,
		//	but needs to be a promise we can cancel in case
		//	server, say, times us out
		async function Run()
		{
			//	await user-interaction
			//	anim change of graphics
			Pop.Debug(`Show next move`);
		}
		this.UpdateQueue.Push(Run.bind(this));
	}
}
