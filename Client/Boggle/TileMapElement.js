export class TileMapElement extends HTMLElement
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

export class SelectableTileMapElement extends TileMapElement
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

window.customElements.define( TileMapElement.ElementName(), TileMapElement );
window.customElements.define( SelectableTileMapElement.ElementName(), SelectableTileMapElement );
