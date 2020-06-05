precision highp float;
varying vec2 uv;

uniform sampler2D Texture;

void main()
{
	float4 Sample = texture2D( Texture, uv );
	gl_FragColor = Sample;
}


