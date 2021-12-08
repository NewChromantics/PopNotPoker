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
		{
			Columns = 1;
			
			//	auto-square if possible
			let TileCount = this.tiles.length;
			if ( TileCount > 1 )
			{
				Columns = Math.ceil( Math.sqrt(TileCount) );
			}
		}
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
	
	CreateNewTileElement()
	{
		let Element = document.createElement('div');
		return Element;
	}
	
	UpdateTileElement(Element,Tile,Index)
	{
		Element.className = 'Tile';
		Element.setAttribute('Tile',Tile);
		Element.innerText = Tile;
	}
	
	UpdateTiles()
	{
		const Tiles = this.tiles;
		while ( this.TileMapDiv.children.length < Tiles.length )
			this.TileMapDiv.appendChild( this.CreateNewTileElement() );
			
		while ( this.TileMapDiv.children.length > Tiles.length )
			this.TileMapDiv.removeChild( this.TileMapDiv.lastChild );
			
		function UpdateTile(Tile,Index)
		{
			let TileDiv = this.TileMapDiv.children[Index];
			this.UpdateTileElement( TileDiv, Tile, Index );
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

class SelectableTileMapElement extends TileMapElement
{
	constructor()
	{
		super();
	}
	
	static ElementName()
	{
		return 'selectable-tile-map';
	}
	
	static get observedAttributes() 
	{
		return [...TileMapElement.observedAttributes,'selected'];
	}
	
	get selectedindexes()
	{
		let Selected = this.getAttribute('selected')||'';
		Selected = Selected.length ? Selected.split(',') : [];
		Selected = Selected.map( v => parseInt(v) );
		return Selected;
	}
	
	set selectedindexes(Indexes)
	{
		if ( Array.isArray(Indexes) )
			Indexes = Indexes.join(',');
		this.setAttribute('selected',Indexes);
	}
	
	CreateNewTileElement()
	{
		let Element = document.createElement('button');
		function OnClickedTileElement()
		{
			let Index = parseInt( Element.getAttribute('index') );
			this.OnClickedTile(Index);
		}
		Element.onclick = OnClickedTileElement.bind(this);
		return Element;
	}

	UpdateTileElement(Element,Tile,Index)
	{
		super.UpdateTileElement( Element, Tile, Index );
		Element.setAttribute('index',Index);
		
		let SelectedIndexes = this.selectedindexes;
		//	which order this tile was selected
		let SelectedIndex = SelectedIndexes.indexOf(Index);
		if ( SelectedIndex < 0 )
			Element.removeAttribute('selectionindex');
		else
			Element.setAttribute('selectionindex',SelectedIndex);
	}
	
	OnClickedTile(Index)
	{
		let SelectedIndexes = this.selectedindexes;
		let SelectedIndex = SelectedIndexes.indexOf(Index);
		//	not in list
		if ( SelectedIndex < 0 )
		{
			SelectedIndexes.push(Index);
		}
		else
		{
			//	remove from list
			//	or put at end?
			SelectedIndexes.splice( SelectedIndex, 1 );
		}
		this.selectedindexes = SelectedIndexes;
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
			return await this.ShowSequenceSelection(Action.MapSequence);
		
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
		
		this.TileMap = document.createElement( SelectableTileMapElement.ElementName() );
		this.LayoutRoot.appendChild(this.TileMap);

		this.PlayButton = document.createElement('Button');
		this.PlayButton.textContent = 'Play';
		this.PlayButton.disabled = true;
		this.LayoutRoot.appendChild(this.PlayButton);

		this.SkipButton = document.createElement('Button');
		this.SkipButton.textContent = 'Skip';
		this.SkipButton.disabled = true;
		this.LayoutRoot.appendChild(this.SkipButton);
	}
	
	
	GetCssContent()
	{
		let Css = ``;
		if ( this.css )
			Css += `@import "${this.css}";`;
			
		Css += `
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
}


//	name requires dash!
window.customElements.define( ElementName, Boggle );
window.customElements.define( TileMapElement.ElementName(), TileMapElement );
window.customElements.define( SelectableTileMapElement.ElementName(), SelectableTileMapElement );
