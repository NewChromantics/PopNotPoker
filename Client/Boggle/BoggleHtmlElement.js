const ElementName = 'boggle-game';
export default ElementName;

import PromiseQueue from '../PopEngineCommon/PromiseQueue.js' 
import Pop from '../PopEngineCommon/PopEngine.js'


class TileMapElement extends HTMLElement
{
	constructor()
	{
		super();
	}
	
	static ElementName()
	{
		return 'tile-map';
	}
	
	static get observedAttributes() 
	{
		return ['css','columns','tiles'];
	}
	
	get columns()		
	{
		let Columns = parseInt( this.getAttribute('columns') );
		if ( isNaN(Columns) )
			Columns = 1;
		Columns = Math.max( 1, Columns );
		return Columns;	
	}
	set columns(Value)
	{
		this.setAttribute('columns',Value);
	}
	set tiles(Value)
	{
		if ( typeof Value != typeof '' )
			Value = Value.join('');
		this.setAttribute('tiles',Value);
	}
	
	get tiles()			
	{
		//	gr; should make this auto align to colsxrows
		return (this.getAttribute('tiles')||'').split('');
	}
	
	get rows()
	{
		const Cols = this.columns;
		const TileCount = Math.max( Cols, this.tiles.length );
		let Rows = Math.ceil(TileCount / Cols);
		return Rows;
	}

	set css(Css)	{	Css ? this.setAttribute('css', Css) : this.removeAttribute('css');	}
	get css()		{	return this.getAttribute('css');	}
	
	GetCssContent()
	{
		let Css = ``;
		if ( this.css )
			Css += `@import "${this.css}";`;
			
		Css += `
		.TileMap
		{
			display:	grid;
			grid-template-columns:	repeat( var(--ColCount), 1fr );
			grid-template-rows:		repeat( var(--RowCount), 1fr );
			--RowCount:				${this.rows};
			--ColCount:				${this.columns};
		}
		.Tile
		{
			aspect-ratio: 1;
		}
		`;
		return Css;
	}
	
	attributeChangedCallback(name, oldValue, newValue) 
	{
		if ( this.Style )
			this.Style.textContent = this.GetCssContent();
			
		//	make sure tiles are up to date
		if ( this.TileMapDiv )
			this.UpdateTiles();
	}
	
	UpdateTiles()
	{
		const Tiles = this.tiles;
		while ( this.TileMapDiv.children.length < Tiles.length )
			this.TileMapDiv.appendChild( document.createElement('div') );
			
		while ( this.TileMapDiv.children.length > Tiles.length )
			this.TileMapDiv.removeChild( this.TileMapDiv.lastChild );
			
		function UpdateTile(Tile,Index)
		{
			let TileDiv = this.TileMapDiv.children[Index];
			TileDiv.className = 'Tile';
			TileDiv.setAttribute('Tile',Tile);
			TileDiv.innerText = Tile;
		}
		Tiles.forEach( UpdateTile.bind(this) );
	}
	
	connectedCallback()
	{
		//	Create a shadow root
		this.Shadow = this.attachShadow({mode: 'open'});
		
		const Parent = this.Shadow;
		this.Style = document.createElement('style');
		Parent.appendChild(this.Style);

		this.TileMapDiv = document.createElement('div');
		this.TileMapDiv.className = 'TileMap';
		Parent.appendChild(this.TileMapDiv);
		
		this.attributeChangedCallback();
	}
}


class BaseGameElement extends HTMLElement
{
	constructor()
	{
		super();
		
		//	async updates
		this.UpdateQueue = new PromiseQueue(`Game update queue`);
		this.Update().catch( this.OnError.bind(this) );
	}

	OnError(Error)
	{
		console.error(Error);
	}

	async Update()
	{
		//	while not deleted!
		while ( true )
		{
			const Job = await this.UpdateQueue.WaitForNext();
			await Job();
		}
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
		this.UpdateQueue.Push( Call.bind(this) );
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
			//	todo: what to do if call throws
			//	todo: add in abort promise to make call cancel & cleanup
			const ActionResponse = await this.WaitForAction(Move);
			SendReplyAction( ...ActionResponse );
			
		}
		this.UpdateQueue.Push( Run.bind(this) );
	}
	
	OnPlayerMetaChanged(Message)
	{
		console.log(`OnPlayerMetaChanged message ${Message}`);
	}
	
	OnAction(Message)
	{
		async function RunAction()
		{
			console.log(`Run action`,Message);
			//	update state
			await Pop.Yield(1*1000);
		};
		this.UpdateQueue.Push( RunAction.bind(this) );
		console.log(`Unhandled message ${Message}`);
	};

	OnOtherMessage(Message,SendReply)
	{
		console.log(`Unhandled message ${Message}`);
	}
}



class Boggle extends BaseGameElement 
{
	constructor()
	{
		super();
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

	SetupDom(Parent)
	{
		this.Style = document.createElement('style');
		Parent.appendChild(this.Style);
		
		this.TileMap = document.createElement( TileMapElement.ElementName() );
		Parent.appendChild(this.TileMap);

		this.PlayButton = document.createElement('Button');
		this.PlayButton.textContent = 'Play';
		this.PlayButton.disabled = true;
		Parent.appendChild(this.PlayButton);

		this.SkipButton = document.createElement('Button');
		this.SkipButton.textContent = 'Skip';
		this.SkipButton.disabled = true;
		Parent.appendChild(this.SkipButton);
	}
	
	
	attributeChangedCallback(name, oldValue, newValue) 
	{
		if ( this.TileMap )
			this.TileMap.css = this.css;
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
			
			//const MapSequence = await this.Ui.WaitForMapSequence();
			const MapSequence = [0,0,0,0]; //await this.Ui.WaitForMapSequence();
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

		return ActionResponse;
	}
}


//	name requires dash!
window.customElements.define( ElementName, Boggle );
window.customElements.define( TileMapElement.ElementName(), TileMapElement );
