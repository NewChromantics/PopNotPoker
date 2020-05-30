
const StateGui = new Pop.Gui.Label('CurrentState');

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
}

function OnMessage(Message,SendReply)
{
	function SendReplyWithHash(Reply)
	{
		Reply.Hash = Message.Hash;
		Reply.Command = Message.ReplyCommand;
		SendReply(Reply);
	}

	if ( Message.Command == 'MoveRequest' )
	{
		return OnMoveRequest(Message.Move,SendReplyWithHash);
	}
	else if ( Message.Command == 'Ping' )
	{
		//	pong?
		return;
	}
	else if ( Message.Command )
	{
		//throw `Unhandled command ${Message.Command}`;
	}
	
	if ( Message.Action )
	{
		ClearMoveActionButtons();
		StateGui.SetValue(JSON.stringify(Message,null,'\t'));
		return;
	}
	
	StateGui.SetValue(JSON.stringify(Message,null,'\t'));
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
					Pop.Debug(Packet.Data);
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
	Addresses.push(['localhost',10001]);
	Addresses.push(['localhost',10002]);
	Addresses.push(['localhost',10003]);
	Addresses.push(['localhost',10004]);
	Addresses.push(['localhost',10005]);
	Addresses.push(['localhost',10006]);
	Addresses.push(['localhost',10007]);
	ConnectTry = (ConnectTry===null) ? 0 : ConnectTry+1;
	return Addresses[ConnectTry%Addresses.length];
}

ConnectToServerLoop(GetNextAddress,OnMessage).catch(Pop.Debug);
