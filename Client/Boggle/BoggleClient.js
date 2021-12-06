import Pop from '../PopEngineCommon/PopEngine.js'
import {CreatePromise} from '../PopEngineCommon/PopApi.js'
import PromiseQueue from '../PopEngineCommon/PromiseQueue.js'

import BoggleElementName from './BoggleHtmlElement.js'



export default class TBoggleClient
{
	constructor()
	{
		this.UpdateQueue = new PromiseQueue(`Boggle client update queue`);
		this.Update().catch( this.OnError.bind(this) );
	}
	
	OnError(Error)
	{
		Pop.Warning(`Game error ${Error}`);
	}
	
	ElementTypeName()
	{
		return BoggleElementName;
	}
	
	async Update()
	{
		while(true)
		{
			const Job = await this.UpdateQueue.WaitForNext();
			await Job();
		}
	}
	
	UpdateState(State,Packet)
	{
		//	has this interrupted our move?
		async function Run()
		{
			//	anim change of graphics
			await this.Ui.SetState(State);
		}
		this.UpdateQueue.Push(Run.bind(this));
	}
		
	OnAction(Packet)
	{
		//	has this interrupted our move?
		//	a move was made!
		async function Run()
		{
			//	anim change of graphics
			Pop.Debug(`Show action`,Packet);
			await this.Ui.OnAction(Packet);
		}
		this.UpdateQueue.Push(Run.bind(this));
	}
	
	OnMoveRequest(Move,SendReplyAction)
	{
		//	here we should verify we understand the actions		
		async function Run()
		{
			const ActionPromises = [];

			async function WaitForSkip()
			{
				const MapSequence = await this.Ui.WaitForSkip();
				const Action = ['SkipTurn'];
				return Action;
			}
		
			async function WaitForMapSequence()
			{
				const MapSequence = await this.Ui.WaitForMapSequence();
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
		this.UpdateQueue.Push(Run.bind(this));
	}
	
	OnOtherMessage(Message)
	{
		Pop.Warning(`Got other message`,Message);
	}
}
