export const SceneElementName = 'pop-scene';
export default SceneElementName;

import {CreatePromise} from '../PopEngineCommon/PopApi.js'


//	this will be the platform agnostic class
class PopScene
{
	constructor(Json)
	{
		this.Scene = Json;
	}
	
	GetDurationMs()
	{
		return 2 * 1000;
	}
	
	GetSprites()
	{
		return [];
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
	
	async LoadSprites(Sprites)
	{
		if ( !Sprites )
			return;
		for ( let Sprite of Sprites )
		{
			await this.LoadSprite( Sprite );
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
		
		this.OnCreatedDomPromise.Resolve();
	}
}

window.customElements.define( SceneElement.ElementName(), SceneElement );
