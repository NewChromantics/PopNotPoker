export const SceneElementName = 'pop-scene';
export default SceneElementName;

import {CreatePromise} from '../PopEngineCommon/PopApi.js'
import Timeline_t from '../PopEngineCommon/Timeline.js'

//	HTML animation api uses this key as the % time in the animation, so we can't use it as a uniform
const HtmlKeyframeTimeKeyword = 'offset';	
//	our own special case (temporary fix until we do specialised elements)
const TextContentUniformKeyword = 'Text';

function UniformsToCssUniforms(Uniforms)
{
	//	bundle all transforms into one variable
	let Transforms = [];
	
	//	output
	const CssUniforms = {};
	
	for ( let Name in Uniforms )
	{
		let Value = Uniforms[Name];
		
		//	catch transforms
		switch ( Name )
		{
			case 'x':	Transforms.push(`translateX(${Value}px)`);	break;
			case 'y':	Transforms.push(`translateY(${Value}px)`);	break;
			case 'z':	Transforms.push(`translateX(${Value}px)`);	break;
			case 'Scale':	Transforms.push(`scale(${Value})`);	break;
			
			default:break;
		}
		
		//	handle special cases
		switch ( Name )
		{
			//	keywords that dont change
			case TextContentUniformKeyword:
			case HtmlKeyframeTimeKeyword:
				break;
			
			//	by default turn into css variable
			default:
				Name = `--${Name}`;
				break;
		}
		
		CssUniforms[Name] = Value;
	}

	if ( Transforms.length )
		CssUniforms['transform'] = Transforms.join(' ');
		
	return CssUniforms;
}


//	turn a timeline into a structure we can use as a css animation
//	https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API
//	output as {} [ActorName] = uniforms
//	for 0% 10% etc use .offset = 0.10
function TimelineToHtmlKeyframes(Timeline,Timing)
{
	function SplitActorNameAndUniform(UniformName)
	{
		const Parts = UniformName.split('/');
		if ( Parts.length < 2 )
			throw `Uniform ${UniformName} needs at least to be Actor/Uniform`;
		const Uniform = Parts.pop();
		const Name = Parts.join('/');
		return [Name,Uniform];
	}
	
	const DurationMs = Timeline.GetDurationMs();
	Timing.duration = DurationMs;
	
	//	output is expected to be dictionary[actorname]
	//	with an array of keyframes, inside of which is a uniform/value set
	const ActorKeyframes = {};
	
	function GetActorKeyframe(ActorName,Time)
	{
		if ( !ActorKeyframes[ActorName] )
		{
			ActorKeyframes[ActorName] = [];
		}
		//	floating point errors here?
		let Keyframe = ActorKeyframes[ActorName].find( k => k[HtmlKeyframeTimeKeyword] == Time );
		if ( !Keyframe )
		{
			Keyframe = {};
			Keyframe[HtmlKeyframeTimeKeyword] = Time;
			ActorKeyframes[ActorName].push(Keyframe);
		}
		return Keyframe;
	}
	
	function AddUniform(Time,ActorName,Uniform,Value)
	{
		let ActorKeyframe = GetActorKeyframe( ActorName, Time );
		if ( Uniform == HtmlKeyframeTimeKeyword )
			throw `Cannot use keyword ${HtmlKeyframeTimeKeyword} as a uniform`;
		
		ActorKeyframe[Uniform] = Value;
	}
	
	function AddKeyframe(Keyframe)
	{
		//	convert to fraction for anim
		const TimeOffset = Keyframe.Time / DurationMs;
		
		for ( let UniformKey in Keyframe.Uniforms )
		{
			const [ActorName,UniformName] = SplitActorNameAndUniform( UniformKey );
			const Value = Keyframe.Uniforms[UniformKey];
			AddUniform( TimeOffset, ActorName, UniformName, Value );
		}
	}
	
	Timeline.Keyframes.forEach( AddKeyframe );
	
	//	do HTML specific tweaks here
	//	eg; .x and .y -> transform: translate(x,y)
	for ( let ActorName in ActorKeyframes )
	{
		const Keyframes = ActorKeyframes[ActorName];
		const CssKeyframes = Keyframes.map( UniformsToCssUniforms );
		ActorKeyframes[ActorName] = CssKeyframes;
	}
	
	return ActorKeyframes;
}

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
		return 10 * 1000;
	}
	
	GetTimeline()
	{
		//	need to work out which timeline to return
		//	pass in a scene time?
		return this.Timelines[0];
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
		Uniforms = UniformsToCssUniforms( Uniforms );
		for ( let Name in Uniforms )
		{
			let Value = Uniforms[Name];
			
			//	gr: only setting a css variable to match use of animation
			//SetElementVariable( ActorElement, Name, Value );
			ActorElement.style.setProperty(Name,Value);

			//	special case (for now?)
			if ( Name == TextContentUniformKeyword )
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
	
	GetActorElement(Name)
	{
		//	name can be a path like
		//	Tree/Branch/Leaf
		//	we are currently generating id's in LoadActor()
		//	this may need to be better later
		const Parent = this.ActorParentElement;
		const ChildMatch = Parent.querySelector(`#${Name}`);
		return ChildMatch;
	}
	
	ApplyAnimations(Timeline)
	{
		const Timing = {};
		Timing.duration = 1*1000;
		Timing.iterations = Infinity;	//	or Infinity to loop
		Timing.iterations = 1;	//	or Infinity to loop
		Timing.fill = 'forwards';	//	fill empty frames forward. this stops the animation on last frame
		
		//	convert timeline to actor-specifc @keyframes
		const ActorKeyframes = TimelineToHtmlKeyframes(Timeline,Timing);
		for ( const ActorName in ActorKeyframes )
		{
			const Keyframes = ActorKeyframes[ActorName];
			if ( !Array.isArray(Keyframes) )
				throw `Keyframes for actor ${ActorName} from timeline should be array of objects`;
			const ActorElement = this.GetActorElement(ActorName);
			if ( !ActorElement )
			{
				console.warn(`No element named ${ActorName} from timeline`);
				continue;
			}
			
			//	https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API
			const Animator = ActorElement.animate( Keyframes, Timing );
			//Animator.pause();
			//Animator.play();
			//Animator.finish();	//	jump to end
			//Animator.cancel();	//	stops and removes animator
			//Animation.currentTime = 1 * 1000;	//	set time in ms
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
		const Timeline = Scene.GetTimeline();
		this.ApplyAnimations( Timeline );
		
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
			/* gr: properties cannot be animated, but they're here for easy use */
			/*transform:	translate3d( calc(var(--x)*1px), calc(var(--y)*1px), 0 );*/
			--x:		0;
			--y:		0;
			
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
