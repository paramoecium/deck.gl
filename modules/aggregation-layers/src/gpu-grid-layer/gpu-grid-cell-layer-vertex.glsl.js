// Copyright (c) 2015 - 2017 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

// Inspired by screen-grid-layer vertex shader in deck.gl

export default `\
#version 300 es
#define SHADER_NAME gpu-grid-cell-layer-vertex-shader
#define RANGE_COUNT 6

in vec3 positions;
in vec3 normals;

in vec4 colors;
in vec4 elevations;

// Custom uniforms
uniform float extruded;
uniform float cellSize;
uniform float coverage;
uniform float opacity;
uniform float elevationScale;

uniform ivec2 gridSize;
uniform vec2 gridOrigin;
uniform vec2 gridOriginLow;
uniform vec2 gridOffset;
uniform vec2 gridOffsetLow;
uniform vec4 minColor;
uniform vec4 maxColor;
uniform vec4 colorRange[RANGE_COUNT];
uniform vec2 elevationRange;
layout(std140) uniform;
uniform ColorData
{
  vec4 maxMinCount;
} colorData;
uniform ElevationData
{
  vec4 maxMinCount;
} elevationData;

#define ELEVATION_SCALE 0.8

#define EPSILON 0.00001

// Result
out vec4 vColor;

vec4 quantizeScale(vec2 domain, vec4 range[RANGE_COUNT], float value) {
  vec4 outColor = vec4(0., 0., 0., 0.);
  if (value >= (domain.x - EPSILON) && value <= (domain.y + EPSILON)) {
    float domainRange = domain.y - domain.x;
    if (domainRange <= 0.) {
      outColor = colorRange[0];
    } else {
      float rangeCount = float(RANGE_COUNT);
      float rangeStep = domainRange / rangeCount;
      float idx = floor((value - domain.x) / rangeStep);
      idx = clamp(idx, 0., rangeCount - 1.);
      int intIdx = int(idx);
      outColor = colorRange[intIdx];
    }
  }
  outColor = outColor / 255.;
  return outColor;
}

float linearScale(vec2 domain, vec2 range, float value) {
  return ((value - domain.x) / (domain.y - domain.x)) * (range.y - range.x) + range.x;
}

void main(void) {

  bool noRender = colors.r <= 0.0;

  vec2 colorDomain = vec2(colorData.maxMinCount.a, colorData.maxMinCount.r);
  vec4 color = quantizeScale(colorDomain, colorRange, colors.r);

  // TODO: discard when noRender is true
  float finalCellSize = noRender ? 0.0 : project_size(cellSize);

  float elevation = 0.0;

  if (extruded > 0.5) {
    vec2 elevationDomain = vec2(elevationData.maxMinCount.a, elevationData.maxMinCount.r);
    elevation = linearScale(elevationDomain, elevationRange, elevations.r);
    elevation = elevation  * (positions.z + 1.0) *
      ELEVATION_SCALE * elevationScale;
  }

  int yIndex = (gl_InstanceID / gridSize[0]);
  int xIndex = gl_InstanceID - (yIndex * gridSize[0]);

  vec2 instancePositionXFP64 = mul_fp64(vec2(gridOffset[0], gridOffsetLow[0]), vec2(float(xIndex), 0.));
  instancePositionXFP64 = sum_fp64(instancePositionXFP64, vec2(gridOrigin[0], gridOriginLow[0]));
  vec2 instancePositionYFP64 = mul_fp64(vec2(gridOffset[1], gridOffsetLow[1]), vec2(float(yIndex), 0.));
  instancePositionYFP64 = sum_fp64(instancePositionYFP64, vec2(gridOrigin[1], gridOriginLow[1]));
  vec3 extrudedPosition = vec3(instancePositionXFP64[0], instancePositionYFP64[0], elevation);
  vec2 extrudedPosition64xyLow = vec2(instancePositionXFP64[1], instancePositionYFP64[1]);

  vec3 offset = vec3(
    (positions.x * coverage + 1.0) / 2.0 * finalCellSize,
    (positions.y * coverage - 1.0) / 2.0 * finalCellSize,
    1.0);

  // extrude positions
  vec4 position_commonspace;
  gl_Position = project_position_to_clipspace(extrudedPosition, extrudedPosition64xyLow, offset, position_commonspace);

   if (extruded > 0.5) {
    vec3 lightColor = lighting_getLightColor(color.rgb, project_uCameraPosition, position_commonspace.xyz, normals);
    vColor = vec4(lightColor, color.a * opacity);
  } else {
    vColor = vec4(color.rgb, color.a * opacity);
  }
}
`;
