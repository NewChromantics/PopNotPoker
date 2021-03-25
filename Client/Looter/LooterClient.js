import PromiseQueue from '../PopEngineCommon/PromiseQueue.js'

class TLooterUi
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
		Iframe.src = `Looter/Looter.html?${Math.random()}`;
		
		Pop.Debug(`waiting for iframe to load ${Iframe.src}...`);
		await LoadedPromise;
		
		//	grab the dom of the iframe
		this.Window = Iframe.contentWindow;
		this.Dom = this.Window.document;
		
		//	init page contents?
		await this.Window.LoadAssets();		
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
	
	async WaitForStayOrFlee()
	{
		return this.Window.WaitForStayOrFlee();
	}

}

export default class TLooterClient
{
	constructor()
	{
		this.Ui = new TLooterUi();
		this.UpdateQueue = new PromiseQueue('LooterClient update queue');
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

			async function WaitForStayOrFlee()
			{
				const StayOrFlee = await this.Ui.WaitForStayOrFlee();
				const Action = ['StayOrFlee',StayOrFlee];
				return Action;
			}

			//	for the different options, make a promise which returns ('ActionName',[Args])
			if ( Move.Actions.StayOrFlee )
				ActionPromises.push( WaitForStayOrFlee.call(this) );
		
			//	send back the first one triggered
			if ( !ActionPromises.length )
				throw `No action promises figured out for move; ${Object.keys(Move.Actions)}`;
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
