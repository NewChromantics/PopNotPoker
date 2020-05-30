
const StateGui = new Pop.Gui.Label('CurrentState');

function OnMessage(Message,SendReply)
{
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
