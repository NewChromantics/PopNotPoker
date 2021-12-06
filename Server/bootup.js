import Pop from './PopEngineCommon/PopEngine.js'
import {ParseExeArguments} from './PopEngineCommon/PopApi.js'

Pop.Debug("PopNotPoker room booting up");

import RoomWebSocketServer from './Room.js'

Pop.Debug("importing boggle.js");

import Boggle from './Games/Boggle.js'



async function RunGameRoomLoop(Room,GameClass)
{
	while(true)
	{
		Pop.Debug(`New Game!`);

		const Game = new GameClass();
		Room.OnStartGame(Game.GameTypeName);
		//	for players still in room from a previous game, turn them back into waiting
		//	players so they go through the same joining routine
		Room.DeactivatePlayers();
		
		
		//	gr: this func could call the lambda and retry automatically
		async function SendMoveAndWait(Player,Move)
		{
			//	gr: todo: verify Move's Actions here
			//	need;	.Lambda
			//			.Arguments = array of arrays(options) for each param to lambda
			//	eg;		.Lambda = Pick(Number,Animal) .Arguments = [ [0,1,2], [cat,dog] ]
			const Reply = await Room.SendToPlayerAndWaitForReply('Move', Player, Move );
			return Reply;
		}
		
		function OnStateChanged()
		{
			//	send state to all players
			const State = Game.GetPublicState();
			Room.SendToAllPlayers('State',State);
		}
		
		function OnAction(Action)
		{
			Pop.Debug(`On Action ${JSON.stringify(Action)}`);
			OnStateChanged();
			Room.SendToAllPlayers('Action',Action);
		}
		
		//	auto wait-for-enough players before we start the loop
		//	so every game starts with enough players and doesnt need extra code
		while ( !Game.HasEnoughPlayers() )
		{
			Pop.Debug(`Game waiting for players. WaitForPlayerJoinRequest`);
			await Room.WaitForPlayerJoinRequest();
		
			//	do the synchronous player update
			Room.EnumNewPlayers( Game.AddPlayer.bind(Game), Game.DeletePlayer.bind(Game) );
			OnStateChanged();
		}
		
		Pop.Debug(`Starting game ${Game.Players}`);
		
		//	run the async game
		const GameEndPromise = Game.RunGame( SendMoveAndWait, OnStateChanged, OnAction );
		
		//	wait for the game to end, or players to join, or all players to leave and abort game
		let EndOfGameWinners = undefined;
		while( !EndOfGameWinners )
		{
			//	wait for something to happen, if the return of the promise is
			//	not empty, then it's the game-winners
			//	gr: if we get a game event, but lose the player request notification, that's okay
			//		as the game will exit, and we'll just check over players again on the next game
			const PlayersChangedPromise = Room.WaitForPlayerJoinRequest();
			const Events = [GameEndPromise,PlayersChangedPromise];
			
			EndOfGameWinners = await Promise.race(Events);
			Pop.Debug(`GameEnd/PlayersChanged race=${EndOfGameWinners}`);

			//	do the synchronous player update
			Pop.Debug(`Room.EnumNewPlayers`);
			Room.EnumNewPlayers( Game.AddPlayer.bind(Game), Game.DeletePlayer.bind(Game) );
			
			//	if not enough players, forfeit game, or pause?
			if ( !Game.HasEnoughPlayers() )
			{
				Pop.Debug(`Game doesn't have enough players, breaking game loop`);
				break;
			}
		}
		
		Pop.Debug(`Game finished; EndOfGameWinners=${EndOfGameWinners}`);

		//	game exited with no winner (ie, game aborted)
		if ( !EndOfGameWinners )
			EndOfGameWinners = [];
		
		Room.SendToAllPlayers('EndOfGame',EndOfGameWinners);
		
		//	report generic win
		Room.IncreasePlayerWins(EndOfGameWinners);
		
		//	game exit! 
		//	let room loop around so same players can start a new game
		//	if everyone has quit, then exit (and exit process)
		
		if ( Game.Players.length == 0 )
		{
		//	Pop.Debug(`All players left. Exiting`);
		//	return;
		}
		
	}
}


function CreateClientHttpServer(ServePath,Port=0)
{
	function HandleVirtualFile(Response)
	{
		//	return a filename to redirect
		const Filename = Response.Url;
		return `${ServePath}/${Filename}`;
	}
	const Http = new Pop.Http.Server(Port,HandleVirtualFile);
	return Http;
}


//	native doesn't yet convert args to dictionary
const Args = ParseExeArguments( Pop.GetExeArguments() );
Pop.Debug(`Args=${JSON.stringify(Args)}`);
//	need a global to stop server being garbage collected
let ClientHttpServer = null;


function StartClientHttpServer(ServerHost,ServerPort,ServerRoom)
{
	if ( !Args.HttpServer )
	{
		Pop.Debug(`HttpServer not enabled`);
		return;
	}
	
	if ( !ClientHttpServer )
	{
		const ServePath = Args.HttpServer;
		ClientHttpServer = CreateClientHttpServer(ServePath);
	
		//	don't keep popping this up in case we get stuck in a loop	
		const HttpAddress = ClientHttpServer.GetAddress()[0].Address;
		const Url = `http://${HttpAddress}/Room.html?Hostname=${ServerHost}&Port=${ServerPort}&Room=${ServerRoom}`;
		Pop.Debug(`Show url ${JSON.stringify(HttpAddress)}`);
		Pop.Debug(Url);
		Pop.ShowWebPage(Url);
	}
}


function OnListening(Addresses)
{
	const Address0 = Addresses[0].Address;
	const AddressAndPort = Address0.split(':');					
	const ListeningPort = AddressAndPort[1];

	Pop.StdOut(`Listening on ${ListeningPort}`);
	
	try
	{
		//Pop.ShowWebPage(`http://localhost:${ListeningPort}`);
	}
	catch(e)
	{
	}
	
	StartClientHttpServer('localhost',ListeningPort,'No room name');
}

async function RunGameLoop()
{
	Pop.Debug(`RunGameLoop()`);
	
	//const GameClass = TMinesweeperGame;
	const GameClass = Boggle;
	//const GameClass = TLooterGame;

	const Ports = [0];
	Pop.Debug(`new RoomWebSocketServer()`);
	const Room = new RoomWebSocketServer(Ports,OnListening);

	await RunGameRoomLoop(Room,GameClass);
	Pop.ExitApplication(0);		
}

function OnGameLoopError(Error)
{
	Pop.Warning(`Game Loop Error; ${Error}`);
	Pop.ExitApplication(1);
}

RunGameLoop().catch(OnGameLoopError);


