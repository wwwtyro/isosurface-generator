"use strict";


const Trackball = require('trackball-controller');
const mat4 = require('gl-matrix').mat4;
const vec3 = require('gl-matrix').vec3;
const ndarray = require('ndarray');
const isosurfaceGenerator = require('../index.js');


// Entrypoint.
main();


async function main() {

  const size = 128;   // The size of the density grid cube.
  const cutoff = 0.5; // The level of the isosurface we'll generate.

  // Create the density grid.
  let density = ndarray(new Float32Array(size*size*size), [size,size,size]);

  // Fill it with a few random points of density. Make the density significant so that when we
  // smooth it out later, there's plenty to go around.
  for (let i = 0; i < size*size*size*0.009; i++) {
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    const z = Math.floor(Math.random() * size);
    const dx = size/2 - x;
    const dy = size/2 - y;
    const dz = size/2 - z;
    if (dx*dx + dy*dy + dz*dz > (size/2)*(size/2)*0.9) continue;
    density.set(x, y, z, 64);
  }

  // Average out the density so that it is smoothed and merged.
  document.getElementById('fraction-label').innerHTML = 'Smoothing density...'
  for (let i = 0; i < 64; i++) {
    const densityTemp = ndarray(new Float32Array(size*size*size), [size,size,size]);
    for (let x = 1; x < size - 1; x++) {
      for (let y = 1; y < size - 1; y++) {
        for (let z = 1; z < size - 1; z++) {
          let sum = 0;
          sum += density.get(x + 0, y + 0, z + 0);
          sum += density.get(x + 1, y + 0, z + 0);
          sum += density.get(x - 1, y + 0, z + 0);
          sum += density.get(x + 0, y + 1, z + 0);
          sum += density.get(x + 0, y - 1, z + 0);
          sum += density.get(x + 0, y + 0, z + 1);
          sum += density.get(x + 0, y + 0, z - 1);
          densityTemp.set(x, y, z, sum/7);
        }
      }
    }
    density = densityTemp;
    document.getElementById('fraction').style.width = 100 * (i/64) + '%';
    await display();
  }

  // We'll add polygons from the isosurface generator to this array.
  const mesh = [];

  // Create the isosurface generator.
  const generator = isosurfaceGenerator(density, size, size, size, cutoff);

  // Generate the isosurface without locking up the UI. First, grab the current time.
  let t0 = performance.now();

  // Iterate over the isosurface generator and store the generated vertices.
  document.getElementById('fraction-label').innerHTML = 'Generating isosurface...'
  for (let data of generator) {
    // Save the vertices in our array.
    mesh.push.apply(mesh, data.vertices);
    // If more than 100ms has passed, update the progress indicator and wait for the display to update.
    if (performance.now() - t0 > 100) {
      document.getElementById('fraction').style.width = 100 * data.fraction + '%';
      await display();
      t0 = performance.now();
    }
  }

  // All done, so hide the progress indicator.
  document.getElementById('fraction').style.display = 'none';
  document.getElementById('fraction-label').style.display = 'none';

  // Center the resulting mesh on the origin.
  for (let i = 0; i < mesh.length; i++) {
    mesh[i][0] -= (size-1)/2;
    mesh[i][1] -= (size-1)/2;
    mesh[i][2] -= (size-1)/2;
  }

  // Calculate normals for each vertex.
  const normals = [];
  for (let i = 0; i < mesh.length/3; i++) {
    const q = i * 3;
    const v0 = mesh[q + 0];
    const v1 = mesh[q + 1];
    const v2 = mesh[q + 2];
    const v0v1 = vec3.sub([], v1, v0);
    const v0v2 = vec3.sub([], v2, v0);
    const n = vec3.cross([], v0v1, v0v2);
    vec3.normalize(n, n);
    normals.push(n);
    normals.push(n);
    normals.push(n);
  }

  // Grab our canvas.
  const canvas = document.getElementById('render-canvas');

  // Create our regl object.
  const regl = require('regl')({
    canvas: canvas,
    extensions: ['OES_element_index_uint'],
  });

  // Create the render command.
  const render = regl({
    vert: `
      precision highp float;
      attribute vec3 position;
      attribute vec3 normal;
      uniform mat4 model, view, projection;
      varying vec3 vNormal;
      void main() {
        gl_Position = projection * view * model * vec4(position, 1);
        vNormal = (model * vec4(normal, 1)).xyz;
      }
    `,
    frag: `
      precision highp float;
      varying vec3 vNormal;
      void main() {
        vec3 n = normalize(vNormal);
        float c = dot(n, normalize(vec3(1,1,1))) + 0.5;
        gl_FragColor = vec4(n * c, 1.0);
      }
    `,
    attributes: {
      position: mesh,
      normal: normals,
    },
    uniforms: {
      model: regl.prop('model'),
      view: regl.prop('view'),
      projection: regl.prop('projection'),
    },
    viewport: regl.prop('viewport'),
    cull: {
      enable: true,
      face: 'back'
    },
    count: mesh.length
  });

  // Create a trackball controller for our scene.
  var trackball = new Trackball(canvas, {
    drag: 0.01
  });

  // Give the trackball controller a little initial spin.
  trackball.spin(13,11);

  // Render the scene nonstop.
  function loop() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    const model = trackball.rotation;
    const view = mat4.lookAt([], [0, 0, size * 2], [0, 0, 0], [0,1,0]);
    const projection = mat4.perspective([], Math.PI/4, canvas.width/canvas.height, 0.1, 1000);

    render({
      model: model,
      view: view,
      projection: projection,
      viewport: {x: 0, y: 0, width: canvas.width, height: canvas.height},
    });

    requestAnimationFrame(loop);

  }

  loop();
}


// Utility function that allows waiting for the display to be updated.
function display() {
  return new Promise(resolve => {
    requestAnimationFrame(resolve);
  });
}
