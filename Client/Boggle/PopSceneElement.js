export const SceneElementName = 'pop-scene';
export default SceneElementName;

import {CreatePromise} from '../PopEngineCommon/PopApi.js'
import Timeline_t from '../PopEngineCommon/Timeline.js'


function SetElementVariable(Element,Key,Value)
{
	//	change an attribute
	Element.setAttribute(Key,Value);
	//	set a css value
	Element.style.setProperty(`${Key}`,Value);
	//	set a css variable
	Element.style.setProperty(`--${Key}`,Value);
}


//	an actor compromises uniforms, meta, and other child actors
//	platform agnostic
class PopActor
{
	constructor(ActorJson)
	{
		//	defaults
		this.Children = {};
		this.Joint = null;
		this.Uniforms = {};
		Object.assign( this, ActorJson );
		
		this.LoadChildrenPromise = null;
	}
	
	async WaitForLoad(BasePath)
	{
		if ( !this.LoadFilesPromise )
			this.LoadFilesPromise = this.LoadChildren(BasePath);
		return this.LoadFilesPromise;
	}
	
	//	gr: this might also expand to loading asset dependencies?
	async LoadChildren(BasePath)
	{
		//	
	}
}


//	this will be the platform agnostic class
//	a scene should be 
//	- named root actor[asset]s
//	- Page/layout asset/meta (bounds, pixel perfect settings etc)
//	- sequence of animation assets (which are name+uniform: value timelines)
class PopScene
{
	constructor(SceneJson,Filename)
	{
		this.Filename = Filename;
		this.OnLoadPromise = this.LoadFiles(SceneJson);
	}
	
	async WaitForLoad()
	{
		return this.OnLoadPromise;
	}

	get BasePath()
	{
		let PathChunks = this.Filename.split('/');
		let Filename = PathChunks.pop();
		let BasePath = PathChunks.join('/');
		return BasePath;
	}

	async LoadFiles(SceneJson)
	{
		async function LoadJson(Filename)
		{
			const Response = await fetch(Filename);
			return await Response.json();
		}

		//	setup default scene asset
		this.Scene = {};
		this.Scene.Timelines = [];
		this.Scene.Actors = {};
		Object.assign( this.Scene, SceneJson );

		this.Timelines = [];
		this.Actors = {};
		
		//	load timelines
		for ( let TimelineName of this.Scene.Timelines )
		{
			const TimelineFilename = `${this.BasePath}/${TimelineName}.Timeline.json`;
			const TimelineJson = await LoadJson( TimelineFilename );
			const Timeline = new Timeline_t( TimelineJson );
			this.Timelines.push( Timeline );
		}
		
		//	need to preserve order for Z! but loading json doesn't guarantee that...
		//	so this needs to be an array, not keyed, but we still want unique names...
		for ( let ActorName in this.Scene.Actors )
		{
			const ActorFilename = `${this.BasePath}/${ActorName}.Actor.json`;
			const ActorJson = await LoadJson( ActorFilename );
			const Actor = new PopActor( ActorJson );
			this.Actors[ActorName] = Actor;
			await Actor.WaitForLoad( this.BasePath );
		}
	}
	
	GetDurationMs()
	{
		//	calc this from timelines
		//	although really we probably wouldn't need a duration at all and should be
		//	catching end points from the host events (css animation)
		return 2 * 1000;
	}
	
	//	returns dictionary of actors (todo: this needs to be a preserved z order!)
	GetActors()
	{
		return this.Actors;
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
	
	async LoadScene()
	{
		let Filename = this.scenefilename;
		const Response = await fetch( Filename );
		const Json = await Response.json();
		let Scene = new PopScene(Json,Filename);
		await Scene.WaitForLoad();
		return Scene;
	}
	
	get ActorParentElement()
	{
		return this.Shadow;
	}
	
	SetActorUniforms(ActorElement,Uniforms)
	{
		for ( let Name in Uniforms )
		{
			let Value = Uniforms[Name];
			SetElementVariable( ActorElement, Name, Value );
			
			//	temp - text uniform = textcontent
			if ( Name == `Text` )
				ActorElement.textContent = Value;
		}
	}
	
	async LoadActor(Name,Actor,ParentElement)
	{
		let Element = document.createElement('div');
		let ParentId = ParentElement.id ? `${ParentElement.id}-` : '';
		Element.id = `${ParentId}${Name}`;
		Element.className = 'Actor';
		this.SetActorUniforms( Element, Actor.Uniforms );
		ParentElement.appendChild( Element );
	}
	
	async LoadActors(Actors,ParentElement)
	{
		if ( !Actors )
			return;
		if ( !ParentElement )
			ParentElement = this.ActorParentElement;

		for ( let ActorName in Actors )
		{
			let Actor = Actors[ActorName];
			await this.LoadActor( ActorName, Actor, ParentElement );
			await this.LoadActors( Actor.Children );
		}
	}
	
	async UpdateThread()
	{
		//	wait for attribs to be set
		await this.OnLoadAttributesPromise;
		//	load scene json
		const Scene = await this.LoadScene();
		//	wait for DOM to create me
		await this.OnCreatedDomPromise;
		
		//	load scene elements
		let Actors = Scene.GetActors();
		await this.LoadActors(Actors);
		
		//	start anims
		//	todo: add a root animation with duration to sync with timeline-generated anims
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
		
		/*	this should move into Actor html element specific stuff */
		.Actor
		{
			/* generic vars and their defaults */
			--x:		0;
			--y:		0;
			transform:	translate3d( calc(var(--x)*1px), calc(var(--y)*1px), 0 );
			background:	lime;
			display:	inline-block;
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
