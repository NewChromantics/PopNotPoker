export const SceneElementName = 'pop-scene';
export default SceneElementName;

import {CreatePromise} from '../PopEngineCommon/PopApi.js'



function SetElementVariable(Element,Key,Value)
{
	//	change an attribute
	Element.setAttribute(Key,Value);
	//	set a css value
	Element.style.setProperty(`${Key}`,Value);
	//	set a css variable
	Element.style.setProperty(`--${Key}`,Value);
}


//	this will be the platform agnostic class
//	a scene should probably be 
//	- layout asset (which is a tree of prefabs/sprites)
//	- Page/layout asset (bounds, pixel perfect settings etc)
//	- sequence of animation assets (which are name+uniform: value timelines)
class PopScene
{
	constructor(LayoutJson)
	{
		this.Layout = LayoutJson;
	}
	
	GetDurationMs()
	{
		//	calc this from animations
		//	although really we probably wouldn't need a duration at all and should be
		//	catching end points from the host events (css animation)
		return 2 * 1000;
	}
	
	//	returns dictionary of sprites
	GetSprites()
	{
		return this.Layout;
	}
}



class SceneElement extends HTMLElement
{
	constructor()
	{
		super();
		
		this.OnLoadAttributesPromise = CreatePromise();
		this.OnCreatedDomPromise = CreatePromise();
		this.OnFinishedPromise = this.UpdateThread();
	}	
	
	static ElementName()
	{
		return SceneElementName;
	}
	
	static get observedAttributes() 
	{
		return ['scenefilename'];
	}
	
	get scenefilename()		
	{
		return this.getAttribute('scenefilename');
	}
	
	set scenefilename(Filename)		
	{
		this.setAttribute('scenefilename',Filename);
	}
	
	async WaitForFinish()
	{
		return this.OnFinishedPromise;
	}
	
	async LoadSceneJson()
	{
		let Filename = this.scenefilename;
		const Response = await fetch( Filename );
		const Json = await Response.json();
		let Scene = new PopScene(Json);
		return Scene;
	}
	
	get SpriteParentElement()
	{
		return this.Shadow;
	}
	
	SetSpriteUniforms(SpriteElement,Uniforms)
	{
		for ( let Name in Uniforms )
		{
			let Value = Uniforms[Name];
			SetElementVariable( SpriteElement, Name, Value );
			
			//	temp
			if ( Name == `Text` )
				SpriteElement.textContent = Value;
		}
	}
	
	async LoadSprite(Name,Sprite,ParentElement)
	{
		let Element = document.createElement('div');
		let ParentId = ParentElement.id ? `${ParentElement.id}/` : '';
		Element.id = `${ParentId}${Name}`;
		this.SetSpriteUniforms( Element, Sprite.Uniforms );
		ParentElement.appendChild( Element );
	}
	
	async LoadSprites(Sprites,ParentElement)
	{
		if ( !Sprites )
			return;
		if ( !ParentElement )
			ParentElement = this.SpriteParentElement;

		for ( let SpriteName in Sprites )
		{
			let Sprite = Sprites[SpriteName];
			await this.LoadSprite( SpriteName, Sprite, ParentElement );
			await this.LoadSprites( Sprite.Children );
		}
	}
	
	async UpdateThread()
	{
		//	wait for attribs to be set
		await this.OnLoadAttributesPromise;
		//	load scene json
		const Scene = await this.LoadSceneJson();
		//	wait for DOM to create me
		await this.OnCreatedDomPromise;
		
		//	load scene elements
		let Sprites = Scene.GetSprites();
		await this.LoadSprites(Sprites);
		
		//	start anims
		//	todo: add a root animation with duration to sync with sprite anims?
		//	catch animation end event
		//	finish
		await Pop.Yield( Scene.GetDurationMs() );
	}
	
	attributeChangedCallback(name, oldValue, newValue) 
	{
		if ( name == 'scenefilename' )
		{
			//	reload/restart scene
		}
		
		this.OnLoadAttributesPromise.Resolve();
	}
	
	GetShadowCss()
	{
		const Css = `
		:host
		{
			position:	absolute;
			left:		0px;
			top:		0px;
			width:		100%;
			height:		100%;
			display:	block;
		}
		`;
		return Css;
	}
	
	connectedCallback()
	{
		//	Create a shadow root
		this.Shadow = this.attachShadow({mode: 'open'});
		
		const Parent = this.Shadow;
		this.Style = document.createElement('style');
		this.Style.textContent = this.GetShadowCss();
		Parent.appendChild(this.Style);

		this.TileMapDiv = document.createElement('div');
		this.TileMapDiv.className = 'TileMap';
		Parent.appendChild(this.TileMapDiv);
		
		this.attributeChangedCallback();
		
		this.OnCreatedDomPromise.Resolve();
	}
}

window.customElements.define( SceneElement.ElementName(), SceneElement );
