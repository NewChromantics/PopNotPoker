
class Boggle extends HTMLElement 
{
	constructor()
	{
		super();
	}
	
	static ElementName()
	{
		return 'boggle-game';
	}
	
	static get observedAttributes() 
	{
		return ['css','gridletters'];
	}
	get css()					{	return this.getAttribute('css');	}
	set css(Css)				{	Css ? this.setAttribute('css', Css) : this.removeAttribute('css');	}
	get lettertiles()			{	return this.getAttribute('lettertiles').split('');	}
/*	
	set lettertiles(newValue)	
	{
		if ( Array.isArray(newValue) )
			newValue = newValue.join('');
		this.setAttribute('lettertiles', newValue);	
	}
	*/
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
window.customElements.define( Boggle.ElementName(), Boggle );
