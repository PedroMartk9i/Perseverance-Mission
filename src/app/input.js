/**
 * Estado del teclado. Se consulta, no se suscribe: el bucle de simulacion
 * pregunta el estado en cada frame, que es lo correcto para movimiento
 * continuo. Un listener por pulsacion daria un movimiento a saltos.
 */
export function createInput(target = window) {
  const pressed = new Set();

  const onDown = (e) => {
    pressed.add(e.code);
    // Las flechas hacen scroll en algunos navegadores aunque el body no lo tenga.
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  };
  const onUp = (e) => pressed.delete(e.code);
  const onBlur = () => pressed.clear(); // si se pierde el foco, nada queda pegado

  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);

  const axis = (positive, negative) => (pressed.has(positive) ? 1 : 0) - (pressed.has(negative) ? 1 : 0);

  return {
    /** +1 adelante (W), -1 atras (S) */
    get throttle() {
      return axis('KeyW', 'KeyS') || axis('ArrowUp', 'ArrowDown');
    },
    /** +1 izquierda (A), -1 derecha (D) */
    get steer() {
      return axis('KeyA', 'KeyD') || axis('ArrowLeft', 'ArrowRight');
    },
    get boost() {
      return pressed.has('ShiftLeft') || pressed.has('ShiftRight');
    },
    get active() {
      return pressed.size > 0;
    },
  };
}
