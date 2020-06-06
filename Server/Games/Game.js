

function isFunction(functionToCheck)
{
	return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
}

class TGame
{
	constructor()
	{
		this.Players = [];
		
		//	keep a record of last-playing players
		//	then when we need the next player, we pick someone not in the list
		//	if all exhausted, we know the player who hasn't had a go for the longest
		this.LastPlayers = [];
		//	we still need to keep the current one as we get next player, but doesnt
		//	move along until end of turn
		this.NextPlayer = null;
	}
	
	GetPublicState(PrivateState)
	{
		//	don't modify object that has come in
		const State = {};
		Object.assign(State,PrivateState);
		delete State.Private;
		
		State.NextPlayer = this.NextPlayer;
		
		return State;
	}

	AddPlayer(PlayerHash)
	{
		this.Players.push(PlayerHash);
		return "Some player meta for game";
	}
	
	DeletePlayer(PlayerHash)
	{
		//	cut player out
		Pop.Debug(`Players before delete; ${this.Players} ... deleting ${PlayerHash}`);
		this.Players = this.Players.filter( p => p!=PlayerHash );
		Pop.Debug(`Players are now; ${this.Players} after deleting ${PlayerHash}`);
	}
	
	//	this gets the next player, but does NOT move it along
	//	in case move is not completed. EndPlayerTurn() moves it along
	GetNextPlayer()
	{
		if ( !this.Players.length )
			throw `GetNextPlayer: No players to choose from`;
		
		//	player still pending
		if ( this.NextPlayer !== null )
			return this.NextPlayer;
		
		//	cull any players that have left from the played list
		function IsPlayer(Player)
		{
			return this.Players.some( p => p==Player );
		}
		this.LastPlayers = this.LastPlayers.filter(IsPlayer.bind(this));
		
		//	go through players to see if one hasn't played
		for ( let i=0;	i<this.Players.length;	i++ )
		{
			const Player = this.Players[i];
			//	already played
			if ( this.LastPlayers.some( p => p==Player ) )
				continue;
			//	hasn't played, set active
			this.NextPlayer = Player;
			return Player;
		}
		
		//	everyone has played, take the oldest one and return it
		const FiloPlayer = this.LastPlayers.shift();
		this.NextPlayer = FiloPlayer;
		return FiloPlayer;
	}
	
	EndPlayerTurn(ExpectedPlayer=null)
	{
		if ( this.NextPlayer === null )
			throw `EndPlayerTurn(${ExpectedPlayer}) expecting no null-nextplayer`;
		
		//	make sure we're ending the right player
		if ( this.NextPlayer != ExpectedPlayer )
			throw `EndPlayerTurn(${ExpectedPlayer}) should be ${this.NextPlayer}`;
		
		//	put this player at the end of the list
		this.LastPlayers.push(this.NextPlayer);
		this.NextPlayer = null;
	}
	
	async WaitForNextMove()			{	throw `Game has not overloaded WaitForNextMove`;	}
	async InitNewPlayer(PlayerHash)	{	throw `Game has not overloaded InitNewPlayer`;	}
}
