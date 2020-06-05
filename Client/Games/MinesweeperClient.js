class TMinesweeperClient
{
	constructor()
	{
		this.UpdateQueue = new Pop.PromiseQueue();
		this.Update();
	}
	
	async Update()
	{
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
