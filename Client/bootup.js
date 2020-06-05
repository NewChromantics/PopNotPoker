
//	generic/debug ui
const StateGui = new Pop.Gui.Label('CurrentState');
const ActionGui = new Pop.Gui.Label('LastAction');
const DebugGui = new Pop.Gui.Label('Debug');
const ErrorGui = new Pop.Gui.Label('Error');

const Games = {};

function AllocGame(GameType)
{
	switch(GameType)
	{
		case null:	//	not currently reporting on server
		case 'TMinesweeperGame':
			return new TMinesweeperClient();
	}
	throw `Unknown game type ${GameType}`;
}

function GetGame(Packet)
{
	//	gr: this probbaly shouldnt be under state
	const GameHash = Packet.Meta.GameHash;
	const GameType = Packet.Meta.GameType;
	if ( !GameHash )
		throw `GameHash missing`;
	
	if ( !Games.hasOwnProperty(GameHash) )
	{
		Pop.Debug(`New game! ${GameHash}:${GameType}`);
		Games[GameHash] = AllocGame(GameType);
	}
	
	return Games[GameHash];
}

function ClearMoveActionButtons()
{
	const ButtonContainer = document.querySelector('#MoveButtonContainer');
	
	//	delete old content
	while (ButtonContainer.firstChild)
		ButtonContainer.removeChild(ButtonContainer.lastChild);
}

function OnMoveRequest(Move,SendReply)
{
	ClearMoveActionButtons();
	const ButtonContainer = document.querySelector('#MoveButtonContainer');

	function SendReplyAction(ActionName,Arguments)
	{
		const Reply = {};
		Reply.Action = ActionName;
		Reply.ActionArguments = Arguments;
		SendReply(Reply);
	}
	
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
	
	ErrorGui.SetValue(Move.LastMoveError||"");
}

function OnMessage(Message,SendReply)
{
	function SendReplyWithHash(Reply)
	{
		Reply.Hash = Message.Hash;
		Reply.Command = Message.ReplyCommand;
		SendReply(Reply);
	}
	
	if ( Message.Error )
	{
		ErrorGui.SetValue(JSON.stringify(Message,null,'\t'));
	}
	
	if ( Message.Command == 'Ping' )
	{
		//	pong?
		return;
	}
	
	//	no meta, just some error message?
	if ( !Message.Meta )
	{
		DebugGui.SetValue(JSON.stringify(Message,null,'\t'));
		return;
	}
	
	const Game = GetGame(Message);

	//	update state
	if ( Message.State )
	{
		StateGui.SetValue(JSON.stringify(Message));
		Game.UpdateState(Message.State);
	}

	//	render an action
	if ( Message.Action )
	{
		ClearMoveActionButtons();
		ActionGui.SetValue(JSON.stringify(Message,null,'\t'));
		Game.OnAction(Message);
	}

	if ( Message.Command == 'Move' )
	{
		OnMoveRequest(Message.Move,SendReplyWithHash);
		function SendReplyAction(ActionName,Arguments)
		{
			const Reply = {};
			Reply.Action = ActionName;
			Reply.ActionArguments = Arguments;
			SendReplyWithHash(Reply);
		}
		return Game.OnMoveRequest(Message.Move,SendReplyAction);
	}
	else if ( Message.Command )
	{
		//throw `Unhandled command ${Message.Command}`;
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
	}
}

let ConnectTry = null;
function GetNextAddress()
{
	const Addresses = [];
	Addresses.push(['86.18.68.20',10001]);
	Addresses.push(['86.18.68.20',10002]);
	Addresses.push(['86.18.68.20',10003]);
	Addresses.push(['localhost',10001]);
	Addresses.push(['localhost',10002]);
	Addresses.push(['localhost',10003]);
	ConnectTry = (ConnectTry===null) ? 0 : ConnectTry+1;
	return Addresses[ConnectTry%Addresses.length];
}

ConnectToServerLoop(GetNextAddress,OnMessage).catch(Pop.Debug);
