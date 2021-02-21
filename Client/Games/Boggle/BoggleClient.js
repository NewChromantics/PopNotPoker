class TBoggleUi
{
	constructor()
	{
	}
	
	async LoadAssets()
	{
		//	load the iframe
		const Iframe = document.querySelector('iframe');
		const LoadedPromise = Pop.CreatePromise();
		
		function OnIframeLoaded()
		{
			LoadedPromise.Resolve();
		}
		Iframe.addEventListener("load",OnIframeLoaded);
		//	gr: do we need a random number to force reload?
		Iframe.src = `Boggle.html?${Math.random()}`;
		
		Pop.Debug(`waiting for iframe to load ${Iframe.src}...`);
		await LoadedPromise;
		
		//	grab the dom of the iframe
		this.Window = Iframe.contentWindow;
		this.Dom = this.Window.document;
		
		//	init page contents?
	}
	
	async SetState(State)
	{
		//	update ui, wait for animations
		Pop.Debug(`Show state change`,State);
		await this.Window.SetState(State);
	}
	
	async OnAction(Packet)
	{
		const Action = Packet.Action;
		await this.Window.ShowAction(Action);
	}
	
	async WaitForSkip()
	{
		return this.Window.WaitForSkip();
	}
	
	async WaitForMapSequence()
	{
		return this.Window.WaitForMapSequence();
	}
	
}

class TBoggleClient
{
	constructor()
	{
		this.Ui = new TBoggleUi();
		this.UpdateQueue = new Pop.PromiseQueue();
		this.Update();
	}
	
	async LoadAssets()
	{
		await this.Ui.LoadAssets();
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
			await this.Ui.SetState(State);
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
			await this.Ui.OnAction(Packet);
		}
		this.UpdateQueue.Push(Run.bind(this));
	}
	
	OnMoveRequest(Move,SendReplyAction)
	{
		//	here we should verify we understand the actions		
		async function Run()
		{
			const ActionPromises = [];

			async function WaitForSkip()
			{
				const MapSequence = await this.Ui.WaitForSkip();
				const Action = ['SkipTurn'];
				return Action;
			}
		
			async function WaitForMapSequence()
			{
				const MapSequence = await this.Ui.WaitForMapSequence();
				Pop.Debug(`Got MapSequence from ui ${MapSequence}`);
				const Action = ['PickMapSequence',MapSequence];
				return Action;
			}

			//	for the different options, make a promise which returns ('ActionName',[Args])
			if ( Move.Actions.SkipTurn )
				ActionPromises.push( WaitForSkip.call(this) );
			
			if ( Move.Actions.PickMapSequence )
				ActionPromises.push( WaitForMapSequence.call(this) );
			
			//	send back the first one triggered
			const ActionResponse = await Promise.race( ActionPromises );
			Pop.Debug(`ActionResponse = ${JSON.stringify(ActionResponse)}`);
			SendReplyAction( ...ActionResponse );
		}
		this.UpdateQueue.Push(Run.bind(this));
	}
	
	OnOtherMessage(Message)
	{
		Pop.Warning(`Got other message`,Message);
	}
}
