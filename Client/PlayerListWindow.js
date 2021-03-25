class TPlayerWindow
{
	constructor(InitialName,OnLocalNameChanged)
	{
		this.Window = new Pop.Gui.Window('Players',['65vmin','30vmin','30vmin','60vmin']);
		this.MovePlayer = null;
		this.PlayerLabels = {};
		this.LastState = null;
		
		//	add an edit box for your name
		const Rect = this.GetTextBoxRect(0);
		this.LocalName = new Pop.Gui.TextBox(this.Window,Rect);
		this.LocalName.SetValue(InitialName);
		this.LocalName.OnChanged = OnLocalNameChanged;
		
		//	add labels for other players as they come & go
		OnLocalNameChanged(InitialName);
	}
	
	GetTextBoxRect(Index)
	{
		const Border = 5;
		const Width = 100;
		const Height = 20;
		const x = Border;
		const y = Border + ((Border+Height)*Index);
		return [x,y,Width,Height];
	}
	
	
	UpdatePlayerList(Players)
	{
		const CurrentPlayer = this.LastState ? this.LastState.NextPlayer : null;
		
		//	create/update labels
		function UpdatePlayerLabel(Player)
		{
			const Hash = Player.Hash;
			if ( !this.PlayerLabels.hasOwnProperty(Hash) )
				this.PlayerLabels[Hash] = new Pop.Gui.Label(this.Window,[0,0,40,20]);

			const Label = this.PlayerLabels[Hash];

			let LabelText = `${Player.Meta.Name} (<b>${Player.Score}</b>)`;
			if ( Player.State == 'Waiting' )	LabelText += ' joining...';
			if ( Player.State == 'Ghost' )		LabelText += ' &#9760;';	//	skull
			if ( Player.Hash == CurrentPlayer )	LabelText += ' &larr;';	//	left arrow
			for ( let i=0;	i<Player.Wins;	i++ )
				LabelText += '&#11088;';	//	star
			Label.SetValue(LabelText);
		}
		Players.forEach(UpdatePlayerLabel.bind(this));
		
		//	re-set all positions
		function SetLabelRect(Hash,Index)
		{
			const Label = this.PlayerLabels[Hash];
			//	+1 as we're using 0 for our name atm
			const Rect = this.GetTextBoxRect(Index+1);
			Label.SetRect(Rect);
		}
		Object.keys(this.PlayerLabels).forEach(SetLabelRect.bind(this));
		
	}
	
	Update(Packet)
	{
		//Pop.Debug(`Extract players from`,Packet);
		if ( Packet.State )
			this.LastState = Packet.State;
	
		if ( !Packet.Meta )
			return;
		
		//	server should send this struct
		const Players = [];
		const PushPlayer = function(Player,State)
		{
			Player.State = State;
			Player.Score = 0;
			Players.push(Player);
		}.bind(this);
		
		function GetPlayer(Hash)
		{
			return Players.filter(p=>p.Hash==Hash)[0];
		}
		
		Packet.Meta.ActivePlayers.forEach( p => PushPlayer(p,'Active') );
		Packet.Meta.WaitingPlayers.forEach( p => PushPlayer(p,'Waiting') );
		Packet.Meta.DeletedPlayers.forEach( p => PushPlayer(p,'Ghost') );
		Packet.Meta.DeletingPlayers.forEach( p => PushPlayer(p,'Ghost') );

		//	look for ghosts in the score list
		//	plus set their scores
		if ( this.LastState && this.LastState.Scores )
		{
			for ( let [Hash,Score] of Object.entries(this.LastState.Scores))
			{
				if ( !GetPlayer(Hash) )
				{
					const GhostPlayer = {};
					GhostPlayer.Hash = Hash;
					GhostPlayer.Meta.Name = `${Hash} Ghost`;	//	we don't know their name any more
					PushPlayer(GhostPlayer,'Ghost');
				}
				const Player = GetPlayer(Hash);
				Player.Score = Score;
			}
		}
		
		//	look for ghosts who have labels but no score
		//	(don't need this once we can delete labels)
		function MarkLabelDead(Hash)
		{
			if ( GetPlayer(Hash) )
				return;
			const GhostPlayer = {};
			GhostPlayer.Hash = Hash;
			GhostPlayer.Meta.Name = `${Hash} Ghost`;	//	we don't know their name any more
			PushPlayer(GhostPlayer,'Ghost');
		}
		Object.keys(this.PlayerLabels).forEach(MarkLabelDead.bind(this));
		

		this.UpdatePlayerList(Players);
	}
}
