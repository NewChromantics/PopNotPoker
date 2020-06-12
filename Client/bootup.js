
class DebugGameClient
{
	constructor()
	{
		//	generic/debug ui
		this.StateGui = new Pop.Gui.Label('CurrentState');
		this.ActionGui = new Pop.Gui.Label('LastAction');
		this.DebugGui = new Pop.Gui.Label('Debug');
		this.ErrorGui = new Pop.Gui.Label('Error');
	}
	
	ClearMoveActionButtons()
	{
		const ButtonContainer = document.querySelector('#MoveButtonContainer');
		
		//	delete old content
		while (ButtonContainer.firstChild)
			ButtonContainer.removeChild(ButtonContainer.lastChild);
	}

	Show()
	{
		const DebugContainer = document.querySelector('#DebugGui');
		DebugContainer.style.display = 'block';
	}
	
	UpdateState(State,Message)
	{
		this.StateGui.SetValue(JSON.stringify(State,null,'\t'));
	}
	
	OnAction(Message)
	{
		this.ClearMoveActionButtons();
		this.ActionGui.SetValue(JSON.stringify(Message,null,'\t'));
	}
	
	OnMoveRequest(Move,SendReplyAction)
	{
		this.ClearMoveActionButtons();
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
				SendReplyAction(ActionName,ArgumentValues);
			}
			Button.onclick = OnClick;
		}
		Object.keys(Move.Actions).forEach(AddActionButton);
		
		this.ErrorGui.SetValue(Move.LastMoveError||"");
	}
	
	OnOtherMessage(Message,SendReply)
	{
		this.DebugGui.SetValue(JSON.stringify(Message,null,'\t'));
	}
}

const Games = {};
let DebugGame = new DebugGameClient();

function AllocGame(GameType,SendCommand)
{
	switch(GameType)
	{
		case 'TMinesweeperGame':
			return new TMinesweeperClient(SendCommand);
	}
	throw `Unknown game type ${GameType}`;
}

function GetGame(Packet,SendCommand)
{
	//	gr: this probbaly shouldnt be under state
	const GameHash = Packet.Meta.GameHash;
	const GameType = Packet.Meta.GameType;
	if ( !GameHash )
		throw `GameHash missing`;
	
	if ( !Games.hasOwnProperty(GameHash) )
	{
		Pop.Debug(`New game! ${GameHash}:${GameType}`);
		Games[GameHash] = AllocGame( GameType, SendCommand );
	}
	
	return Games[GameHash];
}


function OnMessage(Message,SendReply)
{
	function SendCommand(Command,Data)
	{
		const Packet = {};
		Packet.Command = Command;
		Packet.Arguments = Data;
		SendReply(Packet);
	}
	
	if ( Message.Command == 'Ping' )
	{
		//	pong?
		return;
	}

	
	if ( Message.Error || Message.Debug )
	{
		Pop.Debug(`Message Error/Debug ${JSON.stringify(Message,null,'\t')}`);
		//ErrorGui.SetValue(JSON.stringify(Message,null,'\t'));
	}
	//	no meta, just some error message?
	if ( !Message.Meta )
	{
		Pop.Debug(`Message no meta ${JSON.stringify(Message,null,'\t')}`);
		//DebugGui.SetValue(JSON.stringify(Message,null,'\t'));
		return;
	}
	
	
	//	set the debug game
	let Game = DebugGame;
	try
	{
		Game = GetGame(Message,SendCommand);
	}
	catch(e)
	{
		DebugGame.Show();
	}

	//	update state
	if ( Message.State )
	{
		DebugGame.UpdateState(Message.State,Message);
		Game.UpdateState(Message.State,Message);
	}

	//	render an action
	if ( Message.Action )
	{
		DebugGame.OnAction(Message);
		Game.OnAction(Message);
	}
	
	//	gr: should we ditch .command?
	if ( Message.Command == 'Move' )
	{
		function SendReplyAction(ActionName,Arguments)
		{
			const Reply = {};
			Reply.Action = ActionName;
			Reply.ActionArguments = Arguments;
			Reply.Hash = Message.Hash;
			Reply.Command = Message.ReplyCommand;
			SendReply(Reply);
		}
		DebugGame.OnMoveRequest(Message.Move,SendReplyAction);
		Game.OnMoveRequest(Message.Move,SendReplyAction);
		return;
	}
	else if ( Message.Command )
	{
		Pop.Debug(`Unhandled command ${Message.Command}`);
	}
	else
	{
		DebugGame.OnOtherMessage(Message,SendReply);
		Game.OnOtherMessage(Message,SendReply);
	}

	//DebugGui.SetValue(JSON.stringify(Message,null,'\t'));
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
	let HostNames = ['FoxDrop.NewChromantics.com','localhost'];
	let Ports = [10001,10002,10003,10001];

	//	let user insert hostname/port
	if (Pop.GetExeArguments().Hostname)
		HostNames = [Pop.GetExeArguments().Hostname];
	if (Pop.GetExeArguments().Port)
		Ports = [Pop.GetExeArguments().Port];

	for (let Hostname of HostNames)
		for (let Port of Ports)
			Addresses.push([Hostname,Port]);

	ConnectTry = (ConnectTry === null) ? 0 : ConnectTry + 1;
	return Addresses[ConnectTry%Addresses.length];
}

ConnectToServerLoop(GetNextAddress,OnMessage).catch(Pop.Debug);
