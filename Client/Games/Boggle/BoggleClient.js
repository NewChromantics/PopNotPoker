class TBoggleClient
{
	constructor()
	{
		this.RenderWindow = new TMinesweeperWindow();
		this.UpdateQueue = new Pop.PromiseQueue();
		this.Update();
	}
	
	async LoadAssets()
	{
	}
	
	async Init()
	{
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
		//	has this interrupted our move?
		async function Run()
		{
			//	anim change of graphics
			Pop.Debug(`Show state change`,State);
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
			Pop.Debug(`Show action`,Packet);
		}
		this.UpdateQueue.Push(Run.bind(this));
	}
	
	OnMoveRequest(Move,SendReplyAction)
	{
	/*
		//	need to update ui to do move,
		//	but needs to be a promise we can cancel in case
		//	server, say, times us out
		if ( Object.keys(Move.Actions).includes('PickCoord') )
		{
			async function Run()
			{
				//	wait for user to click
				const ClickPos = await this.RenderWindow.WaitForClick();
				//	taken interaction
				this.Window.Flash(false);
				SendReplyAction('PickCoord',ClickPos);
			}
			this.UpdateQueue.Push(Run.bind(this));
		}
		else*/
		{
			throw `Minesweeper doesn't know move ${Move}`;
		}
	}
	
	OnOtherMessage(Message)
	{
		Pop.Warning(`Got other message`,Message);
	}
}
