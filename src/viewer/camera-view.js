import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { failure } from '../shared/model.js';
export function validateCameraView(input) {
  for (const key of ['target', 'direction', 'up']) {
    if (!Array.isArray(input[key]) || input[key].length !== 3 || !input[key].every(Number.isFinite)) {
      throw failure('INVALID_ARGUMENT', key + ' must contain three finite coordinates');
    }
  }
  if (!(Number.isFinite(input.radius) && input.radius >= 2 && input.radius <= 1000)) {
    throw failure('INVALID_ARGUMENT', 'Camera radius must be 2–1000 Å');
  }
  const direction = Vec3.normalize(Vec3(), input.direction);
  const up = Vec3.normalize(Vec3(), input.up);
  if (Vec3.magnitude(input.direction) < 1e-6 || Vec3.magnitude(input.up) < 1e-6 ||
      Vec3.magnitude(Vec3.cross(Vec3(), direction, up)) < 0.001) {
    throw failure('INVALID_ARGUMENT', 'Camera direction and up must be nonzero and nonparallel');
  }
  return {target: input.target, direction, up, radius: input.radius};
}
export function setCameraView(engine, input) {
  const view = validateCameraView(input);
  const canvas = engine.plugin.canvas3d;
  canvas.commit(true);
  const snapshot = canvas.camera.getInvariantFocus(view.target, view.radius, view.up, view.direction);
  canvas.setProps({cameraFog: {name: 'off', params: {}}, cameraClipping: {radius: 0, far: false, minNear: 1}});
  canvas.camera.setState(snapshot, 0);
  canvas.camera.transition.finish(canvas.camera.transition.target);
  canvas.requestDraw();
  return view;
}
