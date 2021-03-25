precision highp float;
varying vec2 uv;

uniform sampler2D Texture;
uniform sampler2D FontTexture;
uniform float2 GridSize;

#define STATE_HIDDEN	0
#define STATE_REVEALED	255
#define MINE_NUMBER		255
#define FONT_CHAR_COUNT	11

//	todo: better function name
int SampleFloatToInt(float f)
{
	//	on ios (or ES2) proper int support isn't required, plus we have float innaccuracies
	//	even with high precision
	//	so int(f) or int(floor(f)) can sometimes not distinguish samples
	//	we offset the float slightly to fix it
	return int( floor( f * 255.5 ) );
}

float3 GetNumberColour(int Number)
{
	float f = 1.0;
	float h = 0.7;
	float l = 0.5;
	float3 Colours[10];
	Colours[0] = float3(0,0,0);
	Colours[1] = float3(0,0,f);
	Colours[2] = float3(h,0,0);
	Colours[3] = float3(0,l,0);
	Colours[4] = float3(f,h,0);
	Colours[5] = float3(h,0,h);
	Colours[6] = float3(0,f,0);
	Colours[7] = float3(f,0,0);
	Colours[7] = float3(f,0,0);
	Colours[8] = float3(f,f,0);

	//return Colours[ Number % 10 ];
	//if ( Number > 10 )
	//	Number -= 10;
	//return Colours[ Number ];
	for ( int i=0;	i<10;	i++ )
		if ( Number == i )
			return Colours[i];
	return Colours[0];
}

void GetGridValue(out int NeighbourCount,out bool IsMine,out bool IsHidden)
{
	//	gr:I thought the uv sampling might be at texel edge causing bad read, but its not that
	//float2 SampleUv = floor(uv * GridSize) / GridSize;
	//SampleUv += float2(0.5,0.5) / GridSize;
	float2 SampleUv = uv;
	float4 Sample = texture2D( Texture, SampleUv );
	NeighbourCount = SampleFloatToInt(Sample.x);
	int State = SampleFloatToInt(Sample.y);
	IsMine = NeighbourCount == MINE_NUMBER;
	IsHidden = State == STATE_HIDDEN;
}

float Range(float Min,float Max,float Value)
{
	return (Value-Min) / (Max-Min);
}

float3 GetNormalYellowGreenBlue(float Normal)
{
	if ( Normal < 0.333 )
	{
		Normal = Range( 0.0, 0.333, Normal );
		return float3( 1.0-Normal, 1.0, 0.0 );
	}
	else if ( Normal < 0.666 )
	{
		Normal = Range( 0.333, 0.666, Normal );
		return float3( 0.0, 1.0, Normal );
	}
	else
	{
		Normal = Range( 0.666, 1.0, Normal );
		return float3( 0.0, 1.0-Normal, 1.0 );
	}
}

float2 GetFontUv(int Number,float2 LocalUv)
{
	float u = LocalUv.x;
	float v = (float(Number)+LocalUv.y) / float(FONT_CHAR_COUNT);
	return float2(u,v);
}


#define Whitef		1.0
#define LightGreyf	0.8
#define MidGreyf	0.6
#define DarkGreyf	0.4
#define Blackf		0.0
#define White		float3(Whitef,Whitef,Whitef)
#define LightGrey	float3(LightGreyf,LightGreyf,LightGreyf)
#define MidGrey		float3(MidGreyf,MidGreyf,MidGreyf)
#define DarkGrey	float3(DarkGreyf,DarkGreyf,DarkGreyf)
#define Black		float3(Blackf,Blackf,Blackf)


float3 GetTileColour(int Number,bool Hidden,float2 LocalUv)
{
	//	highlight/lowlight
	float3 HighOut = !Hidden ? Black : White;
	float3 HighIn = !Hidden ? DarkGrey : LightGrey;
	float3 LowOut = !Hidden ? White : Black;
	float3 LowIn = !Hidden ? LightGrey : DarkGrey;
	float3 Inside = MidGrey;
	float Border = 0.1;
	float InnerBorder = 0.4;
	//if ( !Pressed )
	{
		//if ( LocalUv.x < Border || LocalUv.y < Border )
		//	return LightGrey;
	}
	
	LocalUv.x = mix( -Border, 1.0+Border, LocalUv.x);
	LocalUv.y = mix( -Border, 1.0+Border, LocalUv.y);
	/*
	if ( LocalUv.x < -Border/2.0 || LocalUv.y < -Border/2.0 )
		return HighOut;
	if ( LocalUv.x > 1+(Border/2.0) || LocalUv.y > 1+(Border/2.0) )
		return LowOut;
	 */
	if ( min(LocalUv.x,LocalUv.y) < 0.0 )
		return HighIn;
	if ( max(LocalUv.x,LocalUv.y) > 1.0 )
		return LowIn;

	LocalUv.x = mix( -InnerBorder, 1.0+InnerBorder, LocalUv.x);
	LocalUv.y = mix( -InnerBorder, 1.0+InnerBorder, LocalUv.y);
	if ( LocalUv.x < 0.0 || LocalUv.y < 0.0 )
		return Inside;
	if ( LocalUv.x > 1.0 || LocalUv.y > 1.0 )
		return Inside;

	if ( Number == 0 )
	{
		return Inside;
	}
	if ( Hidden )
	{
		return Inside;
	}
	
	if ( Number == MINE_NUMBER )
		Number = 10;
	
	float3 FontColour = GetNumberColour(Number);
	float2 FontUv = GetFontUv( Number, LocalUv );
	float FontSample = texture2D( FontTexture, FontUv ).x;
	return mix( MidGrey, FontColour, FontSample );
}

const bool Debug_Font = false;
const bool Debug_FontTexture = false;
const bool Debug_Data = false;
const bool Debug_Hidden = false;

void main()
{
	int NeighbourCount;
	bool IsMine;
	bool IsHidden;
	GetGridValue( NeighbourCount, IsMine, IsHidden );

	if ( IsHidden && Debug_Hidden )
	{
		float2 xy = uv * GridSize;
		float2 LocalUv = fract( xy );
		gl_FragColor = float4(LocalUv,1.0,1.0);
		return;
	}		

	if ( Debug_Font )
	{
		float2 xy = uv * GridSize;
		int x = int(floor(uv.x * GridSize.x));
		int y = int(floor(uv.y * GridSize.y));
		x += y*int(GridSize.x);
		float2 LocalUv = fract( xy );
		gl_FragColor = float4(LocalUv,0.0,1.0);
		gl_FragColor.xyz = GetTileColour(x,false,LocalUv);
		//gl_FragColor.xyz = GetTileColour(IsHidden?4:1,false,LocalUv);
		return;
	}
	
	if ( Debug_FontTexture )
	{
		float4 Sample = texture2D( FontTexture, uv );
		gl_FragColor = Sample;
		return;
	}
	
	if ( Debug_Data )
	{
		float4 Sample = texture2D( Texture, uv );
		gl_FragColor = Sample;
		
		int x = SampleFloatToInt(Sample.x);
		if ( x == 0 )			gl_FragColor.xyz = float3(1,0,0);
		else if ( x == 1 )		gl_FragColor.xyz = float3(1,1,0);
		else if ( x == 2 )		gl_FragColor.xyz = float3(0,1,0);
		else if ( x == 3 )		gl_FragColor.xyz = float3(0,1,1);
		else if ( x == 4 )		gl_FragColor.xyz = float3(0,0,1);
		else if ( x == 255 )	gl_FragColor.xyz = float3(0,0,0);
		/*
		 if ( x == 0.0/255.0 )
		 gl_FragColor.xyz = float3(1,0,0);
		 else if ( Sample.x == (1.0/255.0) )
		 gl_FragColor.xyz = float3(1,1,0);
		 else if ( Sample.x > (1.0/255.0) )
		 gl_FragColor.xyz = float3(1,0,1);
		 else if ( Sample.x == (2.0/255.0) )
		 gl_FragColor.xyz = float3(0,1,0);
		 else if ( Sample.x == (3.0/255.0) )
		 gl_FragColor.xyz = float3(0,1,1);
		 else if ( Sample.x == (4.0/255.0) )
		 gl_FragColor.xyz = float3(0,0,1);
		 else if ( Sample.x == (255.0/255.0) )
		 gl_FragColor.xyz = float3(0,0,0);
		 */
		//gl_FragColor.y = 0.0;
		//gl_FragColor.z = 0.0;
		gl_FragColor.w = 1.0;
		return;
	}

	float2 xy = uv * GridSize;
	float2 LocalUv = fract( xy );

	gl_FragColor = float4(LocalUv,0.0,1.0);
	gl_FragColor.xyz = GetTileColour(NeighbourCount,IsHidden,LocalUv);
	gl_FragColor.w = 1.0;
	/*
	float4 Sample = texture2D( Texture, uv );
	Sample.x = Sample.x != 0 ? 1 : 0;
	Sample.y = Sample.y != 0 ? 1 : 0;
	//gl_FragColor = float4(uv,0,1);
	gl_FragColor = Sample;
	 */
	/*
	float2 FontUv = GetFontUv( 3, uv );
	gl_FragColor = texture2D( FontTexture, FontUv );
	 */
}


