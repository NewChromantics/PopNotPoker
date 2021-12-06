const ElementName = 'boggle-game';
export default ElementName;

import PromiseQueue from '../PopEngineCommon/PromiseQueue.js' 
import Pop from '../PopEngineCommon/PopEngine.js'

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
	
	OnMoveRequest(Move,SendReplyAction)
	{
		//	here we should verify we understand the actions		
		async function Run()
		{
			const ActionPromises = [];

			async function WaitForSkip()
			{
				await Pop.Yield(3*1000);
				//const MapSequence = await this.WaitForSkip();
				const Action = ['SkipTurn'];
				return Action;
			}
		
			async function WaitForMapSequence()
			{
				await Pop.Yield(3*1000);
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
		return ['css','lettertiles'];
	}
	get css()					{	return this.getAttribute('css');	}
	set css(Css)				{	Css ? this.setAttribute('css', Css) : this.removeAttribute('css');	}
	get lettertiles()			{	return (this.getAttribute('lettertiles')||'').split('');	}
	set lettertiles(newValue)	
	{
		if ( Array.isArray(newValue) )
			newValue = newValue.join('');
		this.setAttribute('lettertiles', newValue);	
	}

	get ColumnCount()
	{
		return this.RowCount;
	}
	
	get RowCount()
	{
		const LetterCount = Math.max( 1, this.lettertiles.length );
		const Sqrt = Math.ceil( Math.sqrt( LetterCount ) );
		return Sqrt;
	}
	
	
	async SetState(State)
	{
		//this.state = State;
		this.lettertiles = State.Map;
	}

	SetupDom(Parent)
	{
		this.Style = document.createElement('style');
		
		Parent.appendChild(this.Style);
	}
	
	get TileContainer()
	{
		return this.Shadow;
	}
	
	get TileChildren()
	{
		let Children = Array.from( this.Shadow.children );
		Children = Children.filter( e => e instanceof HTMLDivElement );
		return Children;
	}
	
	UpdateTileElements()
	{
		//	no DOM yet
		if ( !this.TileContainer )
			return;
			
		const Tiles = this.lettertiles;
		const TileChildren = this.TileChildren;
		const TileElementType = 'div';//CardElement.ElementName();
		
		//	do a minimal amount of changes
		for ( let c=0;	c<Tiles.length;	c++ )
		{
			const Tile = Tiles[c];
			let Element = TileChildren[c];
			
			//	create new element
			if ( !Element )
			{
				Element = document.createElement(TileElementType);
				this.TileContainer.appendChild(Element);
			}
			//	else, if it exists, try and steal/swap from latter child
			
			Element.setAttribute('tile',Tile);
			Element.setAttribute('rand0', Math.random() );
			Element.style.setProperty('--rand0', Math.random() );
			Element.style.setProperty('--rand1', Math.random() );
			Element.style.setProperty('--rand2', Math.random() );
			//Element.innerText = Tile;
			Element.css = this.css;
		}
		
		//	remove excess cards
		while ( this.TileChildren.length > Tiles.length )
		{
			const LastIndex = this.TileChildren.length-1;
			this.TileContainer.removeChild( this.TileChildren[LastIndex] );
		}
	}
	
	attributeChangedCallback(name, oldValue, newValue) 
	{
		this.UpdateTileElements();
		
		if ( this.Style )
		{
			const CssFile = this.css;
			let Css = ``;
			if ( CssFile )
				Css += `@import "${CssFile}";`;
			
			Css += `
			:host
			{
				display:	grid;
				grid-template-columns:	repeat( var(--ColCount), 1fr );
				grid-template-rows:		repeat( var(--RowCount), 1fr );
				--RowCount:				${this.RowCount};
				--ColCount:				${this.ColumnCount};
			}
			`;
			this.Style.textContent = Css;
		}
	}
	
	connectedCallback()
	{
		//	Create a shadow root
		this.Shadow = this.attachShadow({mode: 'open'});
		this.SetupDom(this.Shadow);
		this.attributeChangedCallback();
	}
}


//	name requires dash!
window.customElements.define( ElementName, Boggle );
