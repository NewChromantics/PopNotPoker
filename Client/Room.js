import TLooterClient from './Looter/LooterClient.js'
import BoggleElementName from './Boggle/BoggleHtmlElement.js'
import TMinesweeperClient from './Minesweeper/MinesweeperClient.js'
import PromiseQueue from './PopEngineCommon/PromiseQueue.js'
/*
	<script src='PopEngineCommon/PopWebApi.js'></script>
	<script src='PopEngineCommon/PopApi.js'></script>
	<script src='PopEngineCommon/PopWebOpenglApi.js'></script>
	<script src='PopEngineCommon/PopWebGuiApi.js'></script>
	<script src='PopEngineCommon/PopWebImageApi.js'></script>
	<script src='PopEngineCommon/PopWebSocketApi.js'></script>
	<script src='PopEngineCommon/PopWebRtcApi.js'></script>
	<script src='PopEngineCommon/PopWebXrApi.js'></script>

	<!-- engine normally loads these in-code -->
	<script src='PopEngineCommon/PopMath.js'></script>
	<script src='PopEngineCommon/PopCamera.js'></script>
	<script src='PopEngineCommon/PopShaderCache.js'></script>
	<script src='PopEngineCommon/ParamsWindow.js'></script>
	<script src='bootup.js'></script>
	<script src='AssetManager.js'></script>
		<script src='Minesweeper/MinesweeperClient.js'></script>
	<script src='Boggle/BoggleClient.js'></script>
	<script src='Looter/LooterClient.js'></script>
	*/
	
	
//	generic/debug ui
const Window = null;
const StateGui = new Pop.Gui.Label(Window,'CurrentState');
const ActionGui = new Pop.Gui.Label(Window,'LastAction');
const DebugGui = new Pop.Gui.Label(Window,'Debug');
const ErrorGui = new Pop.Gui.Label(Window,'Error');




class TDebugClient
{
	constructor()
	{
		/*
		this.RenderWindow = new TMinesweeperWindow();
		this.PlayerWindow = new PlayerWindow( this.OnLocalNameChanged.bind(this) );
		*/
		this.UpdateQueue = new PromiseQueue(`Debug Client update queue`);
		this.Update();
		
		StateGui.SetVisible(true);
		ActionGui.SetVisible(true);
		DebugGui.SetVisible(true);
		ErrorGui.SetVisible(true);
	}
	
	async LoadAssets()
	{
		//	load what we need
		//await this.RenderWindow.LoadAssets();
	}
	
	async Init()
	{
	}
	
	async Update()
	{
		await this.LoadAssets();
		await this.Init();
		while(true)
		{
			const Job = await this.UpdateQueue.WaitForNext();
			await Job();
		}
	}
	
	UpdateState(State,Packet)
	{
	/*
		try
		{
			this.PlayerWindow.Update(Packet);
		}
		catch(e)
		{
			Pop.Debug(`Error updating player window ${e}`);
		}
		
		//	has this interrupted our move?
		async function Run()
		{
			//	anim change of graphics
			Pop.Debug(`Show state change`);
			
			this.RenderWindow.SetState(State);
		}
		this.UpdateQueue.Push(Run.bind(this));
		*/
	}
	
	OnAction(Packet)
	{
	/*
		this.PlayerWindow.Update(Packet);
		
		//	has this interrupted our move?
		//	a move was made!
		async function Run()
		{
			//	anim change of graphics
			Pop.Debug(`Show action`);
		}
		this.UpdateQueue.Push(Run.bind(this));
		*/
	}
	
	OnMoveRequest(Move,SendReplyAction)
	{
	/*
		this.PlayerWindow.Update(Move);
		
		//	need to update ui to do move,
		//	but needs to be a promise we can cancel in case
		//	server, say, times us out
		if ( Object.keys(Move.Actions).includes('PickCoord') )
		{
			async function Run()
			{
				//	update graphics
				//	indiciate its your turn
				this.Window.Flash(true);
				//	wait for user to click
				const ClickPos = await this.RenderWindow.WaitForClick();
				//	taken interaction
				this.Window.Flash(false);
				SendReplyAction('PickCoord',ClickPos);
			}
			this.UpdateQueue.Push(Run.bind(this));
		}
		else
		{
			throw `Minesweeper doesn't know move ${Move}`;
		}
		*/
	}
	
	OnOtherMessage(Message)
	{
		//this.PlayerWindow.Update(Message);
	}
	
}











let GameElementParent = null;
const GameHandlers = {};	//	[Game.Hash] = GameClient (being deprecated)

function AllocGameHandler(GameType)
{
	Pop.Debug(`AllocGameHandler(${GameType})`);
	switch(GameType)
	{
		//	boggle is now explicitly a html element
		case 'Boggle':
		{
			Pop.Debug(`New game element! ${BoggleElementName} ${GameType}`);
			const Element = document.createElement(BoggleElementName);
			Element.css = 'Boggle/Boggle.css';
			GameElementParent.appendChild(Element);
			return Element;
		}

		case 'TMinesweeperGame':
			return new TMinesweeperClient();
			
		case 'TLooterGame':
			return new TLooterClient();
	}
	return new TDebugClient();
	throw `Unknown game type ${GameType}`;
}

function GetGame(Packet)
{
	//	gr: this probbaly shouldnt be under state
	const GameHash = Packet.Meta.GameHash;
	const GameType = Packet.Meta.GameType;
	if ( !GameHash )
		throw `GameHash missing`;
	
	if ( !GameHandlers.hasOwnProperty(GameHash) )
	{
		Pop.Debug(`New game! ${GameHash}:${GameType}`);
		GameHandlers[GameHash] = AllocGameHandler( GameType );
	}
	
	const GameHandler = GameHandlers[GameHash];

	return GameHandler;
}

function ClearMoveActionButtons()
{
	const ButtonContainer = document.querySelector('#MoveButtonContainer');
	
	//	delete old content
	while (ButtonContainer.firstChild)
		ButtonContainer.removeChild(ButtonContainer.lastChild);
}

function OnMoveRequest(Move,SendReply,SendReplyAction)
{
	ClearMoveActionButtons();
	const ButtonContainer = document.querySelector('#MoveButtonContainer');

	//	add button for each action choice
	function AddActionButton(ActionName)
	{
		const Action = Move.Actions[ActionName];
		const Div = document.createElement('div');
		ButtonContainer.appendChild(Div);
		const Button = document.createElement('input');
		Div.appendChild(Button);
		Button.type = 'button';
		Button.value = ActionName;
		
		function MakeArgumentInput(ArgumentChoices)
		{
			const Input = document.createElement('select');
			Div.appendChild(Input);
			function AddOption(ArgumentValue)
			{
				const Option = document.createElement('option');
				Option.value = ArgumentValue;
				Option.text = ArgumentValue;
				Input.appendChild(Option);
			}
			ArgumentChoices.forEach(AddOption);
			return Input;
		}
		const ArgumentInputs = Action.Arguments.map(MakeArgumentInput);
		
		function OnClick()
		{
			const ArgumentValues = ArgumentInputs.map( i => i.value );
			SendReplyAction(ActionName,...ArgumentValues);
		}
		Button.onclick = OnClick;
	}
	try
	{
		Object.keys(Move.Actions).forEach(AddActionButton);
	}
	catch(e)
	{
		Pop.Warning(`Error setting up action UI: ${e}`);
	}
	ErrorGui.SetValue(Move.LastMoveError||"");
}

function MessageHandler(Message,SendReply,GetLocalPlayerMeta,OnPlayerMetaChanged)
{
	function SendCommand(Command,Data)
	{
		const Packet = {};
		Packet.Command = Command;
		Packet.Arguments = Data;
		SendReply(Packet);
	}
	
	function SendReplyWithHash(Reply)
	{
		Reply.Hash = Message.Hash;
		Reply.Command = Message.ReplyCommand;
		SendReply(Reply);
	}
	
	if ( Message.Error || Message.Debug )
	{
		ErrorGui.SetValue(JSON.stringify(Message,null,'\t'));
	}
	
	if ( Message.Command == 'Ping' )
	{
		//	pong?
		//	gr: when we get a ping, use that as a timer to update local player meta
		const PlayerMeta = GetLocalPlayerMeta();
		if ( PlayerMeta )
		{
			SendCommand('SetMeta',PlayerMeta);
		}
		return;
	}
	
	//	no meta, just some error message?
	if ( !Message.Meta )
	{
		DebugGui.SetValue(JSON.stringify(Message,null,'\t'));
		return;
	}
	
	const Game = GetGame(Message);

	//	update player meta
	try
	{
		OnPlayerMetaChanged(Message);
	}
	catch(e)
	{
		Pop.Error(`OnPlayerMetaChanged exception: ${e}`);
	}
	
	//	update state
	if ( Message.State )
	{
		StateGui.SetValue(JSON.stringify(Message));
		Game.UpdateState(Message.State,Message);
	}

	//	render an action
	if ( Message.Action )
	{
		ClearMoveActionButtons();
		ActionGui.SetValue(JSON.stringify(Message,null,'\t'));
		Game.OnAction(Message);
	}
	
	//	gr: should we ditch .command?
	if ( Message.Command == 'Move' )
	{
		function SendReplyAction(ActionName,Argument0,Argument1,etc)
		{
			const Reply = {};
			Reply.Action = ActionName;
			Reply.ActionArguments = Array.from(arguments).slice(1);
			SendReplyWithHash(Reply);
		}

		OnMoveRequest(Message.Move,SendReplyWithHash,SendReplyAction);
		return Game.OnMoveRequest(Message.Move,SendReplyAction);
	}
	else if ( Message.Command )
	{
		Pop.Debug(`Unhandled command ${Message.Command}`);
	}
	else
	{
		Game.OnOtherMessage(Message,SendReply);
	}

	DebugGui.SetValue(JSON.stringify(Message,null,'\t'));
}

async function ConnectToServerLoop(GetAddress,OnMessage)
{
	while(true)
	{
		try
		{
			const Address = GetAddress();
			const Socket = new Pop.Websocket.Client(...Address);
			await Socket.WaitForConnect();
			Pop.Debug(`Connected to ${Address}`);
		
			function SendMessage(Message)
			{
				const Peer = Socket.GetPeers()[0];
				Message = JSON.stringify(Message);
				Socket.Send(Peer,Message);
			}
			
			{
				const Message = {};
				Message.Command = 'Join';
				SendMessage(Message);
			}
			
			while(true)
			{
				//try
				{
					const Packet = await Socket.WaitForMessage();
					const Message = JSON.parse(Packet.Data);
					//Pop.Debug(Packet.Data);
					OnMessage(Message,SendMessage);
				}
				/*
				 catch(e)	//	gr: this includes socket disconnect, need to differentiate
				{
					Pop.Debug(`On message error; ${e}`);
					await Pop.Yield(100);
				}*/
			}
		}
		catch(e)
		{
			Pop.Debug(`ConnectToServerLoop error ${e}`);
		}
		//	without this, a code error kinda takes down chrome
		await Pop.Yield(100);
	}
}


let ConnectTry = null;
function GetNextAddress()
{
	const Addresses = [];

	//	default combinations
	let HostNames = [window.location.hostname,'localhost'];
	let Ports = [80,8000,10001,10002,10003];

	//	let user insert hostname/port
	if (Pop.GetExeArguments().Hostname)
		HostNames.splice(0,0,Pop.GetExeArguments().Hostname);
	if (Pop.GetExeArguments().Port)
		Ports.splice(0,0,Pop.GetExeArguments().Port);

	for (let Hostname of HostNames)
		for (let Port of Ports)
			Addresses.push([Hostname,Port]);

	ConnectTry = (ConnectTry === null) ? 0 : ConnectTry + 1;
	
	let Address = Addresses[ConnectTry%Addresses.length].slice();
	
	//	gr: is this the best way to get room in?
	const RoomName = Pop.GetExeArguments().Room;
	if ( RoomName )
		Address.push( RoomName );
		
	return Address;
}


export default async function RoomBootup(GetLocalPlayerName,OnPlayerMetaChanged,GameElement)
{
	GameElementParent = GameElement;
	
	let LastLocalMeta = null;
	function DoGetLocalPlayerMeta()
	{
		const Meta = GetLocalPlayerMeta(GetLocalPlayerName);

		//	return null to skip reporting changes
		const MetaChanged = JSON.stringify(Meta) != JSON.stringify(LastLocalMeta);
		LastLocalMeta = Meta;
	
		return MetaChanged ? Meta : null;
	}
	
	
	function OnMessage(Message,SendReply)
	{
		MessageHandler( Message, SendReply, DoGetLocalPlayerMeta, OnPlayerMetaChanged );
	}

	ConnectToServerLoop(GetNextAddress,OnMessage).catch(Pop.Debug);
}




let PlayerWindow = null;

	
