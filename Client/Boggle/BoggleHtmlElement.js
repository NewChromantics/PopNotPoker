const ElementName = 'boggle-game';
export default ElementName;

import PromiseQueue from '../PopEngineCommon/PromiseQueue.js' 
import Pop from '../PopEngineCommon/PopEngine.js'
import {CreatePromise} from '../PopEngineCommon/PopApi.js'

import SceneHtmlElement from './PopSceneElement.js'
import {TileMapElement,SelectableTileMapElement} from './TileMapElement.js'


class BaseGameElement extends HTMLElement
{
	constructor()
	{
		super();
		
		//	queued async updates
		this.GameUpdateQueue = new PromiseQueue(`Game update queue`);
	}

	OnError(Error)
	{
		console.error(Error);
	}

	async SetState(State)
	{
		this.state = State;
	}

	UpdateState(State,Message)
	{
		async function Call()
		{
			await this.SetState(State);
		}
		this.GameUpdateQueue.Push( Call.bind(this) );
	}
	
	async WaitForAction(Move)
	{
		throw `This needs to be overloaded`;
	}
	
	OnMoveRequest(Move,SendReplyAction)
	{
		//	here we should verify we understand the actions		
		async function Run()
		{
			await this.WaitForScene(`YourMove.json`);
			//	todo: what to do if call throws
			//	todo: add in abort promise to make call cancel & cleanup
			const ActionResponse = await this.WaitForAction(Move);
			SendReplyAction( ...ActionResponse );
			
		}
		this.GameUpdateQueue.Push( Run.bind(this) );
	}
	
	OnPlayerMetaChanged(Message)
	{
		console.log(`OnPlayerMetaChanged message`,Message);
	}
	
	async ShowAction(Action)
	{
		console.log(`ShowAction action`,Action);
		await Pop.Yield(1*1000);
	}

	OnAction(Message)
	{
		async function RunAction()
		{
			await this.ShowAction( Message.Action );
		};
		this.GameUpdateQueue.Push( RunAction.bind(this) );
		console.log(`OnAction message`,Message);
	};

	OnOtherMessage(Message,SendReply)
	{
		console.log(`Unhandled message`,Message);
		//	update state if provided
		if ( Message.State )
			this.UpdateState( Message.State, Message );
	}
}



class Boggle extends BaseGameElement 
{
	constructor()
	{
		super();

		this.Scenes = [];	//	PopScene Elements
		this.OnFinishedPromise = this.GameThread();
		this.OnDomCreatedPromise = CreatePromise();
	}
	
	static get observedAttributes() 
	{
		return ['css','state'];
	}
	get css()					{	return this.getAttribute('css');	}
	set css(Css)				{	Css ? this.setAttribute('css', Css) : this.removeAttribute('css');	}
	get state()	
	{
		let State = this.getAttribute('state') || {};
		return JSON.parse( State );
	}
	
	async SetState(State)
	{
		if ( this.TileMap )
		{
			this.TileMap.columns = State.MapWidth;
			this.TileMap.tiles = State.Map;
		}
	}
	
	async GameThread()
	{
		//	wait to be created
		await this.OnDomCreatedPromise;
		
		//	setup UI
		await this.WaitForScene(`Welcome`);
		await this.CreateTileMap();
		
		//	now just wait for external game updates
		while ( true )
		{
			//	would it better to have a message queue here and explicitly
			//	"if action, do this, else" instead of queuing async things
			const Job = await this.GameUpdateQueue.WaitForNext();
			await Job();
		}
	}
	
	async ShowSequenceSelection(Sequence)
	{
		let OldSelected = this.TileMap.selectedindexes;
		
		for ( let i=0;	i<=Sequence.length;	i++ )
		{
			this.TileMap.selectedindexes = Sequence.slice(0,i);
			await Pop.Yield(200);
		}
		await Pop.Yield(500);
		this.TileMap.selectedindexes = OldSelected;
	}		
	
	async ShowAction(Action)
	{
		if ( Action.MapSequence )
		{
			//	await this.WaitForScene(`Made a move`);
			return await this.ShowSequenceSelection(Action.MapSequence);
		}
	
		if ( Action.Skip )
		{
			return await this.WaitForScene(`PlayerSkipped`);
		}
	
		if ( Action.BadMove )
		{
			return await this.WaitForScene(`BadMove`);
		}
	
		//	unhandled action
		return super.ShowAction(Action);
	}

	SetupDom(Parent)
	{
		this.Style = document.createElement('style');
		Parent.appendChild(this.Style);
		
		this.LayoutRoot = document.createElement('div');
		this.LayoutRoot.className = 'LayoutRoot';
		Parent.appendChild(this.LayoutRoot);

		//	this wants to change to a UI scene
		this.PlayButton = document.createElement('Button');
		this.PlayButton.textContent = 'Play';
		this.PlayButton.disabled = true;
		this.LayoutRoot.appendChild(this.PlayButton);

		this.SkipButton = document.createElement('Button');
		this.SkipButton.textContent = 'Skip';
		this.SkipButton.disabled = true;
		this.LayoutRoot.appendChild(this.SkipButton);
	}
	
	async CreateTileMap()
	{
		if ( !this.LayoutRoot )
			throw `CreateTileMap() called before dom created`;
			
		//	want to change this to a tilemap scene
		this.TileMap = document.createElement( SelectableTileMapElement.ElementName() );
		this.TileMap.css = this.css;
		this.LayoutRoot.appendChild(this.TileMap);
	}
		

	
	GetCssContent()
	{
		let Css = ``;
		if ( this.css )
			Css += `@import "${this.css}";`;
			
		Css += `
		:host
		{
			position:	relative;
		}
		`;
		return Css;
	}
	
	attributeChangedCallback(name, oldValue, newValue) 
	{
		if ( this.TileMap )
			this.TileMap.css = this.css;
			
		if ( this.Style )
			this.Style.textContent = this.GetCssContent();
	}
	
	connectedCallback()
	{
		//	Create a shadow root
		this.Shadow = this.attachShadow({mode: 'open'});
		this.SetupDom(this.Shadow);
		this.attributeChangedCallback();
	}
	
	async WaitForAction(Move)
	{
		const ActionPromises = [];

		async function WaitForSkip()
		{
			const OnClickPromise = Pop.CreatePromise(); 
			this.SkipButton.disabled = false;
			this.SkipButton.onclick = () => OnClickPromise.Resolve();
			await OnClickPromise;
			
			const Action = ['SkipTurn'];
			return Action;
		}
		
		async function WaitForMapSequence()
		{
			const OnClickPromise = Pop.CreatePromise(); 
			this.PlayButton.disabled = false;
			this.PlayButton.onclick = () => OnClickPromise.Resolve();
			await OnClickPromise;
			
			const MapSequence = this.TileMap.selectedindexes;
			Pop.Debug(`Got MapSequence from ui ${MapSequence}`);
			const Action = ['PickMapSequence',...MapSequence];
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
		this.SkipButton.disabled = true;
		this.PlayButton.disabled = true;
		this.TileMap.selectedindexes = [];

		return ActionResponse;
	}
	
	async WaitForScene(SceneName)
	{
		//	create new scene element
		let Scene = document.createElement(SceneHtmlElement);
		Scene.scenefilename = `Boggle/Scene/${SceneName}.Scene.json`;
		this.Shadow.appendChild( Scene );
		try
		{
			//	wait for it to finish
			await Scene.WaitForFinish();
		}
		catch(e)
		{
			console.error(`WaitForScene(${SceneName}) error; ${e}`);
		}
		finally
		{
			this.Shadow.removeChild(Scene);
			this.Scenes = this.Scenes.filter( s => s!=Scene );
		}
	}
}


//	name requires dash!
window.customElements.define( ElementName, Boggle );
